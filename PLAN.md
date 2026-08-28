# Pages CMS TanStack Start Overhaul

Status: implementation in progress; broad local parity present, performance measurement and cutover acceptance outstanding

Branch: `overhaul/tanstack-start`

Legacy baseline: Pages CMS `2.1.8` at commit `6f4e860`
Last updated: 2026-08-27

## 1. Purpose

Rebuild Pages CMS as a clean TanStack Start application at the repository root. The existing Next.js application is frozen under [`_legacy/`](./_legacy/) and serves as the behavioral reference until the replacement reaches parity.

This is a new implementation of the application shell, routing, data loading, client caching, server boundaries, testing, deployment, and documentation. It is not permission to casually change established Pages CMS content semantics, GitHub behavior, permissions, database data, or public contracts.

The overhaul should produce an application that is:

- substantially faster during initial load and navigation;
- predictable about loading, stale data, refresh, and invalidation;
- deployable and supportable on Cloudflare Workers;
- testable at the unit, integration, contract, and browser levels;
- smaller and more deliberate about dependencies and bundles;
- organized around explicit feature, client, shared, and server boundaries;
- documented well enough that a contributor can understand the system without reverse-engineering it;
- capable of supporting extension points, hosted paid plans, proprietary feature modules, and future multiplayer editing without maintaining a fork or implementing unnecessary infrastructure now.

## 2. Repository strategy

The repository root is reserved for the new TanStack Start application using the structure recommended by the current TanStack Start template and documentation.

```text
_legacy/                 Frozen Next.js application and historical reference
src/
  routes/                TanStack Start file-based routes
  components/            Reusable presentation components
  features/              Feature-owned UI, queries, mutations, and schemas
  lib/                   Shared client-safe utilities
  server/                Server-only domain services and adapters
  router.tsx             Router construction
  server.ts              Cloudflare-compatible server entry
  start.ts               Start middleware/configuration when required
public/                   Static assets for the new application
tests/                    Cross-feature and browser-level tests
```

The exact scaffold must follow the then-current official TanStack Start Cloudflare template. We will not create a monorepo, an `apps/web` wrapper, or an internal package hierarchy unless a demonstrated need appears later.

### Legacy rules

1. `_legacy/` remains runnable long enough to inspect and compare behavior.
2. New application code must not import modules directly from `_legacy/`.
3. When behavior is ported, first identify its inputs, outputs, side effects, authorization rules, and failure modes.
4. Add tests or fixtures that describe the behavior before or alongside the new implementation.
5. Copy only the logic still wanted. Rewrite framework-coupled or poorly bounded code rather than preserving its shape.
6. Do not fix unrelated legacy defects unless they prevent us from understanding or validating required behavior.
7. Delete `_legacy/` only after the cutover criteria in this plan are satisfied.

## 3. Baseline

The baseline was captured before any TanStack scaffold was introduced.

### Repository baseline

| Measure | Current value |
|---|---:|
| Release | `2.1.8` |
| UI pages | 18 |
| Layouts | 5 |
| Route handlers | 18 |
| TypeScript lines in `app`, `components`, `contexts`, `lib`, and `fields` | 33,203 |
| Modules marked `use client` | 103 |
| Client page modules | 12 of 18 |
| Runtime dependencies | 65 |
| Development dependencies | 15 |
| Existing unit-test suite | Effectively none |

### Baseline checks

| Check | Result | Notes |
|---|---|---|
| TypeScript | Fails | Missing `input-otp` dependency/types cause errors in the OTP components. |
| Next.js production build | Fails | Cannot resolve `input-otp`. The build itself was run with `npx next build` so the legacy `postbuild` migration was not executed. |
| ESLint source | Passes with warnings | Source-only lint has 0 errors and 15 warnings. The legacy `npm run lint` also traverses generated Vinext output in `dist/`, so the package script is not a useful source-only baseline. |
| Unit tests | Unavailable | No meaningful suite exists. |
| Browser tests | Unavailable | No automated critical-journey suite exists. |
| Cloudflare deployment | Unavailable | The legacy Next.js application has no supported production Workers configuration. |

Generated Vinext output from an earlier local experiment was preserved under `_legacy/` but is not part of the supported baseline.

### Observed architectural constraints

- The field registry combines shared schema/serialization behavior with every React edit/view component. This makes server-safe imports and field-level code splitting difficult.
- Heavy editors such as CodeMirror and Tiptap are reachable through eager field registration.
- Many pages are client components and fetch after render through SWR or local effects.
- Nested layouts coordinate session, token, repository, and configuration work through framework-specific boundaries.
- Client navigation state is spread across React contexts, SWR, route state, and component-local caches.
- PostgreSQL is both application storage and the durable GitHub read cache.
- Several process-memory maps perform best-effort deduplication or TTL caching. These cannot be authoritative on Workers.
- Several legacy cache refreshes use unawaited promises whose completion is not guaranteed on request-scoped runtimes.
- Email providers are bundled together, including SMTP/Nodemailer even when deployments only use an HTTP provider.
- Database construction reads process environment at module scope and retains assumptions from the long-lived Next.js runtime.
- Large feature and route files obscure ownership and make isolated testing difficult.

## 4. Goals and success criteria

### 4.1 Performance

Performance is an architectural acceptance criterion, not a final optimization pass.

The new application must:

- preserve the stable application shell during repository and branch navigation;
- preload likely route code and critical data on intent where safe;
- run independent loader work in parallel and avoid component-driven waterfalls;
- render cached TanStack Query data immediately and revalidate it without replacing the current page;
- use route-specific skeletons only when no useful cached data exists;
- use optimistic updates where rollback is safe and understandable;
- split heavyweight editors, field implementations, admin features, and optional providers;
- avoid duplicate session, token, repository, configuration, and collection requests during one navigation;
- measure client bundle size, Worker bundle size, navigation latency, request counts, and GitHub API usage in CI or repeatable local tooling.

Initial budgets will be finalized after the new shell is measurable. Until then, these are provisional guardrails:

| Budget | Provisional target |
|---|---:|
| Worker compressed bundle | At least 20% below the selected Cloudflare plan limit |
| Initial route JavaScript | No heavyweight editor code |
| Cached client navigation | No blocking full-page loader |
| Duplicate identical requests per navigation | Zero |
| Skeleton behavior | Shown only after a short anti-flicker threshold and only without usable cached data |
| GitHub refreshes | Conditional, deduplicated, and scoped to the affected resource |

We will record p50 and p95 values for representative local and deployed journeys before locking numeric latency budgets.

### 4.2 Correctness and testing

All new behavior must have proportional automated coverage:

- unit tests for pure domain logic, path handling, configuration normalization, serialization, validation, operations, and cache-key construction;
- integration tests for database repositories, authentication boundaries, GitHub adapters, cache invalidation, webhooks, and provider adapters;
- server-route and server-function contract tests for status codes, response bodies, authorization, validation, and failures;
- Playwright tests for critical user journeys;
- deployment smoke tests for the standard application build on each supported target, plus focused runtime tests only if platform capabilities are deliberately introduced later.

Coverage percentages are secondary to scenario coverage. Nevertheless, new framework-neutral domain modules should target at least 90% branch coverage unless the uncovered branches are explicitly justified. No global coverage target will incentivize meaningless UI tests.

Required critical journeys include:

1. Sign in with GitHub.
2. Sign in through a collaborator invitation.
3. Select a repository and resolve its default branch.
4. Navigate between repositories and branches.
5. Load configuration, including missing or invalid configuration states.
6. List, filter, sort, and paginate a collection.
7. Create, edit, rename, and delete an entry where allowed.
8. Load and inspect entry history.
9. Browse, upload, replace, and delete media where allowed.
10. Resolve reference fields.
11. Run and inspect configured actions.
12. Manage collaborators and invitations.
13. Manage account identities and profile settings.
14. Perform supported administration operations.
15. Process GitHub installation, push, and action webhooks safely and idempotently.
16. Enforce representative anonymous, free, paid, expired, and administratively exempt access decisions on the server.
17. Reject quota-limited mutations atomically when the hosted policy denies them, without performing the underlying GitHub or database write.

### 4.3 Cloudflare Workers

Cloudflare Workers is a first-class deployment target.

The foundation must establish, early:

- TanStack Start with the official Cloudflare Vite integration;
- a checked-in `wrangler.jsonc` with a current compatibility date and only required compatibility flags;
- typed bindings generated by Wrangler;
- request-scoped application services shared with ordinary local development;
- Supabase/PostgreSQL through the portable Postgres client and `DATABASE_URL`;
- awaited request work, with an explicit durable queue introduced only when asynchronous processing is a measured requirement;
- Workers-safe cryptography and standard environment access through `process.env`;
- static assets served separately from the Worker code bundle;
- dry-run bundle measurement in CI;
- preview and production environment configuration without committed secrets;
- structured logs and enough request correlation to diagnose production failures.

Database migrations must be a separate explicit release step. They must not run implicitly as an application build side effect.

### 4.4 Maintainability

