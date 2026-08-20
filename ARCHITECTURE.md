# Architecture

## Repository boundary

The TanStack Start application lives at the repository root. `_legacy/` is a frozen behavioral reference and must not be imported by new code.

## Runtime shape

TanStack Router owns URL parsing, loader orchestration, pending/error boundaries, and intent preloading. TanStack Query owns reusable client-side server state. TanStack Start server functions and server routes form the application transport boundary. Cloudflare Workers is the primary runtime.

```text
route or server function
  -> validation and authorization
  -> application service
  -> GitHub, database, email, or background-work adapter
```

Route files stay thin. Product UI and client behavior belong in `src/features`; shared presentation primitives belong in `src/components`; server behavior belongs in `src/server`.

## Request lifecycle

Requests receive a validated or generated correlation identifier. Server logs are structured JSON. Request-scoped state must be passed explicitly and never stored in mutable module globals. Background work must be awaited or registered with the Workers execution context.

## Data and caching

The router preloads code and required route data. TanStack Query begins with a conservative 30-second default freshness window and five-minute garbage-collection window. Feature query definitions will override these defaults according to resource semantics. Durable cache ownership, keys, versioning, and webhook invalidation are introduced in later waves.

### Canonical repository identity

GitHub repository owners and names retain their display casing at application boundaries, but cache and persistence identities lowercase both values because GitHub repository coordinates are case-insensitive. Branch names and Git paths remain case-sensitive.

Dynamic route values are encoded as exactly one URL segment and decoded exactly once at the routing boundary. Internal domain values are never stored URL-encoded.

Git paths use canonical repository-relative strings without a leading or trailing slash, empty segments, or `.` segments. Parent segments are resolved, but a path that would escape the repository root is rejected. Containment is checked on complete path segments rather than raw string prefixes. Query/cache keys are structured tuples so repository, branch, and path boundaries cannot collide.

### Configuration pipeline

Configuration handling is split into source parsing, legacy normalization, product validation, and editor source mapping. The framework-neutral source parser returns plain data plus positional diagnostics; it does not import the field registry, mutate the input, apply defaults, or decide whether a draft may be saved. Invalid but recoverable YAML remains available to editor callers, while server callers must reject any result with error diagnostics before persistence.

Normalization is a pure clone-and-transform step. It migrates legacy settings, media, commit, filename, component, format, and navigation forms without retaining YAML AST or UI dependencies. Repository-relative input and content paths use the canonical Git-path rules, so unlike the legacy normalizer they reject traversal above the repository root.

Content serialization is also framework-neutral and supports raw or frontmatter YAML, JSON, and TOML. Frontmatter parsing keeps the body byte-for-byte after newline-boundary normalization. JSON frontmatter is scanned to its actual closing object boundary instead of using the legacy greedy regular expression, so braces in document bodies are safe. TOML uses the small ESM-only `smol-toml` implementation rather than the substantially larger legacy parser.

## Plugins

Plugins are trusted build-time modules discovered from `plugins/*/plugin.ts`. The registry validates identifiers, API versions, and duplicates before rendering the application. Manifests are client-safe; optional capabilities are discovered independently from `plugins/*/server.ts` and guarded by `.server.ts` boundaries.

The first server capability is the access-policy provider. Core application services authorize stable operation identifiers against principal, tenant, repository, branch, collection, media, and path targets before protected work. Hosted startup fails without a provider; self-hosted deployments select an explicit versioned allow-all policy. Quota-consuming mutations reserve atomically before their side effect and settle the reservation afterward. Billing and role logic therefore remains replaceable proprietary plugin code without becoming a client-side authority or a fork.

The public core must build with an empty plugin directory. Hosted and proprietary packages depend on public contracts, never the reverse.

## Cloudflare invariants

- `wrangler.jsonc` uses the current compatibility date and `nodejs_compat`.
- Binding types are generated with Wrangler rather than hand-written.
- Secrets are never committed or stored under `vars`.
- External PostgreSQL access will use Hyperdrive.
- Shared private content will not be placed in public CDN caches.
