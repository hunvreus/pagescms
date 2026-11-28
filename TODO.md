# TODO

## Release and cutover

- Rehearse a clean install, GitHub App setup, sign-in, invitations and editing on public and private repositories. Include default and custom CLI output paths. Run the release workflow, provider-failure checks and tester acceptance before tagging stable.
- Publish the beta packages and verify a frozen install from the registry. Run the package-consumer checks in CI and validate a packaged build on native Windows.
- Run standalone and third-party plugin acceptance on Node and Workers. Cover mounted routes, auth and schema extensions, denied permissions, account lifecycle hooks and configuration editors with retained drafts and concurrent changes.
- Rehearse the [2.x collaborator migration](docs/development/postgresql-migration.md), callbacks, webhooks, monitoring and rollback on a protected copy. Audit existing production account links and unverified admin identities.
- Decide whether loss of an inviter’s personal GitHub access should revoke existing collaborator grants.
- Before production, check remaining directory refresh and manual cache operations for lookups by repository address where an admitted repository ID is available.

## Performance and caching

- Compare warm reads, ordinary saves, node collections, colocated media, large pushes and concurrent instances on matched workloads. Record upstream requests, database writes and p50/p95 latency. Use the results to prioritize repeated identity lookups, branch admission and directory reads while preserving collaborator authorization and provider invalidation.
- Measure authenticated navigation and editor readiness on staging and Vercel with public and private repositories, cold starts, large branch lists and GitHub image delivery. Measure Workers Free CPU on cold and warm requests, including the configuration webhook.
- Set CI render-time budgets from repeated production-build benchmarks. Extend fixture coverage beyond media to collection loading, large entry editing, search and save.
- Measure the payload and CPU cost of retrieving unchanged GitHub collections via GraphQL, additional reads for parent-positioned locale folders and cold configuration parsing under isolate churn. Include configurations above the two-million-character in-memory cache limit.
- Review ownership and invalidation of process-local caches before consolidating them. Compare the cost of loading configuration with admission on shared and separate databases.
- Monitor Node collaborator reads and preference writes for recurring SQLite contention after enabling the busy timeout.
- Measure duplicate GitHub commit checks when several media folders on the same branch need a refresh. If frequent, share one in-flight check per repository and branch across Workers using an expiring database lease. Keep fresh folder reads lock-free. Test that a move webhook arriving mid-refresh prevents an older result from restoring the file at its old path.

## Media

- Measure time to the first usable media view on deployed public and private repositories. Profile transfer, sorting and persistence before claiming support for 100,000-file folders.
- Run the media provider conformance suite against a disposable live S3-compatible bucket.
- Design optional file replacement for the media browser, image fields and rich-text uploads. Cover batch collisions, permissions and concurrent writes with the hosted storage provider.
- Investigate folder renames for media and colocated entries, including content references, collisions, partial failures and concurrent edits. Define when an entry must be saved before adding colocated media.
- Evaluate operator-defined upload limits below the 20 MB per-file maximum. Improve HTTP 413 handling for Git media uploads and large collection responses on [Vercel and Netlify](docs/development/testing.md#vercel-and-netlify).
- Evaluate image optimization and provider-specific delivery URL transformations. Before enabling a processor, design durable version-keyed derivatives and measure cost and latency.

## Editing and localization

- Diagnose the link-text editing regression in Basecoat alert snippets before upgrading the pinned TipTap version in Pages CMS and the editor together. Propagate first-content spacing and pre-paint normalization to the upstream editor registry.
- Recover local drafts when the remote file or schema cannot load, including deletion from another tab. Preserve account scoping, backup and revision-checked discard.
- Check reopening an expired entry query while its draft session keeps the original snapshot. Preserve conflict detection. Evaluate richer text comparisons and list merges only with stable item identities.
- Profile large sortable object lists. Measure per-keystroke dirty checks, row updates and variable-height virtualization while preserving edit state.
- Port third-party custom editors and test keyboard, read-only and collection-display behavior with real content.
- Design remote select/reference option sources and optional object-preserving writes. Define authentication, search, pagination, offline labels and validation.
- Add shortcode and MDX-expression adapters, evaluate embed registration and extend editable links to mixed block content. Preserve unsupported syntax in source editing.
- Explore translation comparison views and independently named translation groups. Benchmark content previews separately from translation editing.
- Define document sessions and evaluate Yjs with Durable Objects or WebSockets for collaborative editing.

## Authentication, storage and extensions

- Support expiring GitHub App user tokens. Renew before expiry, save rotated credentials atomically across concurrent requests and request sign-in if renewal fails. Also review recovery for installation tokens revoked before expiry.
- Design read-only workspaces for GitHub users with read access and no push access. Cover discovery, editing controls and server-side enforcement.
- Design additional forge adapters, scoped source configuration and discovery, including nested repository paths, source links and optional workflows. Define branch rename reconciliation using stable repository identity.
- Evaluate exporting JSON Schema from the configuration validator. Verify recursive schemas, portable build imports and representative configurations.
- Before removing Drizzle from Better Auth, account for plugin-provided schemas, atomic sign-in code and rate-limit operations on SQLite/D1, and the exported SQL contracts of `revokeCollaborators` and `repositoryIdExpression`.
- Review indirect TanStack Start dependencies and how packages declare worker-first routes for plugins mounted outside the standard API paths.