- Keep route files focused on route validation, loader orchestration, pending/error UI, and composition.
- Keep server-only dependencies behind `.server.ts` modules or equivalent explicit boundaries.
- Keep shared schemas and types free of React, database clients, Node-only modules, and Cloudflare bindings.
- Organize code primarily by feature, with shared components used only when multiple features genuinely need them.
- Prefer small modules with explicit inputs over module-level environment reads and implicit global state.
- Define stable interfaces around GitHub, database, email, time, and random identifiers where tests need deterministic implementations.
- Reject generic utility dumping grounds and barrel exports that accidentally broaden bundles.
- Record important architectural decisions and rejected alternatives.

### 4.5 Dependencies

- Use pnpm as the package manager and commit `pnpm-lock.yaml`.
- Start the new root package from the minimal official TanStack Start Cloudflare dependencies.
- Add dependencies only for a demonstrated feature requirement.
- Do not copy the legacy package manifest.
- Use shadcn/ui components through its registry and the current Nova preset rather than maintaining copied design-system abstractions.
- Keep the Nova/default neutral treatment and preserve the established Pages CMS green through documented semantic color tokens; this is brand continuity, not a redesign.
- Prefer platform APIs and small focused libraries over overlapping abstractions.
- Keep one client server-state cache; the current expectation is TanStack Query.
- Remove SWR when its behavior has been replaced.
- Inspect dependency license, maintenance, ESM/Workers compatibility, bundle contribution, and transitive cost before adoption.
- Separate optional providers so unused implementations do not enter the Worker bundle.
- Add an automated dependency and bundle report before cutover.

The initial branded preset keeps Nova's component geometry and neutral palette, changing only established semantic brand tokens:

```css
:root {
  --primary: oklch(0.60 0.13 163);
  --primary-foreground: oklch(0.98 0.02 166);
}

.dark {
  --primary: oklch(0.70 0.15 162);
  --primary-foreground: oklch(0.26 0.05 173);
}
```

Related focus, sidebar, and chart tokens should be derived and contrast-checked during Wave 1. Components must use semantic tokens rather than hard-coded green classes.

### 4.6 Documentation

Before cutover, the new root must own:

- `README.md`: purpose, prerequisites, setup, commands, and contributor entry points;
- `ARCHITECTURE.md`: client/server boundaries, request lifecycle, feature ownership, and external systems;
- `docs/caching.md`: cache layers, keys, freshness, invalidation, webhook behavior, and failure recovery;
- `docs/testing.md`: test taxonomy, fixtures, commands, and expectations;
- `docs/deployment/cloudflare.md`: bindings, environments, migrations, preview, deployment, rollback, and observability;
- `docs/development/plugins.md`: supported extension points, deployment composition, isolation, versioning, and provider lifecycle;
- `docs/hosted-access.md`: operation catalog, entitlement semantics, free-tier behavior, failure policy, billing synchronization, and the boundary between public core and private hosted code;
- architecture decision records for consequential and difficult-to-reverse choices;
- a parity/cutover checklist tied to automated evidence.

### 4.7 Hosted commercial extensibility

The same public application must support both ordinary self-hosting and the commercial `app.pagescms.org` deployment without source divergence.

Success means:

- the open-source core defines stable extension and access-policy contracts without depending on proprietary code;
- the hosted build composes private billing, entitlement, and feature implementations through configuration/build tooling rather than patched application files;
- payment and quota enforcement is authoritative on the server and consistent across UI routes, server functions, HTTP routes, jobs, and webhooks;
- free-tier rules and paid capabilities can change in the hosted policy without rewriting core domain services;
- self-hosted builds require no private registry credentials and include no hosted-only code;
- proprietary packages can add deliberately supported features without gaining unrestricted access to every internal module;
- public and private CI run the same contract suite against their respective policy implementations;
- the extension seam adds negligible overhead to permitted operations and does not force billing code into client bundles.

## 5. Target architecture

### 5.1 Routing and navigation

TanStack Router owns URL parsing, validated search parameters, navigation, route preloading, pending/error boundaries, and loader orchestration.

Route hierarchy should express stable ownership:

```text
root
├── public/auth
└── authenticated
    ├── home
    ├── settings
    ├── admin
    └── repository ($owner/$repo)
        └── branch ($branch)
            ├── overview
            ├── collection ($name)
            │   ├── list
            │   ├── new
            │   └── edit ($path)
            ├── file ($name)
            ├── media ($name)
            ├── configuration
            ├── actions
            ├── collaborators
            ├── cache
            └── settings
```

Principles:

- Authentication is resolved once at the highest useful boundary.
- Repository access and repository metadata are keyed by canonical owner/repository identifiers.
- Branch configuration is keyed by decoded branch identity, with URL encoding isolated at the route boundary.
- Parent loaders provide only data shared by descendants.
- Independent child data is not serialized behind parent fetches unnecessarily.
- Search parameters are validated and typed rather than parsed ad hoc in components.
- Links use intent preloading selectively; expensive or permission-sensitive work is not speculatively mutated.
- Route pending UI keeps parent layouts mounted.

### 5.2 Client data and stale-while-revalidate

TanStack Query is expected to own reusable client-side server state. TanStack Router loaders call `ensureQueryData` or prefetch query options; components consume the same query definitions.

Canonical key families should include:

```ts
["session"]
["repositories", accountOrInstallation]
["repository", owner, repo]
["configuration", owner, repo, branch]
["collection", owner, repo, branch, collection, normalizedSearch]
["entry", owner, repo, branch, path]
["entry-history", owner, repo, branch, path]
["media", owner, repo, branch, media, folder]
["references", owner, repo, branch, reference, normalizedSearch]
["actions", owner, repo, branch, normalizedSearch]
["collaborators", owner, repo, branch]
```

Freshness is resource-specific:

- immutable or SHA-addressed data can be retained aggressively;
- repository and configuration snapshots remain fresh until their TTL or a webhook/version signal expires them;
- collection and media folder snapshots use durable backend versions and targeted invalidation;
- action runs and other externally changing resources use shorter freshness and explicit refresh behavior;
- authenticated private content remains in memory by default and is not persisted to browser storage without a separate security decision.

Mutation policy:

1. Validate input before changing UI state.
2. Cancel conflicting reads when required.
3. Apply a narrow optimistic update only when rollback is reliable.
4. Execute the mutation with an idempotency strategy where feasible.
5. Reconcile against the authoritative response.
6. Invalidate only keys affected by the operation.
7. Surface background refresh separately from initial loading.

### 5.3 Server architecture

Server code should separate transport from domain behavior:

```text
route/server function
        ↓
authorization + validation
        ↓
application service
        ↓
GitHub / database / email adapters
```

Rules:

- Server functions are for same-origin application RPC.
- Server routes remain for GitHub webhooks, authentication handlers, and contracts intentionally exposed as HTTP endpoints.
- Authorization is enforced server-side at every relevant operation, regardless of client route guards.
- Services accept explicit request context rather than importing ambient process state.
- Public error contracts do not expose tokens, provider bodies, SQL, or internal stack traces.
- GitHub writes check the expected base SHA when concurrent modification matters.
- Webhook handlers verify signatures before parsing trusted payload semantics.
- Webhook work is idempotent, bounded, and awaited; larger follow-up work uses a durable queue or workflow only when measured need justifies it.

Workers database connectivity is an early architecture gate, not a deployment afterthought. Before feature migration depends on PostgreSQL, the project must choose and document one supported topology: Supavisor transaction pooling with Postgres.js prepared statements disabled, Supavisor session pooling with a deliberately bounded connection budget, or Hyperdrive after a measured evaluation. The selected DSN and driver options must match that topology. A concurrent integration/load check records application concurrency, observed database connections, query latency, and failures; an unconditional “prepared statements enabled” rule is forbidden.

### 5.4 Cache architecture

Cache layers must have distinct ownership:

| Layer | Owner | Purpose | Authoritative? |
|---|---|---|---|
| Route preload cache | TanStack Router | Code/data anticipation and navigation orchestration | No |
| Client server-state cache | TanStack Query | Immediate navigation, deduplication, stale-while-revalidate, optimistic state | No |
| Request memoization | Request context | Deduplicate session/token/config work within one request | No |
| Process/isolate memory | Worker isolate | Best-effort in-flight coalescing only | No |
| PostgreSQL | Server cache repositories | Durable GitHub/config/file/permission snapshots | Yes for cache state, not source content |
| GitHub | External source | Published repository content and permissions | Yes |

Invalidation should use canonical repository, branch, path, and context identifiers. Webhooks and successful mutations update or invalidate durable cache records and return enough version information for the client to update related keys.

Private authenticated content must not enter a shared Cloudflare CDN cache without a separate reviewed design proving tenant and permission isolation. Core also defines a baseline response-header policy for CSP, `X-Content-Type-Options`, referrer policy, frame ancestors, and permissions policy; user-controlled active media is attachment-only unless a deployment explicitly opts into a reviewed hosting policy.

### 5.5 Deployment composition and proprietary modules

“Plugin” is a packaging term in this project, not a generic runtime abstraction. The final architecture will not auto-discover a bag of arbitrary hooks, infer a plugin type, scan sibling source directories at runtime, or let extensions replace routes and internal services indiscriminately. The current `src/plugins` registry and `plugins/*/{plugin,server,client}.ts` discovery are provisional scaffolding and will be replaced.

