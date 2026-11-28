# Plugins

Keep configuration and custom plugins in your application repository. Updating the Pages CMS dependency does not overwrite them.

## Register plugins

Register installed or local plugins once in your application’s `pagescms.config.ts`:

```ts
import { defineConfig } from 'pagescms'
import example from 'a-pagescms-plugin'
import local from './plugins/local.ts'

export default defineConfig({
  target: 'node', // or 'cloudflare'
  plugins: [example(), local()],
})
```

Those plugin names are illustrative. Install published plugins in the consuming application's package.json; import local plugins directly. Neither requires editing core. `pagescms dev`, `pagescms build`, `pagescms start` (Node) and `pagescms preview` use this config without a separate Vite config. The optional `pagescms/vite` integration is available when the application needs its own Vite configuration. Adding executable plugin code requires a new production build. Restart development after changing plugin registration; edits to loaded UI modules use Vite hot reload. Runtime secrets are not build options. Keep `.pagescms/`, `dist/`, local state and secret files out of version control. The Node build runs with the application’s installed dependencies; it is not a standalone binary.

To select the bundled SMTP plugin, register it in that same config:

```ts
import { defineConfig } from 'pagescms'
import { smtp } from 'pagescms/plugins/smtp'

export default defineConfig({ target: 'node', plugins: [smtp()] })
```

Set `SMTP_HOST`, `SMTP_FROM`, and, when authentication is required, `SMTP_USER` and `SMTP_PASSWORD` in the runtime environment. Optional `SMTP_PORT` defaults to 587; `SMTP_SECURE` accepts `true` or `false` (port 465 defaults to secure). SMTP is Node-only and selecting it for Cloudflare fails before runtime.

A plugin's descriptor entry imports `definePlugin` from `pagescms` and references its implementation modules with `new URL('./server.mjs', import.meta.url)`. Descriptors have an `id`, optional `server`, `shared`, `client` and `migrations` paths, supported `targets`, server-build JSON `options` (written into generated files, never use these for secrets), and explicit browser-visible `publicOptions`. Published descriptor entries must be JavaScript, with TypeScript declarations for authors. The descriptor must not import runtime-only dependencies. Types for `ServerPluginModule`, `SharedPluginModule` and `ClientPluginModule` are exported from `pagescms`. The build rejects duplicate IDs and incompatible targets before loading runtime implementations.

- `server` exports a factory returning the existing server plugin interface. Its `create(environment)` receives runtime settings and secrets.
- `shared` exports a factory returning pure field definitions. These can run on either side.
- `client` exports a factory returning lazy field editors/views and supported UI contributions. These contributions run in the browser.

A plugin is registered once even when it contributes all three. Components appear only through supported slots. Collaborator-management and repository-sidebar slots accept one contribution each. Account settings accepts an array of section contributions. Plugins can register lazy repository admin pages with `repositoryPages: { settings: { label: "Settings", load: () => import("./settings") } }`. An optional synchronous `loading` component supplies lightweight placeholders while the workspace or page module loads; it receives optional repository coordinates, account ID, and `HeaderActions` and must not require account or repository data. Reuse it for the page’s initial data loading. Pages without it use the generic settings skeleton. Page links appear under Admin for existing repository managers, at `/github/$owner/$repo/$branch/settings`. An optional `icon` component supplies a decorative SVG for the navigation link; omitted icons use the default settings glyph. Each page may also provide a lazy `badge` component, receiving the same context, for a non-interactive status inside its navigation link. Badge loading never blocks the page. An optional lazy `navigation` component receives the repository context plus `children` (the complete menu entry). Return `children` to contribute it, or `null` to omit it entirely. Core renders the entry immediately while that component loads. Conditions belong to the plugin; server endpoints still enforce access independently. Page names use lowercase letters, numbers and hyphens. Internal IDs remain namespaced by plugin. An optional `path` overrides the public slug (for example `connections: { path: "storage", ... }`). Public slugs must be unique across enabled plugins and cannot shadow core destinations or prefixes; collisions fail deployment composition. The page and sidebar receive the verified repository context and signed-in account ID. Server endpoints must still enforce their own access; hiding a component is not authorization. Account sections compose across plugins. Core field validation and UI loaders are joined by field name. Server-only entry points are blocked from browser output. Keep application server modules under `src/server`; name plugin server-only helpers `*.server.ts` (or the corresponding JavaScript extension) so the build guard also protects them.

