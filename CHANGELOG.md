# Changelog

## Unreleased

### Added

- TanStack Start application at the repository root with typed routes, intent preloading, stale-while-revalidate loaders, pending skeletons, and a Cloudflare Workers production target.
- Legacy-compatible configuration, serialization, GitHub/database adapters, authentication, repository navigation, editors, media, actions, collaborators, cache controls, settings, administration, and signed webhook invalidation.
- Trusted build-time plugins for hosted access policy, email delivery, and custom client fields without maintaining a fork.
- Vitest coverage and Playwright guest/health smoke coverage.

### Changed

- Preserved the previous Next.js application under `_legacy/` as a frozen migration reference.
- Replaced internal client REST calls with validated TanStack server functions and shared authorization services; compatibility for potential external REST consumers remains under review.
- Lazy-loaded the rich-text editor and kept server-only adapters out of client bundles.