The public application instead defines a small set of application-owned, typed boundaries. A deployment explicitly assigns one implementation to each supported boundary. A billing module does not “know” that it is billing; the hosted composition gives its access implementation to `accessPolicy`, its webhook implementation to the fixed billing webhook endpoint, and its UI to the named billing settings contribution. An S3 module is assigned to `media.storage`. Unsupported keys are compile-time errors.

The design goals are:

- one public repository that builds and runs without proprietary source, credentials, or package access;
- one private sibling repository, initially `../pro`, containing separately testable billing, permissions, S3, and Cloudflare modules;
- one explicit deployment composition file rather than a long-lived fork or patches to public application files;
- static imports, tree shaking, and route-level lazy loading rather than runtime discovery or an event bus;
- server-only contracts for decisions and secrets, with client-safe projections and UI entry points kept separate;
- negligible overhead for the open-source deployment: no generic hook iteration, no extra authorization network call, and no private module in its Worker or browser bundles.

#### 5.5.1 Composition root

The public application uses two stable build-time aliases, not one mixed module:

- `#pagescms/deployment/server` contains authoritative services and may import secrets or server-only dependencies;
- `#pagescms/deployment/client` contains only lazy client contributions and field editors.

The ordinary build resolves both aliases to in-tree defaults. A hosted build resolves them to two entry points in `../pro`. Splitting the import graphs is mandatory: relying on tree shaking to keep Stripe, S3, policy, or email imports out of a client module is not a security or bundle-size boundary.

The closed shapes are owned by Pages CMS:

```ts
interface PagesCmsServerDeployment {
  apiVersion: 1
  create(runtime: RuntimeConfiguration): {
    accessPolicy: AccessPolicy
    entitlementReader?: EntitlementReader
    email?: EmailProvider
    media: {
      resolveStorage(context: MediaContext): MediaStorage
      resolveDelivery(context: MediaContext): MediaDelivery
    }
    billingWebhook?: BillingWebhookHandler
    repositoryPermissionAdmin?: RepositoryPermissionAdmin
    fieldTypes?: Record<string, ServerFieldType>
  }
}

interface PagesCmsClientDeployment {
  apiVersion: 1
  fieldEditors?: Record<string, LazyFieldEditor>
  ui?: {
    repositoryPermissions?: LazyUiContribution<RepositoryPermissionsProps>
  }
}
```

The server entry is a factory receiving validated runtime configuration. Modules must not close over `process.env` or read credentials at import time. The client entry cannot import the server entry. `definePagesCmsServerDeployment` and `definePagesCmsClientDeployment` validate these closed objects and preserve type inference; they do not register callbacks, infer module categories, or execute hooks.

Core application code calls named services from the resolved server deployment:

```text
entry mutation -> core membership check -> access gateway -> accessPolicy.authorize(...)
media request  -> media service -> resolveStorage(context) -> storage operation
media preview  -> media service -> resolveDelivery(context) -> batched lease replacement
billing POST   -> fixed core route -> billingWebhook.handle(rawRequest)
permissions UI -> fixed core route/service -> repositoryPermissionAdmin
```

Billing does not require a custom client slot initially. `EntitlementReader` supplies a safe projection and URLs used by core-owned billing/upgrade UI. Its public result is a closed `EntitlementSnapshot` containing only tenant-safe display state: policy version, normalized status, plan label, usage counters, upgrade URL, and billing-portal URL. Provider customer IDs, price IDs, raw webhook state, and secrets are forbidden. A repository-permissions contribution is valid only when the paired `RepositoryPermissionAdmin` server contract is configured. A lazy UI contribution has a named props type and the exact shape `() => Promise<{ default: ComponentType<Props> }>`; there are no arbitrary children or DOM-slot contracts.

The open-source default uses the explicit allow policy, GitHub media storage/delivery, and the configured HTTP email adapter. It does not simulate hosted billing. Hosted production fails at startup/build validation when a required private capability is absent or incompatible; ordinary self-hosting does not.

The first implementation step is a composition spike, not a permanent public API promise. It first proves the two-entry mechanism using an in-tree fixture composition: the public default builds with `../pro` absent, the fixture is statically selected, unused code is tree-shaken, and server-only sentinel dependencies never enter browser chunks. It then tests a sibling checkout. The only supported fallback to direct sibling source is a hosted-only `file:`/path dependency; copying proprietary source into the public checkout, committed absolute paths, and a third generated-source mechanism are forbidden.

The build accepts exactly two selectors, tentatively `PAGESCMS_DEPLOYMENT_SERVER` and `PAGESCMS_DEPLOYMENT_CLIENT`. Hosted CI checks out both repositories, installs their dependencies, selects both entries, and applies a private Wrangler configuration overlay whose secrets remain Wrangler secrets. Public CI neither sees nor requires that overlay. The spike must explicitly prove all of the following before `../pro` becomes the production integration path:

- a client TSX contribution renders from the composed deployment without entering unrelated route chunks;
- a server function can use a composed server implementation without leaking it into the browser graph;
- a private Drizzle schema and migration journal remain discoverable only by the private release command;
- Vite HMR watches the sibling source without broad filesystem access;
- Vite, Vitest, and the production build use the same aliases and resolver rules;
- React, React DOM, TanStack, and other singleton runtime packages are deduplicated;
- `../pro` declares shared framework packages as peer dependencies and can install independently;
- TypeScript resolves the sibling contracts without expanding the public compilation boundary indiscriminately;
- the public fixture and private composition both pass a Cloudflare Workers build and dry-run;
- bundle reports prove server-only and unused private modules are absent from browser chunks.

The spike must document the exact `resolve.dedupe`, workspace/path dependency, TypeScript path, Vite filesystem/watch, Vitest, and Wrangler rules. If a direct sibling source alias cannot satisfy those checks cleanly, the hosted deployment uses a normal private `file:` dependency. It does not invent a copied/generated-source system.

#### 5.5.2 Private repository layout and update workflow

The private repository keeps capabilities separate even when one hosted deployment composes all of them:

```text
../pro/
  package.json
  deployment.server.ts
  deployment.client.ts
  pagescms.compat.json
  wrangler.hosted.jsonc
  plugins/
    billing/
      access-policy.server.ts
      entitlements.server.ts
      stripe-webhook.server.ts
    permissions/
      permission-admin.server.ts
      repository-settings.client.tsx
    media-s3/
      storage.server.ts
    media-cloudflare/
      delivery.server.ts
  database/
    schema.ts
    migrations/
  tests/
    contract/
    integration/
```

These directories are modules, not autonomous mini-frameworks. They may share private infrastructure inside `../pro`, but billing, permissions, storage, and delivery remain independently replaceable. The hosted access policy may use both billing entitlements and repository permissions internally and exposes one `AccessPolicy` to core. Core will not initially offer a generic `composePolicies()` helper: authorization, quota reservation, denial precedence, and settlement across multiple independent policies have transactional semantics that a simplistic array composition would hide.

The two Git repositories remain independently versioned. Updating Pages CMS is a normal pull/rebase in the public repository; updating hosted functionality is a pull in `../pro`. `pagescms.compat.json` records the deployment API version plus the supported public minimum and maximum versions. Hosted build and startup fail closed on mismatch, then public and hosted contract/build suites run. A public update never requires copying private code into the public tree.

Private Drizzle schema and migration journals remain separate. The initial rule is no database foreign keys from private tables into public tables: private data stores stable public identifiers and validates them through application services. A forward release applies public migrations, then private migrations; rollback reverses that order. Public migration discovery must never glob sibling paths.

#### 5.5.3 Supported boundaries

Only concrete product needs earn an extension boundary:

| Boundary | Authority and lifecycle | Initial implementation |
|---|---|---|
| `AccessPolicy` | Server-only and authoritative for protected reads/mutations | Explicit allow policy in OSS; hosted billing + permission policy in `../pro` |
| `EntitlementReader` | Server read model with a safe client projection; never authoritative | Optional hosted plan, usage, and upgrade state |
| Media storage resolver | Server-owned, per-request/per-repository selection of a `MediaStorage` implementation | Always GitHub in OSS; GitHub or S3 in `../pro` after an explicit precedence decision |
| Media delivery resolver | Optional per-context selection of delivery leases, proxying, CDN, and thumbnails | No extra delivery in the portable path; Cloudflare acceleration in `../pro` |
| `EmailProvider` | Server-only transactional sending | Resend HTTP adapter initially; replaceable without SMTP in the Worker |
| `BillingWebhookHandler` | Fixed core-owned route, signature verification, idempotent reconciliation | Stripe implementation in `../pro` |
| Field registry | Server validation metadata plus separately imported lazy client editor/view components selected by compile-time symbol | Core fields plus configured trusted custom fields |
| `RepositoryPermissionAdmin` | Named server CRUD contract paired with the fixed repository-permissions settings section | Deferred until the granular permission model is approved |
| Named UI contributions | Non-authoritative, route-specific, lazy-loaded React entry points paired with named server contracts | Repository permissions only after its server contract exists; billing uses core UI initially |

No initial support is promised for arbitrary middleware, arbitrary route injection, route replacement, DOM slots everywhere, mutation interception, or runtime-installed code. Core owns stable endpoints such as `/api/webhooks/billing` and delegates only after normal request validation. Core owns the user/repository settings routes and renders named optional sections. If a proprietary feature eventually needs a new route, it must first justify a new named core route or a separately deployed application; it does not gain a catch-all route hook.

