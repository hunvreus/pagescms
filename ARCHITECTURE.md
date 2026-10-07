# Architecture

## Repository boundary

The TanStack Start application lives at the repository root. `_legacy/` is a frozen behavioral reference and must not be imported by new code.

## Runtime shape

The rich-text editor requires one ProseMirror model module identity across Tiptap dependencies. The pnpm override pins its version and Vite deduplicates `@tiptap/pm`. Browser tests use a separate Vite dependency cache so their server does not rewrite optimized modules used by the local development server.

Admin table searches use registry Input Group controls and filter on input with a 250 ms debounce. A spinner covers debounce and fetching; results are prefetched before URL navigation so existing rows remain visible, including on failure. Each filter resets only its own pagination and replaces the URL search state without scrolling. Initial loads use table skeletons; filtering exposes busy state and announces result counts. Global and repository Content cache rows use separate muted file/directory badges.

Global Admin settings separates Users, Repositories, and Cache. The application database records repositories after successful workspace opens; this inventory is independent of disposable cache and starts tracking when the migration is installed, rather than claiming to enumerate every accessible repository. Both tables have independent search/pagination. Repository Open links use normal repository authorization. Global cache clearing supports content, configuration, permissions, or all scopes; repository inventory and collaborator access records are never cleared. Session revocation and cache clearing use destructive Alert Dialog confirmations.

TanStack Router owns URL parsing, loader orchestration, pending/error boundaries, and intent preloading. TanStack Query owns reusable client-side server state. TanStack Start server functions and server routes form the application transport boundary. The application uses the same request services and `process.env` configuration locally and when deployed. Cloudflare-specific code is limited to build and deployment configuration.

```text
route or server function
  -> validation and authorization
  -> application service
  -> GitHub, database, or email adapter
```

Route files own loader and page composition. Reusable product UI belongs in `src/components`; shadcn primitives live in `src/components/ui`; framework-neutral rules live in `src/lib`; authenticated operations live in `src/functions`; application services and adapters live in `src/server`.

## Request lifecycle

Repository administration lives on one Settings page. Configuration appears as a faded read-only field preview with a matching loading skeleton; Edit expands and focuses it inline with diagnostics, Save/Cancel, and unsaved-change protection. The `edit=configuration` deep link activates inline editing. View .pages.yml links to the file on the current branch. Repository GitHub links use a server-resolved access flag shared through the workspace context: direct user credentials allow links, invitation-backed installation credentials do not, even when the account has a linked GitHub username. Settings sections use title-only headers; table/list empty states use ordinary row padding rather than tall placeholders. Action discovery omits run retrieval and synchronization until the runs dialog is opened; server authorization applies to both requests. Cache maintenance uses compact rows with directory details in a dialog whose body owns scrolling; the table wrapper only provides presentation.

Requests receive a validated or generated correlation identifier. Server logs are structured JSON. Request-scoped state must be passed explicitly and never stored in mutable module globals. Request-triggered work is awaited. A real queue may be introduced later only for work that is deliberately asynchronous and operationally durable.

One SQLite Drizzle schema supports local/libSQL, Turso, and Cloudflare D1 adapters. Native libSQL imports are isolated from the Worker adapter. Durable application data and rebuildable repository caches are separately addressable and use separate local files by default; application behavior never requires a transaction across them. PostgreSQL migrations are retained under `drizzle-postgresql/` only as data-migration reference material. Builds and application startup never apply migrations.

## Data and caching

TanStack Router uses intent preloading and coordinates initial data requirements. Route loaders call `ensureQueryData`; route components subscribe to the same feature-owned query options with `useSuspenseQuery`. TanStack Query controls resource-specific freshness, deduplicates requests, retains cached data for navigation, and revalidates stale data without replacing it with a full-page skeleton. Mutations invalidate canonical repository or branch key prefixes rather than reloading every route.

Internal page links, including editor and collection breadcrumbs and their parent-folder menus, use TanStack `Link` so navigation preserves the document and query cache and inherits global intent preloading. External links and authentication/install endpoints remain ordinary anchors. Entry history shows three skeleton rows while loading and at most three commits afterward.

Configuration and directory snapshots use the rebuildable SQLite cache for every repository. Fresh directory snapshots avoid GitHub reads; expired snapshots check the branch revision before downloading content. Complete signed pushes and successful GitHub writes incrementally patch matching snapshots, preserving unchanged rows. Changed files are retrieved at the commit revision in GraphQL batches of 50; editor saves reuse the submitted content. Missing predecessor revisions, incomplete pushes, and affected ancestor directories mark snapshots stale for reconciliation instead of deleting their contents. Refreshes fetch outside the database and publish each directory with a compare-and-swap version, a unique publication token, and one adapter-atomic batch. A stale or concurrent publisher therefore cannot expose a mixed listing. Media cache rows contain metadata, never binary content or private download URLs. TanStack Query provides the user-visible stale-while-revalidate behavior. Private media previews use authenticated responses with private browser caching and ETags; private repository content is never placed in a public CDN cache.

### Canonical repository identity

Repository caching is always on, independent of configuration switches. Cache administration is visible to direct GitHub users with repository write access and exposes aggregate file, directory, and permission counts plus the configuration's last-check timestamp. Clear controls remain visible but disabled for empty scopes. It does not expose a per-directory inspector or detailed directory-status payload; internal directory metadata remains necessary for cache reconciliation.

Settings loads tracked action runs on demand in a viewport-bounded dialog whose scrolling body retains its dimensions while loading. The section-level control opens all actions; each action's Run menu opens its own filter. Search and action filters apply before ten-row pagination to the latest 100 tracked runs for the current repository branch; that limit is shown when reached.

