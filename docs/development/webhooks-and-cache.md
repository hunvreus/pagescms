# Webhooks and cache

Configuration and directory snapshots live in the separately addressable SQLite cache. Authorization runs before cached data is served. Collaborator memberships are checked on each request; session data can be cached in a signed cookie for the configured lifetime. Cached repository metadata is not a durable permission grant.

## Freshness and management

Each folder has its own saved listing. Opening a fresh media folder serves that listing from the database. By default, the first read after five minutes checks GitHub's current branch revision. If the revision matches and the full snapshot is still valid, the server reuses the listing. An idle browser tab does not poll for those checks. Empty folders follow the same rules.

A GitHub move affects both the source and destination. The write or push handler updates listings it can patch at the new revision and marks affected listings it cannot patch for a rebuild. For example, a move into a subfolder can update the destination immediately and leave the parent to rebuild on its next read. A rebuild resolves the revision directly from GitHub so an older commit remembered by another Worker cannot restore the old path. A move or rename that reports a missing file or GitHub conflict also marks both paths for refresh before the browser retries.

| Setting                                      | Default | Purpose                                                                       |
| -------------------------------------------- | ------- | ----------------------------------------------------------------------------- |
| `CONFIG_CHECK_MIN`                           | `5`     | Age at which a configuration read can start a background check                |
| `CACHE_CHECK_MIN`                            | `5`     | Directory revision-check interval                                             |
| `FILE_TTL_MIN`                               | `1440`  | Full snapshot lifetime; `-1` disables expiry, not revision checks or webhooks |
| `BRANCH_HEAD_TTL_MS`                         | `15000` | Process-local branch-head cache                                               |
| `REPO_META_TTL_MS`                           | `15000` | Credential-scoped repository metadata cache                                   |
| `WEBHOOK_PUSH_INCREMENTAL_MAX_FILES`         | `120`   | Maximum incremental push size; `0` disables this limit                        |
| `WEBHOOK_PUSH_SCOPED_INVALIDATION_MAX_FILES` | `800`   | Maximum path-scoped invalidation size; `0` disables this limit                |

`settings.cache: true` enables repository cache inspection and clear operations for GitHub users with write access. It does not enable automatic caching, which runs regardless. Missing configuration or a false/absent setting denies inspection and content clearing. Configuration-only clearing requires repository write access but does not read the configuration; global administrators retain their cache view. The old top-level `cache` setting and permission-cache TTL settings are unsupported.

A configuration read returns the saved snapshot immediately. When the request supports background work and the snapshot exceeds `CONFIG_CHECK_MIN`, it also starts a refresh. A cache miss waits for the fetch. Configuration saves and push webhooks update the snapshot directly.

If external changes appear stale, refresh or clear the affected scope. Clear removes its rows; the next read repopulates them. Explicit reconciliation bypasses process-local branch-head caching.

## Publication and mutations

Directory metadata and rows publish atomically, guarded by the observed snapshot version and a publication token. Revision equality establishes eligibility; commit timestamps do not establish ancestry. A delayed refresh, failed fetch or configuration 404 cannot overwrite a newer publication. Downloads occur outside database batches. Failed refreshes retain stale rows for reconciliation.

CMS writes reuse submitted content and returned blob identities where possible. Deletes remove matching rows; moves reuse source content only when its blob and snapshot revision match. Unknown scopes become stale. Cache failures after a successful remote write must not invite a duplicate save.

Configuration saves write normalized data through, including repairs of malformed old YAML. Cache keys and invalidation preserve the repository provider source. Collection responses include only fields needed by the view, search and sorting; complete source remains available to the editor.

Collection and media snapshots have separate contexts. Node files stay outside parent snapshots, reuse child snapshots at the same revision, and fetch misses in batches of 50. Database lookups are bounded for D1. Changing the node filename recomputes enrichment.

GitHub text reads detect truncation and retrieve the complete immutable blob before publishing. Renames inspect source and destination trees without requesting a recursive repository tree, preserve file mode and history, and reject changed sources or occupied destinations.

## Webhooks

Signed GitHub events maintain changes made outside the CMS:

- Complete small pushes patch eligible predecessor snapshots. Above the incremental limit, affected paths become stale; above the scoped limit, the branch becomes stale. Incomplete or forced pushes reconcile instead.
- Complete configuration changes refresh current configuration, including deletions. Incomplete change lists invalidate it for the next read.
- Repository/account renames retain cached content under updated coordinates. Access removals, transfers and repository/branch deletions clear affected data; installation removal also clears tokens.
- `workflow_run` events update tracked runs.

Push handling checks cached metadata first. Empty caches and already-current snapshots avoid credentials and provider calls, except when configuration needs refreshing. Incremental publication checks the branch head before and after downloads. Database-only invalidation preserves snapshots already at the delivered revision; it may conservatively stale newer data but cannot replace it.

## Private media

Durable media manifests contain no binary contents or private download URLs. Authenticated, client-only delivery leases are batched and renewed before expiry or once after image failure. Previous thumbnails stay visible during renewal. Private GitHub delivery looks up download URLs for the requested paths in batches by folder. Private URLs never enter public CDN caches.

Authenticated previews use ETags and `private, max-age=60, stale-while-revalidate=300`. GitHub previews stream the conditional raw response after access, root and extension checks. Other providers may implement `MediaStorage.preview(path, ifNoneMatch)` or use buffered `read`. A `304` must reflect current provider state, not a stale directory SHA.

## Verification

Run `pnpm test:integration` for SQLite/D1 publication and mutation coverage. Provider and read-cache unit tests cover batching, errors and credential isolation.

`pnpm test:e2e:media-performance` uses a production build and deterministic provider fixture: 20 cold/warm samples each for public/private repositories. It checks one directory request per cold listing and none for an immediate warm reload. Local timings are not deployed performance evidence; measure deployed latency, write volume and cross-instance contention separately.
