# Testing

Pages CMS uses layered verification so failures are caught at the narrowest useful boundary.

## Unit tests

Vitest covers framework-neutral behavior such as plugin contracts, identifiers, validation, serialization, caching rules, and authorization decisions.

When porting legacy behavior, add characterization cases before the replacement implementation. Preserve intentional behavior, but encode corrected safety invariants explicitly when a legacy case permits ambiguous identity, path traversal, or incorrect path containment.

```bash
pnpm test
pnpm test:watch
```

## Database integration tests

```bash
pnpm test:integration
```

The command creates temporary local SQLite databases, applies every migration, and runs the shared database conformance suite against both local libSQL and an in-process Miniflare D1 database. Coverage includes constraints, foreign keys, atomic rollback, competing cache publishers, and large cache publications. It requires neither Docker nor PostgreSQL and never reads a developer or production database.

The local libSQL adapter exercises the same client used for Turso. Hosted Turso transport behavior is not claimed unless a disposable remote test database has been explicitly configured and tested.

## Browser tests

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

The Playwright command creates and migrates temporary SQLite databases. A build-time test service seam supplies a deterministic in-process GitHub fixture, so authenticated repository navigation and mutations never use a real GitHub account, development database, or production database. The seam is enabled only by `pnpm test:e2e` and is excluded from normal builds.

## Build and Workers checks

```bash
pnpm typecheck
pnpm build
pnpm cf:typecheck
pnpm cf:dry-run
```

The dry run builds and bundles the Worker without uploading it. `pnpm build` uses the ordinary Vite production composition; `pnpm cf:dry-run` explicitly selects and bundles the Cloudflare target. `pnpm dev` exercises the ordinary Node development runtime.