Repository content services depend on the provider-neutral `RepositoryApi`; GitHub discovery, OAuth, App tokens, and webhooks remain in the GitHub adapter. A future forge or local checkout supplies the same content/commit contract and its own access resolver. Directory, media, configuration, and editor caches do not import GitHub types or errors; provider-specific product features remain separate adapters.

Durable configuration and directory identities begin with a stable repository source (`github.com`, an enterprise forge origin, or a unique local checkout ID). GitHub repository owners and names retain their display casing at application boundaries, but cache and persistence identities lowercase both values because GitHub repository coordinates are case-insensitive. Branch names and Git paths remain case-sensitive. The source dimension prevents repositories with identical owner/name coordinates on different forges from sharing cached content.

Dynamic route values are encoded as exactly one URL segment and decoded exactly once at the routing boundary. Internal domain values are never stored URL-encoded.

Git paths use canonical repository-relative strings without a leading or trailing slash, empty segments, or `.` segments. Parent segments are resolved, but a path that would escape the repository root is rejected. Containment is checked on complete path segments rather than raw string prefixes. Query/cache keys are structured tuples so repository, branch, and path boundaries cannot collide.

### Configuration pipeline

Configuration handling is split into source parsing, legacy normalization, product validation, and editor source mapping. The framework-neutral source parser returns plain data plus positional diagnostics; it does not import the field registry, mutate the input, apply defaults, or decide whether a draft may be saved. Invalid but recoverable YAML remains available to editor callers, while server callers must reject any result with error diagnostics before persistence.

Normalization is a pure clone-and-transform step. It migrates legacy settings, media, commit, filename, component, format, and navigation forms without retaining YAML AST or UI dependencies. Repository-relative input and content paths use the canonical Git-path rules. Before traversal above the repository root becomes a hard error, one compatibility release records a structured diagnostic for affected repositories so an intentional security correction does not become a silent migration break.

The configuration schema remains strict and retains the legacy validation surface, but its core field-type catalog is plain metadata rather than an import of the React field registry. Custom field definitions in `src/fields/custom/*/index.ts` expose portable synchronous schema/default/read/write behavior; editor and collection-view components live in separate lazy-loaded modules. Server validation never imports their React UI. Deployment-provided `component` fields still resolve through the explicitly configured client field registry.

Structured entries normalize date storage formats to browser input values on read and back on write, recursively through objects, lists and blocks. Saves project configured fields before serialization; `settings.content.merge` preserves unmanaged data from the current server file and replaces arrays. Upload naming is enforced server-side, with deterministic per-request random names so initiation and upload retries agree.

Content serialization is also framework-neutral and supports raw or frontmatter YAML, JSON, and TOML. Frontmatter parsing keeps the body byte-for-byte after newline-boundary normalization. JSON frontmatter is scanned to its actual closing object boundary instead of using the legacy greedy regular expression, so braces in document bodies are safe. TOML uses the small ESM-only `smol-toml` implementation rather than the substantially larger legacy parser.

## Deployment composition

“Plugin” describes how optional or proprietary code is packaged; it is not a generic runtime plugin framework. Pages CMS exposes a small, closed, versioned deployment configuration. The public build statically resolves that configuration to the in-tree default. The hosted build resolves the same alias to a composition file in the private sibling repository, initially `../pro`.

The deployment uses two build-time entry points: `#pagescms/deployment/server` for authoritative factories and secrets, and `#pagescms/deployment/client` for lazy client contributions and field editors. It explicitly assigns implementations to application-owned boundaries such as `accessPolicy`, `entitlementReader`, `email`, per-context media storage/delivery resolvers, the fixed billing webhook handler, the configured field registry, and the repository-permissions server/UI pair. Core does not scan arbitrary directories, infer module categories, iterate hook bags, inject catch-all routes, or allow private modules to replace internal services indiscriminately.

Server-only decisions and credentials remain in server entry points. Client-safe entitlement projections and named UI contributions are separate lazy entry points. Core owns routes, validation, application services, and the authorization gateway. Hosted billing and granular permissions are coordinated behind one authoritative `AccessPolicy`; quota-consuming mutations reserve and settle atomically. GitHub authorization remains an independent requirement.

Repository admission resolves the effective GitHub user or core collaborator principal before hosted policy evaluation. The gateway also supports one batched discovery decision for configured collections, media sources, and actions. Filtered resources are removed from the workspace configuration returned to the browser and from action-list results, while every direct read and mutation still performs an exact server authorization check. Discovery is a usability and disclosure boundary, never an authorization substitute.

The public composition uses the explicit allow policy, GitHub storage plus direct delivery, and configured HTTP email adapter. It builds with `../pro` absent and must contain no proprietary identifiers or packages. Hosted production validates that its required private composition and deployment API version are present. Private modules depend only on approved public deployment contracts and conformance harnesses; the public repository never imports a proprietary implementation directly. Core owns billing presentation from a safe entitlement projection. Optional repository-permission UI is accepted only with its paired authoritative server contract.

See [Deployment composition](docs/development/plugins.md) for the maintained deployment design.

## Cloudflare invariants

- `wrangler.jsonc` uses the current compatibility date and `nodejs_compat`.
- Binding types are generated with Wrangler rather than hand-written.
- Secrets are never committed or stored under `vars`.
- Runtime configuration is read from `process.env`, supported by Workers through the configured compatibility date and `nodejs_compat`.
- Shared private content will not be placed in public CDN caches.
