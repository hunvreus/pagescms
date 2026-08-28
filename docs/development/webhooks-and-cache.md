# Webhooks and cache

Pages CMS caches configuration and collection/media directory snapshots in PostgreSQL when `.pages.yml` sets `settings.cache: true` (the legacy top-level `cache: true` is normalized too). Directory snapshots use a 60-second freshness window: fresh data avoids a GitHub request, while an expired or cold snapshot is refreshed before the request completes. TanStack Query independently keeps previously loaded client data visible while it refetches.

Media directory snapshots are URL-free manifests. Temporary GitHub or provider URLs are issued separately as authenticated, client-only delivery leases, batched at the directory level, and renewed before expiry or once after an image error. A renewal keeps the previously rendered thumbnail visible until its replacement has loaded. The built-in GitHub provider keeps a bounded, process-local 30-second copy of the authenticated directory response so the manifest and delivery phases share one GitHub request and concurrent consumers coalesce. Authorization runs before this cache can be read, mutations clear it, and it is only an acceleration layer: temporary private URLs are never persisted, SSR-dehydrated, or placed in a public/shared CDN cache.

Entry, file, media, configuration, and cache-management mutations invalidate repository snapshots. Signed GitHub webhooks cover changes made outside Pages CMS:

- `push` clears the affected branch snapshots and clears configuration when `.pages.yml` changed;
- installation and repository removal events clear inaccessible data and tokens;
- repository rename/delete events clear old repository scopes;
- branch deletion and installation-account rename events clear their old scopes;
- `workflow_run` updates tracked action runs.

Configure the GitHub App webhook URL as `https://<host>/api/webhook/github`, content type `application/json`, and the same secret in GitHub and `GITHUB_APP_WEBHOOK_SECRET`. Subscribe to push, delete, installation, installation repositories, installation target, repository, and workflow run events. Invalid signatures return `401`; oversized bodies return `413`; accepted work is processed before a successful response is returned. If webhook volume later requires asynchronous processing, use an explicit durable queue rather than detached request promises.

Private media previews use an authenticated `/api/media-preview/...` endpoint with an ETag and `private, max-age=60, stale-while-revalidate=300`. Do not change this to public caching: the response may contain private repository content.

The portable request-count baseline was captured on 2026-08-28. The legacy public path used one GitHub directory lookup and its private path could use two (the media list followed by the thumbnail URL resolver); both kept a 30-second browser cache. The provider split initially made two lookups for every cold media page. The browser regression test now proves one cold GitHub directory lookup for manifest plus leases and zero on an immediate warm reload.

Run `pnpm test:e2e:media-performance` for the production-preview baseline. It builds the application with the deterministic GitHub fixture, measures first useful render when both thumbnails report `data-state="loaded"`, and covers public and private repository paths. Each p50/p95 is based on 20 full-document samples. Cold samples use distinct uncached directories; warm samples reload the same directory and assert that the process-local directory cache avoids GitHub entirely. The 2026-08-28 local baseline was:

| Repository path | Cold p50 | Cold p95 | Warm p50 | Warm p95 | GitHub directory requests    |
| --------------- | -------: | -------: | -------: | -------: | ---------------------------- |
| Public          |   179 ms |   371 ms |   188 ms |   308 ms | 1 per cold directory; 0 warm |
| Private         |   201 ms |   325 ms |   174 ms |   296 ms | 1 per cold directory; 0 warm |

These numbers remove development compilation from the measurement but are not a substitute for deployed network timings. Record authenticated deployed p50/p95 after the branch is deployed; browser location, GitHub latency, and the selected runtime still affect that result.

If external changes look stale, use the repository Cache page to refresh or clear the relevant scope. A cleared snapshot is repopulated on the next request.
