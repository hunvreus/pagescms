# TODO

- Support GitHub users with repository read access but no push access: include readable repositories in discovery, expose a read-only workspace state, disable content/media/workflow mutations and repository management controls, and enforce those limits server-side.

- Profile large sortable object lists: isolate heavy field content from drag-context updates, stabilize row props, avoid whole-document dirty comparisons per keystroke, and evaluate variable-height virtualization while preserving edit state.

## Media overhaul

- Measure deployed public/private media first-useful-render p50/p95 after the portable request-count regression baseline passes in production-like builds.
- Run the public media conformance suite against a disposable live S3-compatible target. The private provider already passes the same lifecycle suite against the deterministic in-memory S3 transport.
- Evaluate the private Cloudflare signed-delivery and optional image-transformation plugin only after portable baseline measurements pass.

## Release and cutover

- Audit existing production account links and unverified admin identities before rollout; the hardened sign-in checks do not retroactively establish the provenance of existing links.
- Decide whether loss of an inviter's personal GitHub permission should revoke their repository's collaborator grants. Current installation/repository removal revokes access; individual inviter revocation retains legacy behavior.
- Validate the opened-repository inventory migration in the preview/production cutover; pre-migration visits are not backfilled from cache.

- Measure legacy/current cache behavior on matched workloads (warm reads, ordinary saves, node collections, colocated media, large pushes and concurrent instances): upstream requests, database writes and p50/p95 latency. See the documented cache parity audit; unit/integration coverage is not production performance acceptance.
- Run the self-hosted and private hosted-plugin acceptance matrices, including free, paid, expired, quota, granular-role, provider-failure, and support-override cases.
- Rehearse Pro's PostgreSQL export and SQLite/D1 import on a protected copy, verify customer/subscription IDs and migrated permission behavior, then schedule the write/webhook pause and cutover. See the Pro README; the implementation pass did not migrate production data.
- Exercise Stripe checkout, portal, signed webhook replay and plan changes in Stripe test mode against the deployed composition. Monitor `reconciliation-required` and `payload-mismatch` billing audit rows; resolve uncertain event ordering from Stripe's authoritative subscription state.
- Rehearse preview/production migrations, GitHub callbacks/webhooks, rollback, and monitoring.
- Complete staging GitHub App and Stripe sandbox configuration, enable the Pro-owned staging deployment workflow, and run live hosted acceptance before promoting to production. Pro now owns the combined build, core revision pin, separate staging Pro database and Worker bundle-size check.
- Define which paid plans include custom roles and branch restrictions, then add explicit account feature entitlement checks; installing Pro currently enables these features for the deployment.
- Measure authenticated navigation p50/p95 against representative public and private repositories after the bundle/payload reduction, lazy branch picker (including repositories with large branch counts), and server request-path optimizations; local build sizes and fixture request counts are not deployed latency measurements.
- Remove `_legacy/` only after parity acceptance and production cutover.

## Later

- Add UI localization: translation catalogs, locale selection, interpolation/pluralization, and locale-aware formatting; UI strings currently remain English.
- Extend forge support beyond the existing repository adapter: provider selection, authentication/discovery, source links, and optional workflow capabilities are still GitHub-specific.

- Add the document-session seam and evaluate Yjs with Durable Objects/WebSockets for collaborative editing; multiplayer is not part of the MVP.
- Add further plugin capabilities only behind narrow versioned contracts (for example UI slots or webhook consumers), based on a concrete hosted feature.
