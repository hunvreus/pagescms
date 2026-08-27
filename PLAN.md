# Pages CMS TanStack Start Overhaul

Status: implementation in progress; broad local parity present, performance measurement and cutover acceptance outstanding

Branch: `overhaul/tanstack-start`

Legacy baseline: Pages CMS `2.1.8` at commit `6f4e860`
Last updated: 2026-08-21

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
- `docs/plugins.md`: supported extension points, plugin contracts, composition, isolation, versioning, and provider lifecycle;
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

Private authenticated content must not enter a shared Cloudflare CDN cache without a separate reviewed design proving tenant and permission isolation.

### 5.5 Extensions and deployment composition

Do not build a general runtime plugin marketplace during the rewrite. Establish narrow, typed, build-time extension points. Plugins are trusted deployment code, not untrusted code uploaded and executed at runtime.

The public repository must remain independently buildable and usable. The hosted `app.pagescms.org` deployment may install private packages and register them through one documented composition point. This composition must not require edits to public application files or a long-lived fork. A private package registry, deployment-only package installation, and a build-time module alias or generated composition module are candidate mechanisms; Wave 1 must prove the mechanism before it becomes an architectural contract.

The composition layer should support:

- an access-policy/entitlement provider;
- email providers;
- custom field definitions and editors;
- deliberately exposed navigation items, UI slots, server services, and webhook handlers for proprietary features;
- future asset/storage adapters if a concrete requirement appears;
- a future collaboration provider behind a document-session interface.

Extension APIs must be versioned and capability-oriented. Each extension declares its identifier, API compatibility version, server and client entry points, and required bindings. Server-only modules must never be re-exported through client entry points. Unused extensions must not enter either bundle.

TanStack routes are statically generated, so arbitrary runtime route injection is not an initial promise. Proprietary pages should use explicit build-time route contributions or stable core-owned extension routes only after a Wave 1 spike proves compatibility with route generation, type safety, and code splitting. Until then, prefer narrowly defined UI slots and server service registrations.

Client-delivered proprietary UI JavaScript cannot be treated as secret. Sensitive algorithms, credentials, billing decisions, and authoritative feature behavior must remain in server-only modules.

An email provider should resemble:

```ts
interface EmailProvider {
  send(message: EmailMessage): Promise<void>
}
```

The deployment statically configures one implementation. Resend can be the default HTTP implementation; SMTP can be optional or isolated behind another Worker/service. Unused providers must not be bundled.

Field extensions must separate:

- client-safe metadata and validation;
- serialization/read/write behavior;
- lazily loaded edit components;
- lazily loaded view components;
- server-only capabilities, if any.

#### 5.5.1 Media subsystem and delivery extensions

The media subsystem must first match or exceed the legacy application's portable performance. Cloudflare, Vercel, S3, or another hosted optimization may improve that baseline, but none may be required for correct browsing, picking, or editing.

The portable GitHub implementation will use one canonical directory manifest for collection, full-page media, embedded picker, and field consumers. A manifest contains normalized asset metadata and delivery leases, and is keyed by repository, commit SHA, and directory path rather than by the UI context that requested it. A separately cached short-lived branch pointer resolves a mutable branch to that immutable revision. Private manifests and temporary URLs are scoped to the authenticated browser session and must never be shared between users through SSR, durable cache, or dehydration. Request memoization, in-flight coalescing, and TanStack Query must prevent parallel consumers from independently fetching the same directory. Public assets use immutable revision-addressed raw URLs. Private assets use GitHub's temporary download URLs, fetched once per directory and cached briefly in the client manifest; those URLs are leases, while blob SHA remains the asset/byte identity. The browser HTTP cache remains responsible for the bytes initially. An expired lease is reminted once per directory without blanking the grid; a custom SHA-keyed browser byte store is considered only if measurements show URL rotation still causes material re-downloads.

The normalized asset model must cover at least stable provider-independent identifier, path, name, kind, size, content type, source revision or blob SHA, delivery URL and expiry, and supported operations. Directories remain first-class navigation entries. GitHub empty-directory behavior must be explicit because Git has no empty directories; if supported it requires a reviewed sentinel convention such as `.gitkeep`. Field values remain portable paths or URLs compatible with `.pages.yml`; delivery leases and proprietary provider objects are never persisted to repository content.

Full-page media browsing and embedded media selection share headless query, selection, navigation, upload, move, rename, delete, and invalidation logic. Their presentation remains deliberately different: the full page uses repository page headers and roomy browsing controls, while dialogs use compact breadcrumbs and picker-specific actions.

