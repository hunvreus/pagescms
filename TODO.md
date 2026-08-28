# TODO

## Media overhaul

- Measure deployed public/private media first-useful-render p50/p95 after the portable request-count regression baseline passes in production-like builds.
- Run the public media conformance suite against a disposable live S3-compatible target. The private provider already passes the same lifecycle suite against the deterministic in-memory S3 transport.
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