Client UI may reveal that a proprietary capability exists. It must never contain credentials or make the authoritative billing/permission decision. Private client contributions are separate lazy entry points so visiting a collection or media route does not download billing settings code.

Custom fields follow the same trusted build-time rule. `.pages.yml` may name a configured field symbol, but it may never contain an arbitrary module path or cause a runtime import. The deployment's server registry owns parsing/validation metadata and its client registry owns the corresponding lazy editor/view module; startup validation rejects missing or mismatched pairs before repository content is rendered.

#### 5.5.4 Contract ownership, compatibility, and tests

Stable contracts move from arbitrary internal imports into `src/deployment/{contracts,conformance,builtins}` with explicit server and client entry points. Private modules may import those contracts, public builtins, and approved test harnesses, not repository internals. The deployment entries carry one API version; compatibility also records the supported public version range. Breaking a contract increments the API version and requires coordinated public/private release notes; additive optional fields remain backwards compatible when safe. The API version starts only after Wave 2 freezes the boundary shapes—not during the composition spike.

Each contract ships a deterministic reference/fake and a reusable conformance suite where practical. The public repository contains an explicitly named fixture such as `tests/deployment/fake-pro/`; it contains no proprietary behavior and exists only to test composition. CI must run:

- the public build with no `../pro` checkout or private credentials;
- a fixture-composed build inside public CI to exercise the composition mechanism;
- private CI against the supported public commit/version;
- contract tests for access denial/no-side-effect behavior, quota reservation/settlement, media capabilities, webhook idempotency, and safe client projections;
- browser tests proving named UI is absent in OSS and present only on its intended hosted route;
- bundle inspection proving private packages and identifiers are absent from OSS output and server-only dependencies are absent from browser chunks;
- public Workers dry-runs and fixture-composed builds in public CI;
- hosted Workers dry-runs, private migration tests, and provider integration tests in private CI.

Performance budgets will be measured rather than assumed. The OSS allow path must add no network round trip, deployment resolution occurs once rather than per component, and service indirection must remain below measurement noise relative to GitHub/database I/O. Any generic registry scan, repeated dynamic import, or per-request module discovery is a regression.

Security requirements include fail-closed hosted startup, server-only secrets, webhook signatures and replay protection, explicit tenant/principal targets, safe denial payloads, S3 key-prefix/content-type/size constraints, and audit-safe reason codes. Bundle tests reject private package names, hosted domains, and secret prefixes such as `STRIPE_` or `AWS_` in public/browser output. Hosted-only database schema and migrations belong to `../pro` and run as a separate release step; the public migration command must never discover them implicitly.

#### 5.5.5 Media subsystem and delivery extensions

The media subsystem must first match or exceed the legacy application's portable performance. Cloudflare, Vercel, S3, or another hosted optimization may improve that baseline, but none may be required for correct browsing, picking, or editing.

The portable GitHub implementation will use one canonical directory manifest for collection, full-page media, embedded picker, and field consumers. A storage manifest contains normalized, addressable asset metadata but no client URL. It is keyed by repository, commit SHA, and directory path rather than by the UI context that requested it. A separately cached short-lived branch pointer resolves a mutable branch to that immutable revision. Core passes the manifest to exactly one selected `MediaDelivery`, which is solely responsible for returning browser delivery leases. The public built-in direct delivery obtains GitHub-native raw or temporary URLs from the selected storage; an optional Cloudflare delivery can instead proxy/cache those same immutable assets. This removes the previous ambiguity in which storage and delivery could both mint competing leases.

Private manifests and temporary URLs are scoped to the authenticated browser session and must never be shared between users through SSR, durable cache, or dehydration. Request memoization, in-flight coalescing, and TanStack Query must prevent parallel consumers from independently fetching the same directory. Public assets use immutable revision-addressed raw URLs. Private assets use GitHub's temporary download URLs, fetched once per directory by direct delivery and cached briefly in the client lease set; those URLs are leases, while blob SHA remains the asset/byte identity. The browser HTTP cache remains responsible for the bytes initially. An expired lease is reminted once per directory without blanking the grid; a custom SHA-keyed browser byte store is considered only if measurements show URL rotation still causes material re-downloads.

The normalized asset model must cover at least stable provider-independent identifier, path, name, kind, size, content type, source revision or blob SHA, delivery URL and expiry, and supported operations. Directories remain first-class navigation entries. GitHub empty-directory behavior must be explicit because Git has no empty directories; if supported it requires a reviewed sentinel convention such as `.gitkeep`. Deleting the last visible asset in such a directory must either preserve/recreate the sentinel or explicitly remove the directory; rename, move, listing, and picker code must hide sentinels consistently. Field values remain portable paths or URLs compatible with `.pages.yml`; delivery leases and proprietary provider objects are never persisted to repository content.

Full-page media browsing and embedded media selection share headless query, selection, navigation, upload, move, rename, delete, and invalidation logic. Their presentation remains deliberately different: the full page uses repository page headers and roomy browsing controls, while dialogs use compact breadcrumbs and picker-specific actions.

The initial provider contract must remain narrow and capability-oriented. Core selects storage and delivery per media context, so a hosted deployment can keep GitHub as the default and choose S3 only for configured tenants/repositories. Listing returns storage-neutral asset metadata. Storage can resolve a server-only origin for an asset; delivery converts one or more origins into browser-safe leases. Storage never imports delivery, and exactly one delivery implementation runs for a request:

```ts
interface MediaStorage {
  list(request: MediaListRequest): Promise<MediaManifest>
  resolveOrigins(request: MediaResolveRequest): Promise<MediaOrigin[]>
  upload(request: MediaUploadRequest): Promise<MediaAsset>
  delete(request: MediaDeleteRequest): Promise<void>
  move?(request: MediaMoveRequest): Promise<MediaAsset>
  createDirectory?(request: MediaDirectoryRequest): Promise<void>
}

interface MediaDelivery {
  resolve(
    request: MediaDeliveryRequest,
    origins: MediaOrigin[],
  ): Promise<MediaDeliveryLease[]>
  transform?(request: MediaTransformRequest): Promise<MediaDeliveryLease>
}

interface MediaProviderResolver {
  resolveStorage(context: MediaContext): MediaStorage
  resolveDelivery(context: MediaContext): MediaDelivery
}
```

`MediaOrigin` is server-only and may contain a temporary upstream URL or opaque provider locator; it is never serialized to repository content or exposed as a stable client API. `MediaDeliveryLease` is explicitly ephemeral and carries URL, expiry, cache identity, and optional dimensions/variant. The OSS resolver always returns the core direct-delivery implementation, so the application has no nullable delivery branch.

GitHub is the public in-tree default provider, not an optional plugin. Provider-level capabilities tell the UI whether move, rename, directory creation, direct upload, or transformation is supported. The contract must not assume real directories, permanent public URLs, or image transformation support. GitHub Contents API's 1,000-entry directory limit requires an explicit large-directory error or alternate listing strategy before parity is claimed. Secrets and signing keys are server-only.

A private Pro/Enterprise S3 storage module may provide storage without modifying or forking the public application. It should use direct signed browser-to-S3 uploads where appropriate, signed delivery URLs, prefix-based directory semantics, and provider capability flags for unsupported operations. Small uploads use a presigned POST policy so allowed key prefix, content-length range, content type, expiry, and overwrite policy are enforced by storage; uploads above an approved threshold use multipart presigning. The bucket requires an explicit CORS policy documented with deployment setup. A core-owned confirm endpoint verifies object key, size, type, checksum/version where available, and ownership before committing quota; abandoned uploads expire and reconcile. Uploaded active content such as HTML or SVG is served with attachment and `X-Content-Type-Options: nosniff` unless explicitly configured and reviewed. Pagination and `CommonPrefixes`, multipart completion, copy-then-delete move partial failures, reconciliation, quota settlement, and abandoned uploads require tests. `move` is never described as atomic. CDN/image transformation stays in the separate delivery contract. Prefer a narrow SigV4 implementation such as `aws4fetch` for presigning unless bundle measurements justify modular AWS SDK packages. The same storage contract should leave room for a later Cloudinary-style implementation.

A private Pro/Enterprise Cloudflare delivery module may accelerate the baseline after measurement. It is a separately deployed Worker/hostname, not code implicitly added to the application route. The design authorizes the directory manifest once, then issues short-lived HMAC capability URLs scoped to the minimum useful asset or directory prefix. Tokens include a key identifier; the delivery Worker accepts the current and immediately previous signing key during a documented overlap window so rotation does not invalidate every in-flight lease. Keys remain Wrangler secrets. Each asset request validates tenant, owner, repository, revision/blob, variant, signature, and expiry cheaply before serving cached content; knowing an unsigned or expired URL is insufficient. The exact asset-versus-prefix granularity and TTL are chosen in a threat-model spike. A leaked signed URL remains usable until it expires, which is an explicit bounded capability tradeoff. Cache identity uses immutable content identity such as owner, repository, blob SHA, and transformation variant, never only a mutable branch path.

