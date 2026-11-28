# Architecture

Pages CMS is a React single-page application backed by a Hono API. Git repositories hold project content; application data and caches live in SQLite-compatible databases. Runtime adapters target Node.js and Cloudflare Workers, with experimental Vercel and Netlify function adapters.

```text
Browser (React SPA)
        │ JSON API
        ▼
Node.js (server, Netlify or Vercel Functions) or Cloudflare Workers
        │
        ▼
Hono routes → authorized services → repository adapter → GitHub
                     ├───────────→ application database
                     └───────────→ cache database
```

## Key decisions

- **Store project content in Git; keep local drafts in the browser and use file revisions for conflict detection.** Existing site builds and Git workflows remain the source of truth, while unsaved edits can survive navigation and reloads. [Data](#data)
- **Use SQLite-compatible libSQL or D1, with separately addressable application and cache databases.** All runtime adapters share a schema; disposable cache work must not require a cross-database transaction. [Data](#data)
- **Establish repository admission in core, then apply extension policies.** Policies cannot bypass admission; explicit grants can delegate supported actions to admitted collaborators. [Requests and authorization](#requests-and-authorization)
- **Use GitHub App installation tokens for invited collaborators and user credentials for direct GitHub-user access.** Invited Pages CMS collaborators can work on a repository without their own GitHub access, subject to their membership and permissions. [Requests and authorization](#requests-and-authorization)
- **Access repository content through a provider-neutral interface, with GitHub-specific behavior in its adapter.** Content services can share contracts without pretending authentication, discovery and webhooks are provider-neutral. [Data](#data)
- **Compose deployment plugins from `pagescms.config.ts` at build time.** Consumers control installed capabilities and runtime credentials, while shared definitions remain separate from server and browser implementations. [Extensibility](#extensibility)
- **Generate public documentation and a compact configuration reference from repository-owned sources.** The website and integrations can use versioned artifacts without coupling runtime validation to documentation. [Documentation artifacts](#documentation-artifacts)
- **Cache raw collection content and parse it on listing, rather than maintaining parsed-entry projections.** The measured small-site gain did not justify the extra cache machinery. [Data](#data)
- **Keep runtime Drizzle imports at database and authentication boundaries.** Query building measured about 4.7 ms per request; Better Auth retains its adapter. [Data](#data)
- **Preserve edits made while a save is in flight.** Acknowledging the submitted version must not erase later edits. [Data](#data)

## Code map

| Directory            | Responsibility                                                       |
| -------------------- | -------------------------------------------------------------------- |
| `src/routes`         | URLs, loaders, guards, page metadata and error/pending boundaries    |
| `src/features`       | Product UI, feature state and client workflows                       |
| `src/components`     | Shared components; `ui/` contains registry primitives                |
| `src/client/api`     | Browser API clients                                                  |
| `src/client/queries` | Query keys and reusable query options                                |
| `src/shared`         | Configuration, serialization, paths and request parsing              |
| `src/server`         | Authorization, application services, persistence and adapters        |
| `src/lib`            | Shared utilities and client helpers                                  |
| `src/plugins`        | Neutral extension contracts and bundled implementations              |
| `src/package`        | Consumer configuration, generated entries, CLI and build integration |

## Requests and authorization

Routes validate requests and delegate to services. Core establishes repository admission before extension policies run; discovery filtering never replaces authorization of a direct operation. Account-scoped operations check the initiating account, and Core and private plugin browser writes share one same-origin check against the configured public URL, including behind TLS-terminating proxies. Reference-option and media-delivery reads use POST for potentially large input lists.

Policies may deny access and explicitly delegate action run, cancel or rerun to admitted collaborators. An ordinary allow does not itself grant these operations.

Repository identity is the forge instance and opaque provider ID, not the mutable owner/name address. Admission and verified webhook metadata maintain address mappings. Transfers must not inherit the previous owner's grants; stale aliases and provisional identities cannot authorize access. Application and cache databases have separate local IDs for the same provider identity. A repository-deletion webhook revokes collaborator grants by the signed repository ID; restoring the repository does not restore them.

Content and media paths are canonicalized before policy checks and passed unchanged to providers; containment compares whole path segments. Branch names are encoded once at the routing boundary. Media delivery authorizes each requested path. Fixed-file writes require both an early resource grant and a grant for the resolved physical path; a credential fallback resolves and authorizes its own principal. Direct-upload completion and abort also check the authorized path against the signed ticket before storage effects.

Better Auth instances are reused within a deployment, database and auth configuration because plugin initialization can include database work. Migrations own the auth schema, so Better Auth schema validation is disabled. Cloudflare initialization that needs bindings or D1 stays request-bound. See [authentication](docs/development/authentication.md) and [plugins](docs/development/plugins.md).

## Data

`RepositoryApi` provides the content-facing repository contract; GitHub authentication, discovery, Actions and webhooks remain adapter-specific. File writes use revisions for optimistic concurrency. Durable application data and the disposable cache are independently addressable. Migrations run explicitly rather than as startup or build side effects. Application queries use SQL directly; runtime Drizzle imports are restricted to the database and auth boundaries, with Better Auth using its adapter. See [database development](docs/development/database.md).

Directory snapshots store raw collection content, which listings parse on each request; there are no parsed-entry projections. Snapshots publish metadata and contents atomically, guarded by revision so an older refresh cannot overwrite a newer result. An incomplete push cannot establish a complete snapshot: it is invalidated for reconciliation. Once a GitHub write succeeds, a cache failure must not turn it into a retryable write failure. [Webhooks and cache](docs/development/webhooks-and-cache.md) describes freshness, publication and invalidation.

Media manifests store metadata, not binary contents or private delivery URLs. Authenticated delivery leases resolve visible assets; saved rich-text references never contain short-lived URLs. Provider identity and authorization are checked at delivery; the client batches visible assets.

Drafts live in IndexedDB with their original file revision. Overview queries lightweight summaries by account, source, repository ID, and branch. Summary and draft changes commit in the same browser transaction. Local revision guards prevent stale tabs or cleanup from overwriting newer drafts; acknowledging a save clears only the submitted snapshot and preserves later edits. The server still decides whether a remote write conflicts. Activity is separate from cache state, deduplicates local writes and webhooks, and applies current resource permissions when read. See [local drafts](docs/features/local-drafts.md) and [activity](docs/features/activity.md).

## Content pipeline

Repository configuration is parsed, normalized and validated before it supplies content models and fields. Invalid source remains available for an authorized writer to repair, but content operations do not accept invalid configuration. Infrastructure failures do not enter that recovery path.

Field definitions and codecs are shared independently of UI modules. Serialization supports YAML, JSON and TOML, including front matter; merge mode preserves unmanaged current-file data and replaces arrays. The rich-text registry owns HTML parsing, sanitization and serialization; the CMS adapter supplies field options and media integration. Tiptap dependencies must share one ProseMirror model identity. See [rich text](docs/features/rich-text.md).

Content localization is separate from interface language. Configuration defines either separate files or locale-keyed values; canonical paths group translations. One draft retains the complete document, and group operations authorize every physical source and destination. See [content localization](docs/features/content-localization.md).

## Extensibility

A package consumer owns `pagescms.config.ts`, dependencies and plugins. Descriptors reference server, shared and UI contributions without importing runtime implementations; generated entries and output belong to the consumer. Node servers, Netlify Functions and Vercel Functions all use the `node` plugin target and migration command. Function builds select the remote libSQL driver. Each host adapter routes requests and supplies its hook for finishing work after the response. Secrets come from runtime environment settings. Core and plugins use separate migration journals. See [plugins](docs/development/plugins.md) and [Cloudflare development](docs/development/cloudflare.md).

Plugins can contribute credential revocation statements to the application database transaction that removes browser sessions. An administrator's cutoff therefore succeeds or rolls back across every participating credential store.

Plugin repository pages have internal identities and unique public slugs resolved by a generic route. Core reserves its own route namespaces. Plugins can contribute server handlers, authentication, account sections and standalone pages. In-process extensions use the same authorized `server/services` operations as API handlers; they do not need synthetic sessions or HTTP proxies.

## Client

Route loaders and components share TanStack Query options. Cache keys include account and repository scope. Loading placeholders use authorized schema labels, never cached file values. Once a write commits, a later cache or acknowledgement failure must not trigger a duplicate submission.

UI modules load lazily. Speculative component preloading is separate from route loaders and authorization, and a failed speculative import can be retried by normal navigation. A single notification boundary owns each action failure; field validation, conflict recovery and failed reads have their own presentation paths.

Each router owns a Lingui instance. Interface language follows the authenticated preference, then the language cookie, then browser negotiation. Plugin catalogs are combined with core catalogs; authored repository content and labels are not translated. Diagnostics retain canonical values and are translated at presentation boundaries. A catalog failure must not prevent the recovery interface from rendering. Lingui macro helpers are compile-time bindings: hook dependency arrays use the live `i18n` instance instead.

## Documentation artifacts

`docs/public/` contains the curated public manual. `scripts/build-reference.mjs` generates a versioned static reference artifact and a compact configuration reference module. Hosted consumes the module server-side; the website combines the core and hosted artifacts. Build and reference checks validate artifact identities and documentation examples. Internal development and feature docs remain outside the public artifact.

For implementation details and verification, see [testing](docs/development/testing.md), [parity](docs/development/parity.md), and [TODO](TODO.md).