The initial provider contract must remain narrow and capability-oriented. Listing returns delivery leases in the same payload, while batched resolution handles field values at arbitrary paths without creating one server call per asset:

```ts
interface MediaProvider {
  list(request: MediaListRequest): Promise<MediaManifest>
  resolve(request: MediaResolveRequest): Promise<MediaDelivery[]>
  upload(request: MediaUploadRequest): Promise<MediaAsset>
  delete(request: MediaDeleteRequest): Promise<void>
  move?(request: MediaMoveRequest): Promise<MediaAsset>
  createDirectory?(request: MediaDirectoryRequest): Promise<void>
}

interface MediaTransformProvider {
  transform(request: MediaTransformRequest): Promise<MediaDelivery>
}
```

GitHub is the public in-tree default provider, not an optional plugin. Provider-level capabilities tell the UI whether move, rename, directory creation, direct upload, or transformation is supported. The contract must not assume real directories, permanent public URLs, or image transformation support. GitHub Contents API's 1,000-entry directory limit requires an explicit large-directory error or alternate listing strategy before parity is claimed. Secrets and signing keys are server-only.

A private Pro/Enterprise S3 plugin may provide storage and delivery without modifying or forking the public application. It should use direct signed browser-to-S3 uploads where appropriate, signed delivery URLs, prefix-based directory semantics, and provider capability flags for unsupported operations. Presigned uploads bind an allowed key prefix, content type, maximum size, expiry, and overwrite policy. Uploaded active content such as HTML or SVG is downloaded safely rather than hosted as an executable website unless explicitly configured. Pagination and `CommonPrefixes`, copy-then-delete move failures, quota settlement, and abandoned uploads require tests. A CDN or image transformation service can be composed later rather than built into the S3 contract. The same contract should leave room for a later Cloudinary-style provider.

A private Pro/Enterprise Cloudflare delivery/transform plugin may accelerate the baseline after measurement. The design authorizes the directory manifest once, then issues short-lived HMAC capability URLs scoped to the minimum useful asset or directory prefix. Each asset request validates tenant, owner, repository, revision/blob, variant, signature, and expiry cheaply before serving cached content; knowing an unsigned or expired URL is insufficient. The exact asset-versus-prefix granularity and TTL are chosen in a threat-model spike. A leaked signed URL remains usable until it expires, which is an explicit bounded capability tradeoff. Cache identity uses immutable content identity such as owner, repository, blob SHA, and transformation variant, never only a mutable branch path.

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

Implementation proceeds in four independently reviewable slices: portable GitHub parity and measurement; shared headless browser/picker behavior; private S3 provider; optional Cloudflare delivery and transformation. The Cloudflare slice begins only if an approved numerical threshold—such as private-thumbnail p95 TTFB, first-useful-grid time, byte re-download rate, or GitHub delivery error/rate-limit incidence—remains unmet after the earlier slices. Each slice receives visual validation and request-count evidence before the next begins.

### 5.6 Hosted plans, entitlements, and usage limits

Paid access is a deployment policy, not a fork of Pages CMS and not a collection of client-side feature flags. The open-source core owns the enforcement seam and a default self-hosted policy. The hosted deployment registers a proprietary policy implementation backed by its own tables, billing provider, service, or combination of those systems.

The core defines stable operation identifiers at the level users actually act, for example:

```ts
type Operation =
  | "repository.connect"
  | "repository.read"
  | "entry.create"
  | "entry.update"
  | "entry.delete"
  | "media.write"
  | "collaborator.invite"
  | "action.run"
  | "admin.access"

interface AccessPolicy {
  authorize(request: AccessRequest): Promise<AccessDecision>
}

type AccessDecision =
  | { allowed: true; grant?: AccessGrant }
  | {
      allowed: false
      reason: "authentication_required" | "plan_required" | "quota_exceeded" | "feature_unavailable"
      upgradeUrl?: string
    }
```

The final operation catalog and request/grant shapes will be designed alongside the domain services. They must carry the authenticated principal, deployment/tenant identity where applicable, target resource, and facts needed for the decision without coupling the core to a specific billing vendor or schema.

Enforcement rules:

