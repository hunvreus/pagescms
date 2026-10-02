# Cache decision and repository-provider handoff

2026-09-26 · Branch: `overhaul/tanstack-start`

> **Superseded database note:** the incremental cache behavior described here
> remains current, but the subsequent SQLite migration replaced PostgreSQL with
> local/libSQL, Turso, and D1 adapters. Publication now uses explicit versions,
> compare-and-swap tokens, and adapter-atomic batches. See
> [Database](docs/development/database.md) and
> [Webhooks and cache](docs/development/webhooks-and-cache.md).

## Decision

Restore incremental caching first. Keep PostgreSQL and API-based repository access for now. Do not introduce a whole-repository Git-tree cache or server-side Git mirrors as part of this fix. This is a scope decision, not proof that those alternatives cannot be faster.

Legacy already cached file paths, SHAs and content and fetched changes in GraphQL batches. The rewrite regressed by deleting/rebuilding directory rows and clearing branch caches. Restoring that behavior is not a new “Git identities” architecture.

## Implemented locally

- Complete small GitHub pushes patch snapshots whose cached revision matches the push's previous revision. Changed files use batches of 50. Legacy webhook limits are restored: above 120 changed paths use scoped stale marking; above 800 mark the branch stale. Both limits are configurable. A direct 1,000-file incremental sync uses 20 content queries, but is not the default inline webhook policy.
- Unchanged rows retain their IDs and timestamps. Editor saves reuse submitted content. GitHub media writes use the incremental path too.
- Expired snapshots check the branch revision first. If unchanged, no directory/content download is needed until the configurable full-snapshot TTL expires. Reconciliation updates changed rows rather than replacing everything.
- Incomplete/forced pushes, missed predecessor revisions and affected ancestor directories mark snapshots stale for reconciliation. Ordinary pushes no longer delete the branch cache. Explicit clears and access-removal/deletion events remain separate.
- Publication is serialized with branch-scoped PostgreSQL transaction locks; version checks reject refreshes superseded while downloading.
- Media database rows contain metadata, not image binaries or temporary private URLs. No extra whole-repository tree table, filesystem mirror or database split was added.

Main files: `src/server/{directory-cache,directory-cache-store,repository-cache,github-api,github-webhook}.server.ts`; editor/media mutation integration; `tests/integration/database.test.ts`.

The follow-up [legacy behavior audit](docs/development/webhooks-and-cache.md#legacy-cache-behavior-audit) covers CMS writes, configuration write-through, colocation, node-file reuse, TTL/read caches, rename preservation and explicit differences with reasons. Treat that audit—not the earlier abbreviated claim of restoration—as the detailed record. The current validation and database-conformance commands are documented in [Testing](docs/development/testing.md). These are not production load tests.

## Alternatives considered

- **Metadata/tree-first reconciliation:** potentially transfers less content for large, mostly unchanged collections, but adds a sequential lookup when content changed. Small collections or widespread changes may not benefit. Legacy batched updates already address known changes. No representative benchmark established a winner; don't claim otherwise.
- **Whole-repository tree cache:** includes unrelated paths and introduces synchronization/storage work. It does not itself remove GitHub coupling or replace the content cache.
- **Bare/partial Git mirror:** could benefit repeated local operations, but adds filesystem storage, fetching, eviction, concurrency and hosting constraints. Not required to support a local-repository adapter.
- **SQLite / D1 / separate app and cache databases:** deferred, not rejected or implemented. Assess actual storage, write contention, query/runtime limits and recovery needs before choosing. The new PostgreSQL locking mechanism would need a portable equivalent; a database swap is not drop-in.

## Proposed follow-up: multiple forges and local Git

1. Extract a small repository interface from actual consumers: resolve revision, list directory, batch-read files, read history, commit changes with an expected base revision, and repository access checks. Keep batching, pagination, API errors and webhook translation inside adapters. Avoid exposing GitHub GraphQL shapes to features.
2. Identify repositories by connection/instance plus provider repository identity—not just `owner/repo`. Include that identity in persistence, authorization and cache keys. GitHub Enterprise and self-hosted GitLab instances must not collide. Preserve provider-specific path/case rules.
3. Port GitHub first without losing request batching; add GitLab/Forgejo adapters against the same contract tests. Model optional capabilities explicitly. Keep S3/R2 media storage separate from Git repository operations.
4. A local Git adapter runs in a trusted desktop/Node process, not directly in a hosted browser or Worker. Define committed-HEAD versus working-tree behavior, external-change detection, write conflicts and allowed filesystem roots before implementing it; do not silently discard uncommitted work.
5. Separate **Pages CMS login** from **repository connections**. A login does not imply repository access. Support configured GitHub/GitLab/enterprise sign-in providers and independently connected repository accounts. Request minimal identity access at sign-in, then repository authorization when connecting/searching; the actual mechanism differs by provider and may require an app installation or token rather than OAuth scope escalation.
6. Update UI: configured sign-in choices; connection/instance management; provider-aware repository search and project selection; neutral repository headers, settings and action labels; provider-specific external links; capability-driven controls; reconnect/access-denied states. Local folder selection appears only in supported runtimes. Audit GitHub assumptions in routes, onboarding, collaborators, permissions and media—not just icons. Define safe account linking and enterprise-instance validation too.

Start with an inventory of GitHub coupling and the interface tests. Preserve current behavior while extracting the GitHub adapter, then prove the boundary with a second adapter. No multi-forge implementation or UI redesign has been completed yet.