The Cloudflare plugin may use the regular CDN and Tiered Cache as a pull-through acceleration layer. The Workers Cache API is data-center-local and must not be described as globally replicated. Cloudflare Images transformations may optionally produce one measured thumbnail variant, approximately 384–512 pixels with automatic output format; JavaScript or WASM image resizing inside the application Worker is not the default. Durable asset storage such as R2 is not required initially. When the plugin is absent, Node, Vercel, and self-hosted deployments continue to use the portable provider path.

Media performance and security requirements:

- a directory used by several consumers produces one manifest request, not one request per consumer;
- the portable baseline must not make one application-server request per visible thumbnail;
- visible thumbnails lazy-load while cached manifests and thumbnails remain on screen during refresh;
- route-intent prefetching and shared keys allow the embedded picker to reuse an already warm directory manifest;
- very large directories have bounded rendering/network concurrency; virtualization is adopted only if measurement shows it improves the grid without breaking selection or drag/drop;
- public and private repositories, co-located content/media directories, expired private URLs, and revision changes receive characterization coverage;
- provider keys, per-session cache isolation, URL expiry, path traversal, capability signatures, cross-repository and cross-branch denial, and entitlement boundaries receive unit and integration coverage;
- full-page and embedded browser parity is covered in browser tests;
- request counts, cache hits, first useful render, and p50/p95 timings are measured against the legacy implementation before hosted optimizations are accepted;
- paid-provider entitlement checks occur at manifest and mutation boundaries and remain authoritative on the server.

Provider selection needs one product decision before S3 implementation: whether `.pages.yml` names a logical deployment storage ID, the hosted tenant/repository chooses storage outside repository content, or both with an explicit precedence rule. The resolver—not a deployment-wide singleton—implements that choice. Repository content must never persist provider credentials or temporary delivery objects. Absence of provider configuration always preserves the GitHub behavior.

Implementation proceeds in four independently reviewable slices: portable GitHub parity and measurement; shared headless browser/picker behavior; private S3 storage; optional Cloudflare delivery and transformation. The Cloudflare slice begins only if an approved numerical threshold—such as private-thumbnail p95 TTFB, first-useful-grid time, byte re-download rate, or GitHub delivery error/rate-limit incidence—remains unmet after the earlier slices. Each slice receives visual validation and request-count evidence before the next begins.

### 5.6 Hosted plans, entitlements, and usage limits

Paid access is a deployment policy, not a fork of Pages CMS and not a collection of client-side feature flags. The open-source core owns the enforcement seam and an explicit self-hosted allow policy. The hosted deployment supplies one proprietary `AccessPolicy` backed by private billing, entitlement, usage, and granular-permission services. Those concerns may remain modular inside `../pro`, but core receives one coherent policy so denial precedence, quota reservation, and settlement are not split across an unordered hook chain.

The core defines stable operation identifiers at the level users actually act, for example:

```ts
type Operation =
  | "repository.connect"
  | "repository.read"
  | "repository.configure"
  | "entry.create"
  | "entry.read"
  | "entry.update"
  | "entry.rename"
  | "entry.duplicate"
  | "entry.publish"
  | "entry.delete"
  | "file.read"
  | "file.write"
  | "media.read"
  | "media.upload"
  | "media.move"
  | "media.rename"
  | "media.delete"
  | "configuration.read"
  | "configuration.write"
  | "collaborator.invite"
  | "collaborator.manage"
  | "action.read"
  | "action.run"
  | "installation.manage"
  | "cache.invalidate"
  | "settings.update"
  | "billing.manage"
  | "webhook.receive.github"
  | "webhook.receive.billing"
  | "admin.access"

interface AccessPolicy {
  authorize(request: AccessRequest): Promise<AccessDecision>
  discover(request: AccessDiscoveryRequest): Promise<AccessDiscoveryDecision>
  reserve(
    request: AccessRequest,
    idempotencyKey: string,
  ): Promise<AccessReservationDecision>
  settle(
    reservation: PolicyReservation,
    outcome: "committed" | "released",
  ): Promise<void>
}

type AccessDecision =
  | { allowed: true; grant?: AccessGrant }
  | {
      allowed: false
      reason:
        | "authentication_required"
        | "permission_denied"
        | "plan_required"
        | "payment_required"
        | "quota_exceeded"
        | "rate_limited"
        | "tenant_suspended"
        | "read_only_mode"
        | "feature_unavailable"
        | "policy_unavailable"
      upgradeUrl?: string
    }

type AccessDiscoveryDecision =
  | { visibility: "all" | "none" }
  | {
      visibility: "filtered"
      collections?: string[]
      media?: string[]
      actions?: string[]
    }
```

The operation catalog is normative, not illustrative. Its final request/grant shapes are frozen alongside the domain services and must carry the authenticated principal, deployment/tenant identity where applicable, target resource, and immutable facts needed for the decision without coupling core to a billing vendor or schema. A contract test inventories every server function, HTTP route, webhook, scheduled entry point, and background command and proves it either maps to a catalog operation through the gateway or appears in a narrowly documented public allowlist such as health, static assets, auth callback, sign-in/out, session identity, billing recovery, and support contact.

Granular collaborator permissions use this same operation vocabulary and resource targeting. A role may edit collection A, read collection B, and be unable to discover collection C. A batched discovery decision filters repository navigation and lists without an authorization N+1; direct URLs still authorize independently, and writes authorize the exact mutation target. Product entitlement, collaborator policy, and GitHub authorization remain distinct checks even when the hosted `AccessPolicy` coordinates their result.

Enforcement rules:

1. Core authenticates the principal, then requires either valid GitHub repository access or valid core collaborator membership. Failure stops the request.
2. Every protected application command or query authorizes on the server before its substantive side effect or protected read. Base GitHub/collaborator admission completes before a quota reservation is acquired.
3. `AccessPolicy` may narrow base repository admission; it cannot grant a target that GitHub/core membership denied.
4. Core services call one policy gateway; route files and components do not contain plan-name checks such as `plan === "pro"`.
5. `authorize` and `discover` are read-only. Only `reserve` and `settle` may mutate private quota state; none may mutate repository content.
6. The client receives a safe capability projection for hiding, disabling, or explaining UI, but that projection is never authoritative.
7. Webhooks, scheduled work, administrators, and service principals receive explicit policies; they do not bypass enforcement accidentally.
8. Hosted policy outages fail closed for gated operations. Health, sign-in/out, session identity, billing recovery/portal access, and support-contact paths remain available so a user can recover from a billing failure.
9. Denials use typed reasons so the UI can distinguish sign-in, permission, upgrade, quota, and unavailable-policy states without exposing private billing data.
10. Authorization decisions are observable with privacy-safe reason codes and policy versions, but subscription details and payment data are not written to general logs.
11. Resource discovery is policy-aware; hiding a sidebar item is a usability projection, never the enforcement boundary.
12. Policy evaluation receives immutable request facts.

A simple authorization check is sufficient for feature access and many reads. It is not sufficient for quotas such as “one free public repository”: check-then-create races could exceed the limit. Quota-consuming mutations use the explicit `reserve` → protected operation → `settle(committed|released)` lifecycle. `reserve` returns an opaque reservation identifier/grant, not a side-channel hidden in `authorize`. Failed underlying operations release or reconcile reservations idempotently. Committed settlement failures require a private outbox/retry path; public idempotency keys are derived from operation, principal, target, and request identifier. The gateway owns this lifecycle so callers cannot accidentally forget settlement.

The operation-to-gateway mapping is explicit and tested:

| Operation class | Gateway behavior |
|---|---|
| Protected reads and non-quota writes | base admission → `authorize` → operation |
| Discovery/navigation | base admission → batched `discover`; direct URLs still call `authorize` |
| Repository connect/create under repository-count limits | base admission → `reserve` → operation → `settle` |
| Hosted media byte/object limits | base admission → `reserve` around initiation and verified completion |
| Direct S3 upload | base admission → `reserve` → POST/multipart presign → browser upload → core confirm → `settle` |
| GitHub/billing webhooks | signature + replay check → explicit service principal → catalog operation |

The hosted policy and its private supporting services should be able to express at least:

- a configurable free tier, such as one public repository;
- paid access by account, organization, installation, or another explicitly selected tenant model;
- repository visibility and resource-count limits;
- feature entitlements for proprietary modules;
- granular role and collaborator permissions down to repository, collection, media source, action, and operation where the product requires it;
- subscription states such as trialing, active, grace period, past due, canceled, and administratively granted access;
- idempotent billing webhook synchronization and manual support overrides with an audit trail.

Billing synchronization enters through the fixed core-owned `/api/webhooks/billing` route. The route reads `request.arrayBuffer()` exactly once, never calls `request.json()`, and passes the untouched bytes plus signature headers to the configured private handler. The handler verifies the provider signature, deduplicates the provider event identifier, updates private billing/entitlement state transactionally, and schedules or records reconciliation when ordering is uncertain. Contract tests prove that byte/whitespace changes invalidate a signature. Core does not know Stripe schemas, price identifiers, or plan names. Core-owned billing UI renders the safe entitlement projection and external checkout/portal URLs; billing does not receive arbitrary route, UI, or middleware hooks in v1.

