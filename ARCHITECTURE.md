# Architecture

## Repository boundary

The TanStack Start application lives at the repository root. `_legacy/` is a frozen behavioral reference and must not be imported by new code.

## Runtime shape

TanStack Router owns URL parsing, loader orchestration, pending/error boundaries, and intent preloading. TanStack Query owns reusable client-side server state. TanStack Start server functions and server routes form the application transport boundary. Ordinary development runs under Node; explicit build, preview, compatibility, and deployment commands select the Cloudflare Workers production adapter.

```text
route or server function
  -> validation and authorization
  -> application service
  -> GitHub, database, email, or background-work adapter
```

Route files own loader and page composition. Reusable product UI belongs in `src/components`; shadcn primitives live in `src/components/ui`; framework-neutral rules live in `src/lib`; authenticated operations live in `src/functions`; application services and adapters live in `src/server`.

## Request lifecycle

Requests receive a validated or generated correlation identifier. Server logs are structured JSON. Request-scoped state must be passed explicitly and never stored in mutable module globals. Background work must be awaited, reported by the local Node adapter, or registered with the Workers execution context.

PostgreSQL uses the legacy-compatible Drizzle schema and migration history. A Postgres.js client is created per request from the Node development environment or eventual Hyperdrive binding with a conservative connection limit, type-fetch round trips disabled, and prepared statements enabled. Database construction receives the connection string explicitly from its runtime adapter; the Drizzle release CLI separately loads `DATABASE_URL` from `.env.local`.

## Data and caching

TanStack Router uses intent preloading, route-specific stale windows, skeletons after short pending delays, and ten-minute garbage collection for repository content. Internal navigation uses typed links so the persistent repository shell and route cache survive page changes. TanStack Query handles reusable paginated repository discovery with placeholder data.

Configuration and directory snapshots are stored in PostgreSQL when repository caching is enabled. Fresh snapshots are returned immediately; expired snapshots are returned as stale while a request-scoped background task refreshes them. Content mutations and signed GitHub push/installation webhooks invalidate the affected scopes. Private media previews use authenticated responses with private browser caching and ETags; private repository content is never placed in a public CDN cache.

### Canonical repository identity

GitHub repository owners and names retain their display casing at application boundaries, but cache and persistence identities lowercase both values because GitHub repository coordinates are case-insensitive. Branch names and Git paths remain case-sensitive.

Dynamic route values are encoded as exactly one URL segment and decoded exactly once at the routing boundary. Internal domain values are never stored URL-encoded.

Git paths use canonical repository-relative strings without a leading or trailing slash, empty segments, or `.` segments. Parent segments are resolved, but a path that would escape the repository root is rejected. Containment is checked on complete path segments rather than raw string prefixes. Query/cache keys are structured tuples so repository, branch, and path boundaries cannot collide.

### Configuration pipeline

Configuration handling is split into source parsing, legacy normalization, product validation, and editor source mapping. The framework-neutral source parser returns plain data plus positional diagnostics; it does not import the field registry, mutate the input, apply defaults, or decide whether a draft may be saved. Invalid but recoverable YAML remains available to editor callers, while server callers must reject any result with error diagnostics before persistence.

Normalization is a pure clone-and-transform step. It migrates legacy settings, media, commit, filename, component, format, and navigation forms without retaining YAML AST or UI dependencies. Repository-relative input and content paths use the canonical Git-path rules, so unlike the legacy normalizer they reject traversal above the repository root.

The configuration schema remains strict and retains the legacy validation surface, but its core field-type catalog is plain metadata rather than an import of the React field registry. This prevents validation in loaders and server services from eagerly pulling editor implementations into their bundles. Custom `component` fields resolve through the independent client plugin registry.

Content serialization is also framework-neutral and supports raw or frontmatter YAML, JSON, and TOML. Frontmatter parsing keeps the body byte-for-byte after newline-boundary normalization. JSON frontmatter is scanned to its actual closing object boundary instead of using the legacy greedy regular expression, so braces in document bodies are safe. TOML uses the small ESM-only `smol-toml` implementation rather than the substantially larger legacy parser.

## Plugins

Plugins are trusted build-time modules discovered from `plugins/*/plugin.ts`. The registry validates identifiers, API versions, and duplicates before rendering the application. Manifests are client-safe; optional capabilities are discovered independently from `plugins/*/server.ts` and guarded by `.server.ts` boundaries.

The first server capability is the access-policy provider. Server functions authorize stable operation identifiers against principal, tenant, repository, branch, collection, media, and path targets before protected work. Hosted startup fails without a provider; self-hosted deployments select an explicit versioned allow-all policy. Quota-consuming mutations reserve atomically before their side effect and settle the reservation afterward. Billing and role logic therefore remains replaceable proprietary plugin code without becoming a client-side authority or a fork.

Email is a second isolated server capability with one small provider contract and no default SMTP dependency. Runtime time, identifiers, and background execution also use injectable ports. Runtime adapters use `Date` and Web Crypto; Cloudflare additionally registers background work with the Workers execution context. Tests can supply deterministic implementations without mutable module-level request state.

An optional client contribution can register custom field components by name. Client, manifest, and server entry points are discovered independently, preventing a server-only billing or email dependency from entering browser chunks. Rich-text editing is additionally client-only and lazy-loaded.

The public core must build with an empty plugin directory. Hosted and proprietary packages depend on public contracts, never the reverse.

## Cloudflare invariants

- `wrangler.jsonc` uses the current compatibility date and `nodejs_compat`.
- Binding types are generated with Wrangler rather than hand-written.
- Secrets are never committed or stored under `vars`.
- External PostgreSQL access will use Hyperdrive.
- Shared private content will not be placed in public CDN caches.
