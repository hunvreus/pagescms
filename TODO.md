# TODO

- Propagate the editor’s widget-aware first-content spacing rule to the upstream editor registry before the next component refresh.

- Investigate a repository activity table for a fast, database-backed dashboard feed retaining individual content/media additions, edits, renames and deletions, configuration changes, and collaborator changes, alongside existing action runs. Keep activity separate from the current-state content cache; scope visibility to configured paths and permissions. Evaluate CMS-write/webhook deduplication, delayed or missed events, external rename detection, retention and indexing before implementation. Activity is deferred; Overview provides collection creation shortcuts, fixed-file edit links, local drafts and recently opened entries without collection counts.
- Add shared/server-hosted drafts and cross-device recovery.
- Evaluate richer text conflict comparisons and list merging only with explicit, stable item identities; the current draft review deliberately treats lists and source text as whole values.
- Finish mutation lifecycle coverage for collection folder creation/node promotion and account settings; keep permission changes and external authentication/billing redirects confirmation-based.
- Investigate folder rename for media and colocated entries: moving all tracked files, updating content references, collisions, partial failures, and concurrent edits.
- Define an explicit colocated-media configuration policy requiring the entry to be saved before media can be added; explain the destination requirement in the editor.

- Expose invitation expiry in collaborator lists so expired links do not remain labelled Invitation pending.

- Support GitHub users with repository read access but no push access: include readable repositories in discovery, expose a read-only workspace state, disable content/media/workflow mutations and repository management controls, and enforce those limits server-side.

- Profile remaining large sortable object-list costs: stabilize row props across content edits, avoid whole-document dirty comparisons per keystroke, and evaluate variable-height virtualization while preserving edit state. Drag-context updates already isolate nested editor contents.

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
- Complete hosted staging acceptance at `staging.pagescms.org`: verify email-code completion, invitations, roles/branch scope and denied requests; finish Stripe immediate cancellation/downgrade, failed-payment and suspended-account recovery. The Git pipeline, custom domain, D1 databases, Cloudflare account-member gate and two signed-webhook exceptions are configured. Google/GitHub sign-in, email delivery, a signed GitHub ping, Stripe sandbox checkout/Pro activation, billing portal, end-of-period cancellation and signed event replay have passed live checks. Keep production at `app.pagescms.org` on Vercel; production cutover remains separate.
- Define which paid plans include custom roles and branch restrictions, then add explicit account feature entitlement checks; installing Pro currently enables these features for the deployment.
- Measure authenticated navigation p50/p95 against representative public and private repositories after the bundle/payload reduction, lazy branch picker (including repositories with large branch counts), and server request-path optimizations; local build sizes and fixture request counts are not deployed latency measurements.
- Remove `_legacy/` only after parity acceptance and production cutover.

## Later

- Benchmark competitor content localization and preview workflows before designing new implementations: locale storage layouts, fallback behavior, missing translations, translation navigation, references, publishing, and preview fidelity. Use the sandbox `feature/i18n` and `feature/preview` branches as idea references only; do not port or salvage their implementations. Keep this separate from UI localization.
- Finish the GitHub organization/naming cleanup: hosted is transferred to `pagescms/hosted` and connected to Cloudflare staging; transfer public core from `hunvreus/pagescms` to `pagescms/pagescms` and verify the sibling editor's final destination at `pagescms/editor` separately. Audit Git remotes, local composition paths, package/lockfile references, build scripts, Cloudflare Git integration, CI/settings, and current documentation. Distinguish hosted-free capabilities from paid plan entitlements; do not rename persisted database identifiers or deployment bindings incidentally.
- Define account-owned subscriptions attached to stable repository IDs, independently of GitHub access. Show all subscriptions and cancellation controls in the payer's account; restrict repository billing details to the payer. Handle multiple repository administrators, duplicate purchases, billing transfer, repository rename/transfer, and loss of payer access without restoring content access or removing cancellation rights. Retain subscriptions after access loss and notify the payer; define collaborator-grant behavior separately.
- Define the Enterprise contact-sales offer, including private/on-premise deployment of the hosted edition, licensing, supported infrastructure, updates, and support commitments; distinguish it from free OSS self-hosting.
- After a payer loses repository access, retain existing billing and cancellation access, but require fresh repository-management authorization to purchase again, reactivate a canceled subscription, undo cancellation, or attach a subscription to a repository. Ensure the billing portal cannot bypass that authorization.
- Launch Free without a repository-count cap; high usage alone is not abuse.
- Defer custom hosted analytics and OSS instrumentation hooks until existing Cloudflare telemetry and database records leave a concrete abuse, cost, or plan-policy question unanswered. No new event framework, analytics database, or dashboard is required for launch. If needed later, consider small optional typed event hooks in core with hosted handlers for actor/repository attribution, GitHub calls, application-cache hits/misses, transfer volume, and AI usage. First evaluate enriching existing Cloudflare logs; choose Analytics Engine or separate D1/SQLite only if justified by reporting/retention needs. Keep payloads free of content and credentials, isolate handler failures, and avoid duplicate counts. Analytics is advisory and must remain separate from permissions, paid-feature checks, and exact AI allowance/spending controls.
- Add hosted AI configuration with three Free generation runs per account per month across repositories; define and display the monthly reset date. Include bounded validation/retries in one run, do not charge internal failures or reopening saved results, and reserve allowance atomically before inference. Benchmark cheap models before selecting the default; bound input/output/retries. Update the missing-configuration empty state, repository onboarding, configuration editor, and account usage display to expose generation, review/save, remaining allowance, retry/error states, and manual setup. Keep deterministic Decap import outside the AI allowance. Do not advertise generation before the hosted capability is available; preserve manual setup in OSS.
- Add UI localization: translation catalogs, locale selection, interpolation/pluralization, and locale-aware formatting; UI strings currently remain English.
- Extend forge support beyond the existing repository adapter: provider selection, authentication/discovery, source links, and optional workflow capabilities are still GitHub-specific.

- Add the document-session seam and evaluate Yjs with Durable Objects/WebSockets for collaborative editing; multiplayer is not part of the MVP.
- Add further plugin capabilities only behind narrow versioned contracts (for example UI slots or webhook consumers), based on a concrete hosted feature.

- Add optional repository upload-size limits below the platform/provider cap; the current application limit is 20 MB per file.

## Editor

- Add dedicated shortcode/MDX-expression adapters and optional embed/extension registration after the HTML-policy MVP. Nested opaque syntax currently makes its containing fragment a source item. Complex MDX object-valued props are not reliably preserved; keep them in source editing until adapter coverage exists.
- General editable block links remain deferred; anchors wrapping mixed block content use the source-editable fallback.
