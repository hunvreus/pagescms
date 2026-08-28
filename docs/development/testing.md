# Testing

Pages CMS uses layered verification so failures are caught at the narrowest useful boundary.

## Unit tests

Vitest covers framework-neutral behavior such as plugin contracts, identifiers, validation, serialization, caching rules, and authorization decisions.

When porting legacy behavior, add characterization cases before the replacement implementation. Preserve intentional behavior, but encode corrected safety invariants explicitly when a legacy case permits ambiguous identity, path traversal, or incorrect path containment.

```bash
pnpm test
pnpm test:watch
```

## Browser tests

Playwright covers user-visible journeys and HTTP contracts through a running TanStack Start development server.

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

The Playwright command starts an ephemeral PostgreSQL 17 container, migrates and seeds it, and removes it afterward. A build-time test service seam supplies a deterministic in-process GitHub fixture, so authenticated repository navigation and mutations never use a real GitHub account, development database, or production database. The seam is enabled only by `pnpm test:e2e` and is excluded from normal builds.

## PostgreSQL integration tests

The integration command starts an ephemeral PostgreSQL 17 container on a random local port, applies every migration, runs persistence/cache constraints, and removes the container afterward:

```bash
pnpm test:integration
```

Docker must be installed and running. The command never reads `.env.local` and cannot target an existing database.

## Build and Workers checks

```bash
pnpm typecheck
pnpm build
pnpm cf:typecheck
pnpm cf:dry-run
```

The dry run builds and bundles the Worker without uploading it. `pnpm build`
uses the ordinary Vite production composition; `pnpm cf:dry-run` explicitly
selects and bundles the Cloudflare target. `pnpm dev` exercises the ordinary
Node development runtime.
