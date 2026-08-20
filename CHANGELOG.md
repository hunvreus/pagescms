# Changelog

## Unreleased

### Added

- TanStack Start application at the repository root with typed routes, intent preloading, stale-while-revalidate loaders, pending skeletons, and a Cloudflare Workers production target.
- Legacy-compatible configuration, serialization, GitHub/database adapters, authentication, repository navigation, editors, media, actions, collaborators, cache controls, settings, administration, and signed webhook invalidation.
- Trusted build-time plugins for hosted access policy, email delivery, and custom client fields without maintaining a fork.
- Typed paid-plan, quota, permission, and policy-unavailable errors with safe plugin-provided upgrade links.
- Lazy rich-text Markdown/HTML editing with embedded media browsing, upload, private previews, and repository/public path round-tripping.
- Lazy syntax-aware code fields for YAML, JavaScript/TypeScript, JSON, HTML, and Markdown without bundling the full CodeMirror language catalog.
- Vitest coverage and Playwright guest/health smoke coverage.

### Changed

- Preserved the previous Next.js application under `_legacy/` as a frozen migration reference.
- Replaced undocumented internal client REST calls with validated TanStack server functions and shared authorization services.
- Lazy-loaded the rich-text editor and kept server-only adapters out of client bundles.
- Added isolated authenticated browser coverage for repository navigation and structured content updates.
- Separated ordinary Node/Vite development from explicit Cloudflare build, preview, compatibility, and deployment commands.
- Made Node development and Drizzle commands load the ignored local `.env.local` file consistently.
