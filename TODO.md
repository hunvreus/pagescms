# TODO

## MVP parity

- Decide whether the legacy `/api/:owner/:repo/...` JSON endpoints have external consumers. Either add a tested compatibility facade or explicitly approve the TanStack server-function transport as the replacement.
- Add authenticated browser fixtures for repository navigation and all critical read/mutation journeys.
- Add isolated PostgreSQL integration tests for persistence, invitations, cache invalidation, and migration compatibility.

## Release and cutover

- Run the self-hosted and private hosted-plugin acceptance matrices, including free, paid, expired, quota, granular-role, provider-failure, and support-override cases.
- Rehearse preview/production migrations, GitHub callbacks/webhooks, rollback, and monitoring.
- Run Worker type generation/dry-run and live Cloudflare verification when deployment testing resumes. Live Cloudflare testing is intentionally deferred for the current implementation pass.
- Measure authenticated navigation p50/p95 against representative public and private repositories.
- Remove `_legacy/` only after parity acceptance and production cutover.

## Later

- Add the document-session seam and evaluate Yjs with Durable Objects/WebSockets for collaborative editing; multiplayer is not part of the MVP.
- Add further plugin capabilities only behind narrow versioned contracts (for example UI slots or webhook consumers), based on a concrete hosted feature.