1. Every protected application command or query authorizes on the server before its substantive side effect or protected read.
2. Core services call one policy gateway; route files and components do not contain plan-name checks such as `plan === "pro"`.
3. The client receives a safe capability projection for hiding, disabling, or explaining UI, but that projection is never authoritative.
4. GitHub permission checks and product entitlement checks remain separate and both must pass.
5. Webhooks, scheduled work, administrators, and service principals receive explicit policies; they do not bypass enforcement accidentally.
6. Hosted policy outages fail closed for gated operations. Public health and recovery paths remain available.
7. Denials use typed reasons so the UI can distinguish sign-in, upgrade, quota, and unavailable-feature states without exposing private billing data.
8. Authorization decisions are observable with privacy-safe reason codes and policy versions, but subscription details and payment data are not written to general logs.

A simple authorization check is sufficient for feature access and many reads. It is not sufficient for quotas such as “one free public repository”: check-then-create races could exceed the limit. Quota-consuming mutations need an atomic reservation/consume/commit or equivalent transaction supplied by the policy implementation. Failed underlying operations must release or reconcile reservations idempotently.

The hosted policy should be able to express at least:

- a configurable free tier, such as one public repository;
- paid access by account, organization, installation, or another explicitly selected tenant model;
- repository visibility and resource-count limits;
- feature entitlements for proprietary modules;
- subscription states such as trialing, active, grace period, past due, canceled, and administratively granted access;
- idempotent billing webhook synchronization and manual support overrides with an audit trail.

The core default must be named and explicit. The likely default for ordinary self-hosted deployments is an `allow` policy, while hosted production must refuse to start if its required proprietary policy is missing or misconfigured. The precise default and any optional open-source quota policy require approval before implementation.

Commercial code must depend on public extension contracts; the public core must not import proprietary implementation modules. Contract tests will run against both a deterministic reference policy and, in private hosted CI, the proprietary policy package. Compatibility policy, release coordination, database ownership, support tooling, and licensing boundaries must be documented before launch.

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

### Wave 1 — Official TanStack Start and Workers foundation

Scope:

- scaffold the current official TanStack Start Cloudflare structure at root;
- initialize pnpm and shadcn/ui with the Nova preset, neutral surfaces, and the existing Pages CMS green semantic tokens for light and dark themes;
- configure TypeScript, formatting, linting, Vitest, Playwright, and CI;
- configure Wrangler, typed bindings, local development, preview, and dry-run bundle measurement;
- create root error handling, logging, request correlation, and health/version route;
- prove a build-time deployment composition mechanism with a public no-op/reference extension and a simulated private extension, without adding proprietary code to the public repository;
- write initial contributor and deployment documentation.

Validation:

- development server starts;
- typecheck, lint, unit test, production build, and Worker dry-run pass;
- the checked-in shadcn configuration can reproduce added primitives, and a small component/theme preview verifies Pages CMS green contrast in both color schemes;
- a deployed preview serves the root route and static assets (explicitly deferred
  to deployment/cutover after the local build, type generation, startup check,
  and Wrangler dry run passed);
- public and hosted-composed builds resolve their intended extensions, reject incompatible extension API versions, and exclude unused extension code from bundles;
- the bundle report is recorded.

### Wave 2 — Shared domain foundations and adapters

Scope:

- define canonical identifiers and path/branch encoding rules;
- port configuration parsing, normalization, serialization, schemas, operations, and commit-message behavior;
- define GitHub, database, email, clock, and identity interfaces where substitution is useful;
- define the operation catalog, access-policy contract, typed denial reasons, policy gateway, and atomic quota-consumption contract;
- configure Drizzle and Supabase/PostgreSQL access through `DATABASE_URL`;
- preserve existing database schema compatibility unless an approved migration is necessary;
- build deterministic fixtures and unit/integration tests.

Validation:

- domain tests cover representative and adversarial legacy cases;
- server-only code cannot enter client bundles;
- tests prove that denied operations perform no protected read or side effect and that quota reservations reconcile safely;
- database integration tests run against an isolated test database;
- no production migration is executed automatically.

### Wave 3 — Authentication and application shell

Scope:

- integrate Better Auth using its TanStack Start/Workers support;
- port GitHub login, collaborator login/invites, account linking, session handling, and logout;
- derive the canonical principal and tenant context used by access-policy decisions;
- implement authenticated root routing and request-scoped session memoization;
- build the persistent application shell, repository selection, settings entry point, pending states, and error states;
- preserve return-to behavior and origin/CSRF protections.

Validation:

- authentication contract and browser tests pass;
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

### Wave 5 — Collections, files, entries, references, and editors

Scope:

- port collection queries, filtering, sorting, pagination, entries, history, files, and references;
- implement the field extension boundary;
- implement entry create/edit/rename/delete and allowed-operation enforcement;
- enforce hosted access policy at collection, entry, file, reference, and mutation service boundaries;
- lazy-load heavyweight field editors and optional field implementations;
- introduce the local document-session abstraction;
- implement optimistic updates where rollback is safe.

Validation:

- domain, contract, and browser tests cover all content operations;
- configuration-defined readonly/disabled operations are enforced on client and server;
- free-tier and paid-tier policy matrices pass for representative content operations;
- editor bundles do not load on collection-only routes;
- conflicts and stale SHAs produce understandable recovery behavior.

### Wave 6 — Media, actions, collaborators, cache, settings, and admin

Scope:

- port media browsing and mutations through the canonical manifest and public GitHub provider;
- share headless media behavior between the full-page browser and embedded picker while retaining their distinct layouts;
- restore legacy-equivalent request coalescing, temporary private-URL caching, stale display, lazy loading, and request-count instrumentation before adding hosted optimizations;
- prove the media provider contracts with the private S3 plugin, then evaluate the private Cloudflare delivery/transform plugin against measured need;
- port configured actions and action-run synchronization;
- port collaborator management and provider-backed invitation email;
- port cache inspection/maintenance UI;
- finish user settings, identities, installations, profile, and administration;
- add generic upgrade/plan-required/quota-exceeded UI driven by typed policy denials, plus explicit extension slots for hosted billing and proprietary account-management UI;
- complete route-specific pending/error/empty states.

Validation:

- critical journeys pass end to end;
- provider-specific dependencies remain optional and split appropriately;
- hosted-only UI and server modules are absent from the ordinary open-source build;
- destructive operations require confirmation and recover correctly from failure;
- administration remains server-authorized.

### Wave 7 — Webhooks, cache hardening, performance, and security

Scope:

- port installation, push, and action webhook behavior;
- harden hosted billing webhook synchronization, entitlement invalidation, policy-version observability, atomic usage accounting, and audit behavior in the private deployment test suite;
- implement durable invalidation/version semantics and keep request work awaited;
- measure and remove waterfalls, redundant requests, oversized chunks, and unnecessary compatibility shims;
- perform dependency, authorization, secret-handling, CSRF, webhook, and private-cache reviews;
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
| Optional providers inflate the Worker | Static provider configuration, split modules, and bundle reports. |
| Payment enforcement is bypassed through an alternate endpoint | Authorize in shared application services, inventory every operation, and add deny-path contract tests across routes, server functions, jobs, and webhooks. |
| Client capability state becomes an authorization source | Treat it as display-only; every authoritative decision is made again by the server policy gateway. |
| Free-tier quotas race under concurrent requests | Use atomic policy reservations or transactions rather than check-then-write logic, with idempotent reconciliation. |
| A hosted policy outage either grants access or breaks recovery | Fail closed for gated operations, keep narrowly defined recovery/health paths available, and document/operator-test the failure mode. |
| Private packages leak into public or client bundles | One-way dependency from private extensions to public contracts, explicit server/client entry points, bundle inspection, and clean public-build CI without private registry credentials. |
| Plugin contracts become a second unstable framework | Keep extension points narrow, versioned, and requirement-driven; do not promise arbitrary runtime plugins or routes. |
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
5. Initial email provider and the configuration contract for custom providers.
6. Whether existing external API route shapes are public compatibility contracts or internal implementation details.
7. Which current behaviors are known defects and should intentionally not be reproduced.
8. Quantitative performance budgets after the first deployed shell and first representative content route are measurable.
9. The hosted billing provider and whether subscription state is mirrored locally or queried through a dedicated entitlement service.
10. The billing tenant: individual user, organization, GitHub installation, repository owner, or an explicit hierarchy of these identities.
11. Initial free-tier rules, including what counts as a repository, how public/private visibility changes are handled, and what existing users receive at launch.
12. Grace-period, cancellation, delinquency, administrative override, and data-access behavior after entitlement loss.
13. The private package distribution and deployment-composition mechanism, including local development and CI credential handling.
14. Whether proprietary features need build-time route contributions in the first release or can use core-owned extension slots.
15. Extension API compatibility and release policy between the public application and private hosted packages.
16. Ownership and migration policy for hosted-only database tables, plus the licensing boundary for public contracts and private implementations.

## 12. Immediate next step

Measure the current and legacy media paths for representative public and private repositories, then implement the portable GitHub manifest and request-coalescing slice described in section 5.5.1. Do not begin S3 or Cloudflare-specific optimization until baseline request counts, first useful render, and visual behavior are verified.