Resend is the fallback when no registered plugin supplies an email provider. An explicit email provider replaces that fallback; two explicit providers fail composition. This is the same plugin registration mechanism, not an email-specific environment switch.

`pagescms migrate` applies installed core migrations followed by plugin migrations. Node uses `DATABASE_URL` and optional `CACHE_DATABASE_URL`. Migration defaults to development env files; use `pagescms migrate --mode production` for `.env.production`. Explicit process environment variables take precedence. `--mode` also selects env files for dev, build, start and preview; build/start/preview default to production. Each plugin migration directory uses Drizzle SQLite SQL files and `meta/_journal.json`; plugin migrations affect only the application database and retain independent journals. Use `--local` to require local SQLite or local D1. Cloudflare uses the development `.wrangler/state` by default. Use `--remote` to apply core and plugin migrations to deployed D1. Core Node uses `__drizzle_migrations`; core D1 uses `__pagescms_core_d1_migrations`; Plugin IDs are persistent migration identities: renaming an ID does not rename its journal, and removing a plugin does not delete its data. Plugin journals are `__pagescms_<id>_migrations` and `__pagescms_<id>_d1_migrations` (hyphens become underscores).

Run `pnpm test:package` from core to reproduce the independent tarball proof. Use `PAGESCMS_TEST_WORKSPACE=1 pnpm test:package` to exercise a nested pnpm workspace with dependencies outside the application directory. Temporary application files and logs are retained at the printed path. The existing checkout-based commands remain available while release packaging and consumer migration are completed.

## Server contributions

- `policies`: authorization and discovery together. All policies must allow a request; discovery intersects their results. Core establishes repository admission first. An explicit `delegatedOperations` grant can delegate supported operations, such as action execution, to an admitted collaborator. Installing a plugin alone grants nothing.
- `emailProvider`: one selected delivery provider implementing `send(message)`.
- `mediaProviderResolver`: one selected storage/delivery resolver. Git storage remains the default. Resolvers receive the validated media configuration in `selection.media.configuration`, including plugin-contributed properties. Plugins interpret their own properties and must throw when an explicit selection cannot be resolved; core never interprets provider-specific settings.
- `routes`: namespaced HTTP endpoints at `/api/plugins/<plugin-id>/<path>`, with an explicit method and access level.
- `beforeAccountDelete`: ordered guards run before deletion. A failure aborts deletion.

Duplicate plugin IDs, providers, routes, field registrations or occupied UI slots fail composition. Authorization errors fail closed. Discovery controls presentation; direct requests still authorize independently. `PAGESCMS_REQUIRE_ACCESS_POLICY=true` requires a configured policy at startup.

Routes declare `public`, `user`, `repository` or `manager` access. Authenticated mutations require the configured application Origin. Browser contributions should send `x-pagescms-account` with their current account ID; core rejects a mismatch before dispatch, protecting requests from stale account views. Repository routes supply `owner`, `repo`, `branch` and optional `repoId` query parameters; core resolves admission before calling the handler. A `public` handler receives the untouched request and must implement its own authentication, such as signature verification for a webhook. Never use public access as a shortcut for session-authenticated mutations.

## Email

The default build registers Resend when its credentials are configured; without email credentials, GitHub authentication remains available. Partial Resend configuration is rejected. Alternative exports implement the same interface:

- `pagescms/plugins/email/smtp.server`: Node.js SMTP using Nodemailer. Defaults to STARTTLS on port 587; `secure: true` selects TLS on port 465. Supply credentials from the server environment. This adapter is for Node deployments.
- `pagescms/plugins/email/cloudflare.server`: Cloudflare Email Service binding. Register `cloudflareEmail({ binding: 'MAIL', from: 'cms@example.com' })`; provision the binding and verified sending domain separately.
- `pagescms/plugins/email/resend.server`: the default Resend adapter.