`EntitlementReader` is a non-authoritative read model for plan, trial, usage, and safe billing URLs. Its projection includes only policy version, display plan label, normalized status, safe usage counters, upgrade URL, and billing-portal URL—never provider customer IDs, price IDs, or raw vendor state. The access gateway remains authoritative. Entitlement projections use route-specific fetching and cache keys that include tenant and policy version; unrelated content routes must not load billing state.

### 5.6.1 Authentication and identity cutover

Better Auth is not assumed to be schema-, cookie-, token-, or encryption-compatible with the legacy authentication stack. Before Wave 3 changes production identity, the project must inventory legacy users, accounts, sessions, collaborator identities, GitHub provider keys, token encryption format and key identifiers, invite records, cookie names/domains/SameSite rules, and callback URLs. A migration fixture copied from sanitized production shapes must prove account linking does not create duplicate users or detach GitHub installations.

The cutover must choose and rehearse one explicit strategy:

- an in-place, reversible database migration with a recorded mapping from every legacy identity to the Better Auth model; or
- a short, bounded dual-read grace period in which legacy sessions can be exchanged once for new sessions, after which legacy reads are removed.

OAuth access/refresh tokens remain encrypted at rest. The migration must identify the legacy cipher, key source, nonce/authentication behavior, and rotation path; decryption failures are observable and fail closed. If safe session exchange cannot be demonstrated, the release will deliberately invalidate existing sessions and communicate the required sign-in rather than silently accepting broken compatibility. Rollback must account for newly created Better Auth users/accounts and must not re-enable already-revoked credentials.

Prefer lazy private-account provisioning on the first relevant authenticated request. `AccountLifecycle` is not part of deployment API v1. If a concrete integration later proves it necessary, it must first earn a named, post-success, idempotent, observable boundary that cannot grant application access; authentication must not acquire a slow third-party dependency merely to notify an extension.

The core default must be named and explicit. The likely default for ordinary self-hosted deployments is an `allow` policy, while hosted production must refuse to start if its required proprietary policy is missing or misconfigured. The precise default and any optional open-source quota policy require approval before implementation.

Commercial code must depend on public deployment contracts; the public core must not import proprietary implementation modules. Contract tests will run against both a deterministic reference policy and, in private hosted CI, the proprietary policy package. Compatibility policy, release coordination, database ownership, support tooling, and licensing boundaries must be documented before launch.

### 5.7 Multiplayer readiness

Multiplayer editing is not required for initial parity. The rewrite should avoid making it unnecessarily expensive later.

Editors should interact with a document-session abstraction rather than directly coupling form state to persistence:

```ts
interface DocumentSession<TDocument, TChange> {
  read(): TDocument
  update(change: TChange): void
  subscribe(listener: () => void): () => void
  publish(): Promise<PublishResult>
}
```

The initial implementation is local. A future collaborative implementation may use Yjs and one Cloudflare Durable Object per canonical document identity (`owner/repo/branch/path`). That future design must distinguish collaborative draft state from published Git state, record the base Git SHA, reauthorize WebSocket sessions, and define external-change/conflict behavior. It must not commit every keystroke.

## 6. Behavioral parity inventory

The legacy routes below are the initial parity surface. During implementation each item must be classified as `required`, `changed intentionally`, or `removed with approval`, then linked to tests.

### User-facing routes

- `/`
- `/sign-in`
- `/sign-in/collaborator`
- `/auth/redirect`
- `/settings`
- `/admin`
- `/:owner/:repo`
- `/:owner/:repo/:branch`
- `/:owner/:repo/:branch/actions`
- `/:owner/:repo/:branch/cache`
- `/:owner/:repo/:branch/collaborators`
- `/:owner/:repo/:branch/collection/:name`
- `/:owner/:repo/:branch/collection/:name/new`
- `/:owner/:repo/:branch/collection/:name/edit/:path`
- `/:owner/:repo/:branch/configuration`
- `/:owner/:repo/:branch/file/:name`
- `/:owner/:repo/:branch/media/:name`
- `/:owner/:repo/:branch/settings`

### HTTP contracts

- `/api/auth/*`
- `/api/app/version`
- `/api/github-app/install`
- `/api/repos/:owner`
- `/api/collaborator-invites/:token`
- `/api/collaborators/*`
- `/api/webhook/github`
- `/api/:owner/:repo/:branch/branches`
- `/api/:owner/:repo/:branch/cache`
- `/api/:owner/:repo/:branch/collections/:name`
- `/api/:owner/:repo/:branch/entries/:path`
- `/api/:owner/:repo/:branch/entries/:path/history`
- `/api/:owner/:repo/:branch/files/:path`
- `/api/:owner/:repo/:branch/files/:path/rename`
- `/api/:owner/:repo/:branch/media/:name/:path`
- `/api/:owner/:repo/:branch/references/:name`
- `/api/:owner/:repo/:branch/actions`
- `/api/:owner/:repo/:branch/actions/:runId`

Parity also includes configuration schema behavior, custom fields, content operations, commit message interpolation, authentication/account linking, invitation expiry and verification, permission checks, encryption compatibility, email content, GitHub App installation flows, webhook signature verification, cache reconciliation, and database migration compatibility.

## 7. Migration waves

Each wave must be independently reviewable and must end with validation evidence. The next wave begins only after the previous wave is accepted or its remaining risks are explicitly carried forward.

### Wave 0 — Branch, baseline, legacy relocation, and plan

Scope:

- create `overhaul/tanstack-start`;
- record the baseline;
- move the existing application mechanically into `_legacy/`;
- preserve local source experiments without committing generated output or secrets;
- create and approve this plan.

Validation:

- branch points at the intended release commit;
- tracked legacy files are represented as renames, not deletions with lost content;
- `_legacy/package.json` and lockfile remain intact;
- no TanStack application code exists yet;
- baseline failures are recorded rather than silently repaired.

### Wave 1 — Official foundation and composition proof

Scope:

- scaffold the current official TanStack Start Cloudflare structure at root;
- initialize pnpm and shadcn/ui with the Nova preset, neutral surfaces, and the existing Pages CMS green semantic tokens for light and dark themes;
- configure TypeScript, formatting, linting, Vitest, Playwright, and CI;
- configure Wrangler, typed bindings, local development, preview, and dry-run bundle measurement;
- create root error handling, logging, request correlation, and health/version route;
- replace the provisional generic plugin discovery with the section 5.5 server/client deployment aliases;
- add one deliberately small fake private deployment fixture outside the public source tree; this is a tooling proof, not the production proprietary implementation;
- prove that the public default, fake composed server, and fake composed client builds resolve correctly without runtime discovery;
- prove that client code cannot import the server composition and that unused/private fixture modules do not enter the public bundle;
- write initial contributor and deployment documentation.

Validation:

- development server starts;
- typecheck, lint, unit test, production build, and Worker dry-run pass;
- the checked-in shadcn configuration can reproduce added primitives, and a small component/theme preview verifies Pages CMS green contrast in both color schemes;
- a deployed preview serves the root route and static assets (explicitly deferred
  to deployment/cutover after the local build, type generation, startup check,
  and Wrangler dry run passed);
- public and fake-composed builds resolve their intended deployments, reject incompatible deployment API versions, and exclude private and unused code from bundles;
- the bundle report is recorded.

### Wave 2 — Domain contracts, operation coverage, and persistence topology

Scope:

- define canonical identifiers and path/branch encoding rules;
- run a compatibility diagnostic against representative repositories before making path-normalization mismatches hard errors;
- port configuration parsing, normalization, serialization, schemas, operations, and commit-message behavior;
- define GitHub, database, email, media storage/delivery, clock, and identity interfaces where substitution is useful;
- define the operation catalog, access-policy contract, typed denial reasons, policy gateway, and atomic quota-consumption contract;
- export narrow server/client deployment contracts, deterministic fakes, and reusable conformance suites;
- define custom fields as trusted build-time registry symbols; repository configuration may reference registered names but cannot import arbitrary code;
- configure Drizzle and Supabase/PostgreSQL access through `DATABASE_URL`;
- choose and load-test one Workers/PostgreSQL connection topology: Supavisor transaction mode with prepared statements disabled, bounded session mode, or Hyperdrive;
- preserve existing database schema compatibility unless an approved migration is necessary;
- build deterministic fixtures and unit/integration tests.

Validation:

- domain tests cover representative and adversarial legacy cases;
- server-only code cannot enter client bundles;
- tests prove that denied operations perform no protected read or side effect and that quota reservations reconcile safely;
- database integration tests run against an isolated test database;
- the operation catalog has a coverage test proving that every route, server function, job, and webhook reaches its required gateway;
- connection tests cover concurrency, cold starts, transaction behavior, and prepared-statement compatibility for the selected topology;
- no production migration is executed automatically.

### Wave 3 — Authentication migration and application shell

Scope:

- integrate Better Auth using its TanStack Start/Workers support;
- inventory the legacy NextAuth identity model, provider/account keys, encrypted OAuth tokens, collaborator identities, invitations, cookies, callbacks, and active sessions;
- implement and rehearse the approved in-place migration or bounded dual-read/session-exchange strategy;
- port GitHub login, collaborator login/invites, account linking, session handling, and logout;
- derive the canonical principal and tenant context used by access-policy decisions;
- implement authenticated root routing and request-scoped session memoization;
- build the persistent application shell, repository selection, settings entry point, pending states, and error states;
- preserve return-to behavior and origin/CSRF protections.

