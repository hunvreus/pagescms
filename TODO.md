# TODO

## Media overhaul

- Measure current and legacy public/private media loading, including request counts, cache hits, first useful render, and p50/p95 timings.
- Implement the portable canonical media manifest, shared in-flight/TanStack Query deduplication, short-lived private GitHub URL caching, and non-blanking refresh described in `PLAN.md` section 5.5.1.
- Validate the shared headless media browser in both full-page and embedded picker layouts, including upload, drag/drop, move, rename, delete, directory navigation, and error/loading states.
- Prove the private Pro/Enterprise S3 storage/delivery plugin without a public fork.
- Evaluate the private Cloudflare signed-delivery and optional image-transformation plugin only after portable baseline measurements pass.

## Release and cutover

- Run the self-hosted and private hosted-plugin acceptance matrices, including free, paid, expired, quota, granular-role, provider-failure, and support-override cases.
- Rehearse preview/production migrations, GitHub callbacks/webhooks, rollback, and monitoring.
- Run Worker type generation/dry-run and live Cloudflare verification when deployment testing resumes. Live Cloudflare testing is intentionally deferred for the current implementation pass.
- Measure authenticated navigation p50/p95 against representative public and private repositories.
- Remove `_legacy/` only after parity acceptance and production cutover.

## Later

- Add the document-session seam and evaluate Yjs with Durable Objects/WebSockets for collaborative editing; multiplayer is not part of the MVP.
- Add further plugin capabilities only behind narrow versioned contracts (for example UI slots or webhook consumers), based on a concrete hosted feature.
