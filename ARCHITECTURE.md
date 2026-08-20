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

## Plugins

Plugins are trusted build-time modules discovered from `plugins/*/plugin.ts`. The initial registry validates identifiers, API versions, and duplicates before rendering the application. Plugin manifests are client-safe; server capabilities and access policies will use separate server-only contracts.

The public core must build with an empty plugin directory. Hosted and proprietary packages depend on public contracts, never the reverse.

## Cloudflare invariants

- `wrangler.jsonc` uses the current compatibility date and `nodejs_compat`.
- Binding types are generated with Wrangler rather than hand-written.
- Secrets are never committed or stored under `vars`.
- External PostgreSQL access will use Hyperdrive.
- Shared private content will not be placed in public CDN caches.