Validation:

- authentication contract and browser tests pass;
- production-shaped migration fixtures preserve account ownership, GitHub identities, encrypted tokens, and collaborator access;
- the cutover documents whether existing sessions survive or require a deliberate one-time login, and rollback does not corrupt identity data;
- unauthenticated redirects preserve valid destinations;
- authenticated navigation does not refetch session data unnecessarily;
- client capability projections match server decisions in contract tests but cannot authorize requests;
- private data is absent from public caches and logs.

### Wave 4 — Repository, branch, configuration, and navigation

Scope:

- implement repository and branch query families;
- port repository access, installation/user token selection, branch discovery, and configuration loading;
- implement nested typed routes with stable layouts;
- enable intent preloading and stale-while-revalidate behavior;
- implement precise loading, empty, expired-auth, access-denied, not-found, and error states.

Validation:

- navigation tests cover repository and branch switching, back/forward, refresh, encoded branch names, and missing configuration;
- request instrumentation confirms no duplicate session/token/config fetches;
- cached navigation remains interactive and avoids full-layout replacement.

### Wave 5A — Collection reads and table behavior

Scope:

- port directory/collection reads, frontmatter parsing, configured columns, folders-first behavior, filtering, sorting, and pagination;
- implement the TanStack Table model with default shadcn/ui table primitives and only the layout rules required for truncation, primary-column growth, and responsive behavior;
- use stable query keys and cached manifests so revisiting or navigating between collection routes does not repeat identical work;
- restore the established header, breadcrumb, actions, pending skeleton, empty state, image-cell behavior, and compact pager.

Validation:

- characterization tests cover configured column types, missing data, nested paths, Unicode, malformed frontmatter, folder ordering, and legacy sort defaults;
- table interaction and browser tests cover search, sorting, paging, row navigation, and back/forward restoration;
- collection-only routes do not load editor bundles;
- sidebar, route shell, collection skeleton, and table render progressively without blocking one another.

### Wave 5B — Entry, file, reference, and history mutations

Scope:

- port entry, singleton-file, reference, and history reads;
- implement create, save, rename, delete, restore/history, and configured allowed-operation enforcement;
- route all protected collection, entry, file, and reference operations through the policy gateway;
- reserve quota atomically before protected mutations and settle or release it idempotently after the authoritative outcome;
- implement optimistic cache updates only where a complete rollback snapshot exists;
- preserve `.gitkeep` and empty-directory semantics for create, rename, move, list, and delete cascades.

Validation:

- domain, gateway, integration, and browser tests cover every content operation and denial path;
- configuration-defined readonly/disabled operations are enforced on client and server;
- free-tier and paid-tier policy matrices pass for representative reads and mutations;
- concurrent quota tests cannot over-consume and retries cannot double-charge;
- conflicts and stale SHAs produce understandable recovery behavior;
- destructive operations require confirmation and recover correctly from failure.

### Wave 5C — Field registry and editor parity

Scope:

- implement the trusted, statically composed field registry and reject unknown configured symbols clearly;
- port primitive fields first, followed by lists, blocks, sortable items, nesting, references, media/file pickers, and all validation/default/serialization behavior;
- integrate `pagescms-editor` as the rich-text field with Editor/Source controls in the standard field header;
- preserve image/file thumbnail behavior, drag/drop, upload selection, required badges, descriptions, errors, disabled/read-only states, and field-level controls;
- introduce the local document-session seam without adding Yjs or multiplayer infrastructure;
- lazy-load heavyweight and optional field implementations.

Validation:

- a field-type compatibility matrix maps every legacy field and edge case to tests or an explicitly approved difference;
- round-trip fixtures prove parse → edit → serialize stability for nested blocks, sortable structures, unknown values, empty values, and mixed content;
- browser tests cover create/edit/save/reload, validation, drag sorting, nested blocks, source switching, media selection, and failure recovery;
- collection and other non-editor routes remain free of editor code; the editor chunk is measured separately rather than treated as initial-route cost.

### Wave 6A — Portable media parity and performance baseline

Status: implemented and verified locally. The deterministic public/private
request-count regression, media mutation workflow, and embedded-picker browser
tests pass. Deployed p50/p95 measurements remain an operational follow-up.

Scope:

- port media browsing and mutations through the canonical manifest and public GitHub storage/delivery providers;
- share headless manifest, selection, drag/drop, upload, move, rename, delete, and preview behavior between the full-page browser and embedded picker while preserving their distinct shells;
- restore request coalescing across collection image cells and media views, temporary signed/raw URL caching, stale display, lazy loading, and failure placeholders;
- implement list/grid views, folders-first display, responsive item sizing, bounded grid widths, breadcrumbs, and route-owned versus embedded controls;
- instrument GitHub calls, manifest reuse, preview requests, first useful render, and duplicate in-flight requests.

Validation:

- the portable provider matches or exceeds the measured legacy request count and useful-render time on representative public and private repositories;
- repeated URLs and concurrent consumers share one in-flight resolution;
- stale cached manifests remain usable during background refresh and invalidate after mutations;
- drag-to-folder, drag-upload, create-folder, rename, delete, GitHub view, and embedded selection tests pass;
- no Cloudflare, S3, or proprietary dependency is required for the open-source baseline.

### Wave 6B — Actions, collaborators, cache, settings, and admin

Scope:

- port configured actions and action-run synchronization;
- port collaborator management and provider-backed invitation email;
- port cache inspection and maintenance UI;
- finish user settings, identities, installations, profile, and administration;
- add core-owned plan-required, quota-exceeded, and upgrade surfaces driven by safe policy projections and typed denials;
- mount named billing and repository-permission contributions only through the closed client deployment contract;
- complete route-specific pending, error, empty, and skeleton states.

Validation:

- critical journeys pass end to end;
- sensitive actions remain server-authorized and deny-path tests prove no protected side effect occurred;
- public UI remains useful without a private client deployment;
- hosted-only UI/server modules and identifiers are absent from the ordinary open-source and browser bundles;
- loading shells preserve dimensions and do not shift shared headers during navigation.

### Wave 6C — Private S3 media storage

Status: implemented in `../pro` and verified against the public conformance
suite through a deterministic S3 transport, including POST, multipart,
pagination, collision, abort, tampering, and copy/delete failure cases. A live
disposable S3-compatible target remains an environment-level release check.

Scope:

- implement the private S3-compatible storage provider against the public contract;
- define tenant/repository configuration, key layout, supported metadata, limits, and collision behavior;
- use presigned POST for bounded uploads and multipart upload above an explicit threshold;
- configure and document CORS, abort incomplete multipart uploads, and cleanup/reconciliation;
- implement copy-then-delete move/rename with explicit partial-failure recovery because S3 has no atomic rename;
- preserve a logical media path independent of physical object keys.

Validation:

- the public media conformance suite passes against a disposable S3-compatible test target;
- upload, multipart retry/abort, overwrite, copy/delete failure, listing, deletion, and private-delivery tests pass;
- proprietary credentials and provider packages remain server-only and absent from public builds;
- the open-source GitHub path is behaviorally unchanged when the provider is absent.

### Wave 6D — Optional Cloudflare media delivery

Status: intentionally deferred until deployed portable-media measurements show
that an additional delivery provider is justified.

Scope:

- implement the private Cloudflare delivery provider only after Wave 6A measurements justify it;
- authenticate each private request before serving shared cached bytes, using opaque signed URLs as replay-resistant identifiers rather than as authorization substitutes;
- define HMAC key rotation, token scope, TTL, cache keys, invalidation, response headers, and audit metadata;
- prefer regular CDN/tiered caching for geographical reuse; use Workers Cache API only where its data-center-local behavior is intentional;
- evaluate Cloudflare Images transformations separately and retain original-byte delivery when transformations are unavailable;
- keep the delivery provider deployable as a separate Worker if that materially improves cache behavior, secrets isolation, or bundle size.

Validation:

- authorization, expiry, tampering, rotation, cache-hit, cold-edge, purge, and private-repository tests pass;
- transformed and pass-through responses have bounded cost and correct content/security headers;
- disabling the provider falls back cleanly to the portable delivery path;
- no Cloudflare-only API enters the portable media domain or public client bundle.

### Wave 7 — Webhooks, cache hardening, performance, and security

Scope:

- port installation, push, and action webhook behavior;
- preserve raw request bodies for signature verification and billing providers that require them;
- harden hosted billing webhook synchronization, entitlement invalidation, policy-version observability, atomic usage accounting, and audit behavior in the private deployment test suite;
- implement durable invalidation/version semantics and keep request work awaited;
- measure and remove waterfalls, redundant requests, oversized chunks, and unnecessary compatibility shims;
- perform dependency, authorization, secret-handling, CSRF, webhook, and private-cache reviews;
- verify CSP and security headers against editor content, media previews, authentication redirects, and third-party delivery origins;
- run public/hosted compatibility matrices, rehearse private migrations separately, and assert that private modules and identifiers do not leak into public or browser bundles;
- introduce Queues or Workflows only if measured webhook work cannot remain bounded safely.

Validation:

