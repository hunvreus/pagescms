# Changelog

## Unreleased

### Added

- TanStack Start application at the repository root with typed routes, intent preloading, TanStack Query caching, pending skeletons, and a Cloudflare Workers production target.
- Legacy-compatible configuration, serialization, GitHub/database adapters, authentication, repository navigation, editors, media, actions, collaborators, cache controls, settings, administration, and signed webhook invalidation.
- Trusted build-time plugins for hosted access policy, email delivery, and custom client fields without maintaining a fork.
- Closed deployment contracts for hosted entitlements, billing webhooks, repository-permission administration, and per-repository media storage/delivery selection.
- Typed paid-plan, quota, permission, and policy-unavailable errors with safe plugin-provided upgrade links.
- Shared full-page and embedded media browsers with responsive grid/list layouts, folders-first navigation, drag upload and move, folder creation, rename/delete operations, private previews, and batched delivery leases.
- Lazy rich-text Markdown/HTML editing with embedded media browsing, upload, private previews, and repository/public path round-tripping.
- Lazy syntax-aware code fields for YAML, JavaScript/TypeScript, JSON, HTML, and Markdown without bundling the full CodeMirror language catalog.
- Vitest coverage and Playwright guest/health smoke coverage.

### Changed

- Audited non-webhook legacy cache paths and restored configuration write-through, upload/move source reuse, colocated media reads, node-file enrichment reuse, configurable TTL/push limits, bounded repository-read caching and cache-coordinate preservation on renames; documented intentional differences and their rationale.
- Restored incremental directory-cache updates for GitHub pushes and CMS writes, with batched retrieval, unchanged-row preservation, revision checks, and stale-data reconciliation instead of branch-wide cache deletion.
- Restored the Pages CMS favicon and social-card metadata in the TanStack application.
- Migrated Better Auth accounts to issuer-scoped identities required by Better Auth 1.7 and refreshed eligible dependencies.
- Preserved the previous Next.js application under `_legacy/` as a frozen migration reference.
- Replaced undocumented internal client REST calls with validated TanStack server functions and shared authorization services.
- Lazy-loaded the rich-text editor and kept server-only adapters out of client bundles.
- Added isolated authenticated browser coverage for repository navigation and structured content updates.
- Added media lifecycle conformance coverage, request-count/performance regression coverage, and full-page plus embedded-picker browser workflows.
- Separated ordinary Node/Vite development and builds from explicit Cloudflare build, preview, compatibility, and deployment commands.
- Made Node development and Drizzle commands load the ignored local `.env.local` file consistently.
- Unified local and deployed application services around standard environment variables, removed detached request work, and made route loaders preload feature-owned TanStack Query definitions with targeted mutation invalidation.
- Rebuilt collection views around TanStack Table and stock shadcn/ui primitives, including configuration-driven columns, search, sorting, pagination, tree expansion, dated defaults, and entry actions.
- Added an environment switch for disabling the TanStack development plugin and in-page debug panel.
- Coalesced media directory requests across collection and media consumers, retained stale browser data during refresh, and isolated performance fixtures from concurrent mutation tests.
- Added idempotent quota reservation/settlement, bounded settlement and confirmation retries, staged direct uploads, and audited expiry of abandoned hosted reservations.
- Restored the branded sign-in, collaborator invitation, and existing-collaborator notification email templates with shared HTML styling and plain-text fallbacks.
- Restored the six-slot OTP sign-in control and full-width resend and alternate-sign-in actions from the legacy authentication flow.
- Standardized validation, operation, and route error presentation around semantic shadcn/ui states, with safe authentication fallbacks instead of raw infrastructure errors.
- Made the health endpoint verify PostgreSQL readiness and return a structured `503` response while the database is unavailable.