Select one provider. Delivery failures propagate to the caller; adapters do not automatically retry. SMTP can partially deliver a message addressed to several recipients. Core notifications send to one recipient at a time.

## UI and membership

`ui.repositoryCollaborators` replaces the collaborator page through a lazy component receiving repository coordinates, the signed-in `accountId` and the shared header-actions component. Core remounts the contribution when the account or repository scope changes. Without it, the standard collaborator page renders. A replacement owns its data: core does not also load the standard collaborator list. Its lazy module may export `preload(props, queryClient): Promise<void>` to prefetch data during browser navigation. Key queries by account and repository scope, use `prefetchQuery` for in-page error handling, and reuse the same query in the component. Every API request must independently authorize access. `ui.accountSettings` accepts `[{ id: "example", label: "Example", order: 10, load: () => import("./account") }]` for the `/settings#example` section. IDs must be unique and cannot shadow built-in account sections. An optional `icon` component supplies a decorative navigation icon; omitted icons use the settings glyph. Components receive `accountId`. These are presentation hooks; server endpoints authorize independently.

Server plugins that issue durable credentials can implement `revokeCredentials(userId)`. Return SQL statements for the application database. Core executes them in the same transaction as admin session revocation. A null user ID selects every user. Retain client registrations and operation history, and check the issuing session when creating new credentials.

The core membership service owns admission and stable membership IDs. Extensions own their tables and migrations and can reference a membership ID for additional data. A revoked membership stays revoked; reinviting creates a new ID. Do not link access assignments by email, since that would resurrect old assignments. The invitation service runs a persistence callback after creating the membership and before notification; a failed callback revokes the new membership. An extension that assigns access must deny unassigned memberships during that interval.