- webhook replay/idempotency and invalidation tests pass;
- entitlement changes propagate within an approved interval, billing webhook replay is idempotent, and policy-provider failures follow the documented fail-closed behavior;
- deployed p50/p95 navigation and server timings are recorded;
- bundle budgets pass;
- security review has no unresolved release-blocking findings.

### Wave 8 — Documentation, parity, preview, and cutover

Scope:

- complete all canonical documentation;
- run the parity checklist and explicitly approve intentional differences;
- rehearse database migration, deployment, rollback, and webhook configuration;
- run a production-like preview with representative repositories;
- run separate self-hosted-reference and hosted-commercial acceptance matrices, including free, paid, expired, quota-exceeded, support-override, and missing-policy states;
- remove `_legacy/` only after acceptance;
- cut over production and monitor the release.

Validation:

- all required checks and critical journeys pass;
- no required parity item is unclassified;
- operational documentation is tested by following it;
- rollback remains possible;
- post-cutover monitoring shows no material regression.

## 8. Review and execution policy

- Wave 0 stops after this plan and relocation are validated.
- The user approves this plan before Wave 1 begins.
- Prefer one focused commit per mechanical move or coherent implementation slice.
- Never combine a large move with semantic changes.
- At the end of each wave, report changed behavior, validation evidence, bundle/performance changes, unresolved risks, and proposed adjustments.
- Pause when a choice changes product behavior, external contracts, persistence, permissions, deployment cost, or plugin guarantees.
- Preserve the current production branch until the replacement is explicitly accepted.

## 9. Cutover criteria

The new application is eligible for cutover only when:

- every required route and external HTTP contract has an automated or documented parity result;
- all critical journeys pass against a production-like preview;
- typecheck, lint, tests, production build, and Worker dry-run succeed from a clean checkout;
- database migrations are reviewed, reversible where practical, and rehearsed;
- GitHub App callback and webhook configuration is documented and verified;
- cache invalidation and external-change behavior are tested;
- Worker and client bundles remain within approved budgets;
- deployed navigation and mutation measurements meet approved targets;
- private content, credentials, and authorization decisions pass security review;
- protected hosted operations cannot bypass the policy gateway through alternate routes, server functions, webhooks, or direct service calls;
- the public build succeeds without registry access to proprietary packages, while hosted production refuses to start without its required policy;
- operator setup, deployment, rollback, and incident diagnostics are documented;
- all intentional behavior changes have explicit approval;
- `_legacy/` is no longer needed to understand an undocumented production invariant.

## 10. Known risks

| Risk | Mitigation |
|---|---|
| Missing tests allow silent parity regressions | Characterization fixtures, contract tests, and critical browser journeys precede or accompany each port. |
| Git path and branch encoding regressions | Canonical identifier module plus adversarial tests for slashes, Unicode, spaces, and reserved characters. |
| Aggressive caching exposes stale or unauthorized data | Explicit key ownership, targeted invalidation, permission-aware server reads, and no shared caching of private content. |
| Optimistic updates diverge from GitHub | Use only for reversible mutations, retain snapshots for rollback, and reconcile authoritative responses. |
| Workers runtime differs from Node | Keep application code on supported standard APIs, run a production build/dry-run in CI, and deploy a preview before cutover. |
| PostgreSQL latency dominates edge execution | Measure Supabase placement and query timings, reduce round trips, and batch or parallelize safe reads. |
| Workers exhaust PostgreSQL connections or use an incompatible pool mode | Select and load-test one Supavisor/Hyperdrive topology in Wave 2; make prepared-statement behavior match it explicitly. |
| Better Auth cutover duplicates users, loses linked accounts, or invalidates tokens | Inventory legacy identity/encryption shapes, rehearse a reversible migration or bounded exchange, and prefer an explicit logout over unsafe compatibility. |
| Deployment modules inflate the Worker | Static composition, server/client entry points, route-level lazy UI, tree shaking, and bundle reports. |
| Sibling private composition causes duplicate React or inconsistent tooling resolution | Prove TSX, server functions, migrations, HMR, peer dependencies, deduplication, tests, and Workers builds with a fake fixture before production composition. |
| Payment enforcement is bypassed through an alternate endpoint | Authorize in shared application services, inventory every operation, and add deny-path contract tests across routes, server functions, jobs, and webhooks. |
| Client capability state becomes an authorization source | Treat it as display-only; every authoritative decision is made again by the server policy gateway. |
| Free-tier quotas race under concurrent requests | Use atomic policy reservations or transactions rather than check-then-write logic, with idempotent reconciliation. |
| A hosted policy outage either grants access or breaks recovery | Fail closed for gated operations, keep narrowly defined recovery/health paths available, and document/operator-test the failure mode. |
| Private packages leak into public or client bundles | One-way dependency from private modules to public contracts, explicit server/client entry points, forbidden-import/string assertions, bundle inspection, and public CI with `../pro` absent. |
| S3 move or multipart upload leaves partial state | Treat moves as copy-then-delete, confirm uploads server-side, abort abandoned multipart sessions, and reconcile reservations and orphaned objects idempotently. |
| Signed media URLs are mistaken for permanent authorization | Authenticate manifest issuance, scope and expire capabilities, rotate HMAC keys, and test tampering/replay; the portable provider remains available without them. |
| Deployment contracts become a second unstable framework | Keep the closed configuration narrow, versioned, and requirement-driven; do not promise arbitrary hooks, middleware, or routes. |
| Billing, quotas, and granular permissions disagree | Expose one hosted `AccessPolicy`, define deterministic denial precedence, and test reservation/settlement and discovery behavior as coherent transactions. |
| Public and private repositories drift | Pin/verify the deployment API version, run both contract suites before either release, and maintain an explicit compatibility matrix and upgrade rehearsal. |
| Rewrite expands into a visual redesign | Preserve the established design unless a small change directly improves navigation, accessibility, loading, or clarity. |
| Legacy defects become accidental contracts | Classify observed behavior as intended, defect, or unknown before reproducing it. |
| Multiplayer preparation overcomplicates parity | Add only the document-session seam; defer Yjs, WebSockets, awareness, and Durable Objects. |
| Long-running branch diverges from production | Keep the production branch stable, periodically review relevant fixes, and port them deliberately with tests. |

## 11. Open decisions during the overhaul

The following decisions require explicit agreement or a short targeted spike before their affected implementation wave. They do not block starting the Wave 1 local foundation unless Wave 1 evidence makes one immediately consequential.

1. Exact supported Node fallback, if any, in addition to Cloudflare Workers.
2. Cloudflare Workers plan used for production bundle and CPU budgets.
3. Test database strategy for local development and CI.
4. Preview environment ownership, database isolation, GitHub App callbacks, and webhook endpoints.
5. Initial email provider and the configuration contract for replacement adapters.
6. Whether existing external API route shapes are public compatibility contracts or internal implementation details.
7. Which current behaviors are known defects and should intentionally not be reproduced.
8. Quantitative performance budgets after the first deployed shell and first representative content route are measurable.
9. The hosted billing provider and whether subscription state is mirrored locally or queried through a dedicated entitlement service.
10. The billing tenant: individual user, organization, GitHub installation, repository owner, or an explicit hierarchy of these identities.
11. Initial free-tier rules, including what counts as a repository, how public/private visibility changes are handled, and what existing users receive at launch.
12. Grace-period, cancellation, delinquency, administrative override, and data-access behavior after entitlement loss.
13. Whether hosted production resolves private deployment modules through a direct sibling-repository alias or an installed private file/path dependency after the Wave 1 fixture spike.
14. Which fixed core-owned routes and named UI contributions proprietary features require initially; arbitrary route injection is excluded.
15. Deployment API compatibility and release policy between the public application and private hosted modules.
16. Ownership and migration policy for hosted-only database tables, plus the licensing boundary for public contracts and private implementations.
17. Media-storage selection and precedence: repository logical ID, hosted tenant/repository configuration, or an explicit combination.
18. Better Auth cutover strategy: reversible in-place migration, bounded dual-read/session exchange, or a deliberate one-time logout where legacy session conversion is unsafe.
19. Granular permission semantics: role inheritance, discoverability, explicit deny precedence, tenant ownership, and conflict resolution with GitHub permissions.
20. Workers/PostgreSQL topology after the Wave 2 load test: Supavisor transaction mode, bounded session mode, or Hyperdrive.
21. S3 multipart-upload threshold, maximum object size, cleanup interval, and whether compatible non-AWS providers are supported at first release.
22. Cloudflare media delivery token scope and TTL, HMAC rotation procedure, cache invalidation strategy, and whether it ships in the application Worker or a separate Worker.
23. The safe client entitlement projection: which plan, capability, and quota facts core UI may display without exposing billing-provider or policy internals.

## 12. Immediate next step

First implement only the Wave 1 composition fixture: public server/client defaults, fake private server/client deployments, exact alias tooling, API-version rejection, and bundle-isolation assertions. Do not build production proprietary modules during that spike.

Then complete the Wave 2 operation inventory, custom-field symbol contract, path-compatibility diagnostics, and Workers/PostgreSQL topology test. Separately, capture comparable legacy/current media measurements so Wave 6A has an objective portable-performance target. S3 and Cloudflare media providers remain blocked until the open-source GitHub implementation reaches that baseline and passes the public conformance suite.
