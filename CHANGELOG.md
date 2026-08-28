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