Use exported UI primitives and `pagescms/lib/notifications` for consistent presentation. Give each action one error owner: use `notifyError` for manually owned actions, or let the shared mutation boundary report it. A caller that catches the failure to retain form state must not notify again or render the same error as an alert. Use explicit delegation when a controller owns Retry or conflict review. Pass the initiating account to manual notifications. Keep field validation inline and failed reads in `OperationError`; see the [UI contribution guidelines](../../AGENTS.md#ui). Custom field definitions and lazy components register through the browser-safe plugin manifest; the same pure definitions participate in server-side value handling.

## Verification

Run `pnpm typecheck`, `pnpm test`, and `pnpm test:package`. The package check installs core with local and packaged plugins and verifies runtime behavior and client/server isolation. Media adapters can reuse `pagescms/deployment/conformance/media-storage`. Application migrations never scan sibling directories.

## Contributor checkout

The standalone contributor application needs no external module. Select server and browser entry points at build time with `PAGESCMS_DEPLOYMENT_SERVER` and `PAGESCMS_DEPLOYMENT_CLIENT`; both use deployment API version 5. No filesystem scanning or runtime discovery occurs.

```ts
import { definePagesCmsServerDeployment } from 'pagescms/deployment/contracts/server.server'
import { DEPLOYMENT_API_VERSION } from 'pagescms/deployment/contracts/version'
import { smtpEmail } from 'pagescms/plugins/email/smtp.server'

export default definePagesCmsServerDeployment({
  apiVersion: DEPLOYMENT_API_VERSION,
  plugins: [
    smtpEmail({
      host: 'localhost',
      port: 1025,
      requireTLS: false,
      from: 'cms@example.com',
    }),
  ],
})
```

Set both entry-point selectors together; a server-only integration can use the default client entry or an empty `definePagesCmsClientDeployment({ apiVersion: DEPLOYMENT_API_VERSION })`.

Each server plugin has a unique `id` and a `create(environment)` factory. Browser plugins use the same explicit registration pattern, with pure definitions and lazy UI imports. Keep credentials and server modules out of browser entry points.

The contributor checkout applies two TanStack patches that suppress error/disconnect logging. Installed consumers use the upstream packages; this affects log noise, not application behavior.

Media resolvers may return a promise. Selection includes the verified repository ID when available, so integrations can retain provider bindings through renames. A resolver error propagates; only a null result selects the default provider.

Repository pages may set a finite numeric `order` to position their Admin menu entry. Built-in positions are Configuration (10), Collaborators (20), Actions (30), and Cache (40). Extensions default to 100; equal positions retain registration order. Ordering does not change access checks or conditional navigation.

Shared plugin modules may contribute configuration schema changes under `configurationSchema.media`. Each property uses `action: 'add'`, `action: 'replace'`, or `action: 'remove'`; additions and replacements provide `schema: (z) => ...`, receiving native Zod 4. Use the supplied schema factory argument; compatibility-namespace Zod v3 schemas are not accepted. Contributions are composed once for editor diagnostics, media-property completion, and server validation. Multiple plugins cannot change the same property. The core `name`, `input`, and `output` properties cannot be changed because media runtime requires them. This extension point currently covers only media properties; modifying a schema alone does not implement corresponding runtime behavior.

Direct-upload adapters receive the authorized canonical `path` in both `directUpload.complete({ path, ticket, parts? })` and `directUpload.abort({ path, ticket })`. Verify the ticket signature and compare its bound path before any storage side effects. Reject mismatches before completing multipart uploads, promoting staged objects, deleting staged objects, or aborting multipart sessions. Core retains its result-path check as a second check; checking only the returned path is too late. This changes the adapter contract, not the browser HTTP request format.

Media adapters must not follow redirects on authenticated storage requests or migrations. Browser direct uploads reject redirects too. Validate user-configured destinations when saving and before use; provider display labels do not establish endpoint trust. The shared preview route applies sandbox and no-sniff headers to successes, conditional responses, and errors.

### Configuration editor contribution

`ui.configurationEditor` lazily contributes the configuration setup area and header controls with one shared component instance. Its component receives `{ accountId, owner, repo, branch, repoId?, source, disabled, onChange, setup?, renderActions? }`. `setup` contains the default OSS alert only while the draft is ready and empty; retain it when the extension is unavailable, or replace it inline with a richer setup alert. `renderActions(content)` places shared actions in the header. Pending imports show a neutral setup skeleton; failed imports restore the default setup and leave manual editing usable. Contributions must also distinguish pending availability checks from confirmed unavailability, rather than flashing the default setup while loading. `source` is the current unsaved YAML; `onChange(source)` updates that draft without saving. Respect `disabled`, request confirmation before replacing existing work, scope requests and notifications by account and repository, and independently authorize every server request. Core remounts the contribution on account/repository/branch changes and retains the normal validation and Save flow. OSS owns no generation service, model, credentials or usage policy. `pagescms/shared/configuration-source` exports the composed deployment validator for proposals.

Background plugin tasks can import `requireRepositoryManager` and `resolveRepositoryPrincipal` from `pagescms/plugins/server` to repeat the same admission and policy authorization as manager HTTP routes; a previously authorized request is not a permanent grant. The shared `pagescms/components/code-editor` export supports `readOnly` previews without disabled styling and can be lazy-loaded with a matching skeleton.

Configuration editor contributions can use `onBusyChange` to make the editor read-only and disable Save while preparing a replacement. Clear the busy state on completion, failure, cancellation, and unmount. The setup slot remains available until the configuration has a saved revision.

## Mounted handlers, auth and standalone pages

Server plugins may contribute `handlers` for exact paths or terminal `/*` prefixes. Each handler declares HTTP methods and receives the real request plus `{ services, requestId }`. Core rejects overlapping mounts and reserved auth/editor routes. The same request middleware dispatches them on Node and Workers before file routing. These mounts authenticate and authorize independently; they do not inherit a browser session grant. Public metadata handlers do not initialize auth unless they use it. Handlers that explicitly access `services.auth.$context` must await it within the request.

`auth: { plugins, schema }` augments the existing Better Auth instance and adapter schema at construction. Core model names and built-in plugin IDs are reserved. Auth plugin objects must be compatible with the installed Better Auth version. Do not create a second auth instance or fabricate sessions for bearer requests.

On Cloudflare, `/api/*` and `/.well-known/*` reach the Worker automatically. Add other mounted handler paths, such as `/mcp`, to `assets.run_worker_first` in `wrangler.jsonc`.

Client plugins may contribute `pages: { [name]: { path, title, load, loading? } }` at explicit absolute paths such as `/oauth/consent`. Core root namespaces, including `github` and `teams`, are reserved for both pages and mounted handlers. Repository pages live below `/github/{owner}/{repo}/{branch}/{page}`; standalone pages reserve their own top-level namespace. Modules stay lazy and client-only, with standard loading boundaries. Their `search` prop preserves the original query string, including repeated parameters and exact values; do not reconstruct externally signed queries from the router’s parsed search object. The module factory must pass `pages` through the package runtime like other contributions. `ui.accountSettings` sections compose across plugins, sorted by optional `order` (default 100), with stable plugin order for ties.

`pagescms/server/services` exports sessionless authorized content, media, action and repository operations shared with the API. Callers supply the current account and real request services. The operations resolve repository admission and apply access policies again. External adapters should authenticate credentials, narrow scopes and enforce their own usage policies before calling these operations; core owns no external credential or commercial quota behavior.

Account section contributions can provide a synchronous `loading` component for the pending section body. Core renders the registered section label and keeps each section in its own Suspense/error boundary. Keep these components small and free of requests or assumed account values; reuse the same static field/table composition as the loaded section. Hosted owns its concrete pending bodies.

Application operations normalize content paths, media paths and upload parents before authorization. Batch media delivery checks each requested path. Media rename and move check both canonical source and destination paths after schema confinement and before storage effects, with the destination also supplied as `facts.newPath`. A path-scoped policy must allow both ends. Fixed-file writes check the named resource before reading configuration, then authorize its resolved physical path; do not replace either check with the other. Upload content digests remain available to configured policies; the built-in unrestricted gateway skips them because it has no reservation or fingerprint consumer. Action discovery without an operation and explicit action capabilities remain independent policy decisions.

Credential fallback replays mutation callbacks under the selected credentials. Resolve policy principals inside each callback attempt; a principal from an earlier request or a preflight check is not a grant for the replay. Fixed-file resource preflight remains outside the write, but final physical-path authorization is repeated inside every attempt. Plugin authorization policies cannot supply resource-accounting hooks; composition rejects `reserve` and `settle` rather than treating them as supported metering.

Policies may implement `authorizeMany(requests)` to return one decision per input in the same order. The gateway accepts at most 1,000 requests, rejects malformed result counts, and throws the first denial in input order before the caller performs any work. Without the optional method it calls `authorize` in order and stops at the first denial. Composition uses batches only when every constituent policy supports them; otherwise the individual policy chain is retained. Delegated grants remain separate for every request. Batch methods may reuse read inputs only during that invocation, never decisions across operations, mutations or credential retries. Repository identity is resolved per address within the batch, while every supplied `repoId` is validated. Wrappers adding authorization restrictions must apply them to both individual and batch entrypoints. Media delivery uses this batch path while continuing to authorize each requested file.

### Image delivery and variants

`MediaStorage` owns listing and reading originals. `MediaDelivery.resolve` issues direct URL leases; its optional `resolveAssets({ assets, variant })` can mint derivative URLs from server-verified asset identities without resolving raw source URLs. Core supports the names `original`, `thumbnail`, `card` and `preview`; a deployment owns its actual dimensions and processing. Unhandled variants fall back to ordinary direct delivery.

A delivery provider may implement `preview({ asset, variant, read })`. Core invokes it inside the authenticated, per-path-authorized preview endpoint, checks the requested revision against the manifest, and verifies the version returned by `read()` before allowing the provider to cache those bytes. Providers must check their own current entitlements before every internal cache lookup. Use `mediaPreviewUrl` to issue protected URLs; never make private endpoint responses publicly cacheable. The preview result may supply the transformed `contentType`. `MediaPreviewUnavailableError` reports temporary processor saturation with HTTP 503; revision mismatches return 409.

The shared client binding batches visible image URL requests per directory and variant, caches leases in the request's QueryClient, renews expiring capabilities, and explicitly bypasses server URL caches after failures. Mounted images retain their existing source when file identity is unchanged and do not renew URLs merely because a loaded image expires. A provider that cannot identify the content version must return `cacheKey: null`, rather than a path pretending to be a version; explicit mutation invalidation then reloads that image. URL caches are per tab. This is not a persistent image-byte cache and does not guarantee download reuse across unmounts or signed-URL changes. The generic rich-text image binder changes display DOM only; serialization retains stable document values. Original previews and renewal require no deployment extension.

## Plugin-owned interface translations

Core owns its UI catalogs. Each plugin owns its own catalogs and registers public, static compiled messages through its client factory. There is one request-scoped Lingui provider for the whole application; plugins must use that provider rather than creating a global instance or another provider.

```ts
import { msg } from '@lingui/core/macro'
import type { ClientPluginModule } from 'pagescms'

const title = msg({ id: 'example.page.settings', message: 'Example settings' })

export default (() => ({
  translations: {
    en: () => import('./locales/en/messages.mjs'),
    fr: () => import('./locales/fr/messages.mjs'),
  },
  repositoryPages: {
    example: { label: title, load: () => import('./settings') },
  },
})) satisfies ClientPluginModule
```

Keep editable PO files in the plugin package and run its own Lingui extraction/compilation before publishing. Use `compileNamespace: 'es'` (or `lingui compile --namespace es`) for the named `messages` export. Ship compiled catalogs and transformed component JavaScript with the plugin; consumers need no plugin-specific PO configuration. Use Lingui 6 compatible with the app, declare `@lingui/core` and `@lingui/react` as peer dependencies, and keep them and React external to plugin bundles. Pages CMS deduplicates those runtimes. The core package's Vite integration also transforms Lingui macros in source plugins.

Every message ID must start with the registered plugin ID plus a dot, including component messages. Use explicit IDs in macros; automatically generated hashes are not namespaced. Translatable repository-page labels, account-section labels and standalone-page titles accept `{ id, message }` descriptors. Literal strings remain literal, including repository-authored labels. Registered descriptor IDs must exist as nonempty English messages. For components, use `useLingui` from `@lingui/react` and resolve the plugin's descriptors through `i18n._`, or use the React macros with explicit IDs. Use the router’s locale instance for reactive translations.

English is required whenever a plugin declares translations. Missing locales, missing translated keys and empty translated messages fall back to English. A loader failure, malformed catalog, foreign namespace or core-message collision rejects the language change rather than partially activating it. Catalogs load in parallel before activation; switching uses the same merged messages without reloading repository data. Catalogs must contain only public static copy, never credentials, account data or access-dependent content.

Test every shipped locale in the plugin's CI, including English fallback and registered labels. Configure `sourceLocale: 'en'` and `fallbackLocales: { default: 'en' }`, and use strict compilation. Run `lingui extract --overwrite` when source copy changes and add `lingui check sync --overwrite` to CI to catch source messages missing from the catalogs. The independent package proof exercises compiled plugin catalogs without a PO configuration, French language switching, reactive plugin labels/components, and retained editor input and component state on both Node and local Cloudflare.

Plugins can optionally register `errors: () => import('./known-errors').then(module => module.errors)`. Each entry maps a canonical app-owned diagnostic to a descriptor whose ID belongs to the plugin namespace. Optional `pattern` and `values` capture stable interpolation fields; keep names, paths and external provider details as data. The generic notification and error components translate recognized diagnostics using the current request/provider instance, without rewriting stored errors or server control-flow messages. Diagnostic chunk failures fall back to the canonical message. Test all locales for matching interpolation names and plural types as well as compilation.
