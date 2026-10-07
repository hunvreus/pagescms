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

The command creates temporary local SQLite databases, applies every migration, and runs the shared database conformance suite against both local libSQL and an in-process Miniflare D1 database. Coverage includes constraints, foreign keys, atomic rollback, competing cache publishers, large cache publications, and real OTP/session HTTP handling with a fake email delivery service. It requires neither Docker nor PostgreSQL and never reads a developer or production database.

The local libSQL adapter exercises the same client used for Turso. Hosted Turso transport behavior is not claimed unless a disposable remote test database has been explicitly configured and tested.

## Browser tests

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

The Playwright command creates and migrates temporary SQLite databases. A build-time test service seam supplies a deterministic in-process GitHub fixture, so authenticated repository navigation and mutations never use a real GitHub account, development database, or production database. Each test, including retries, receives its own seeded database, cache, mutable forge fixture and metrics stream. This keeps parallel configuration saves and request-count assertions independent. The seam is enabled only by `pnpm test:e2e` and is excluded from normal builds.

## Build and Workers checks

```bash
pnpm typecheck
pnpm build
pnpm cf:typecheck
pnpm cf:dry-run
```

The dry run builds and bundles the Worker without uploading it. `pnpm build` uses the ordinary Vite production composition; `pnpm cf:dry-run` explicitly selects and bundles the Cloudflare target. `pnpm dev` exercises the ordinary Node development runtime.

Both production build commands run `pnpm performance:check`. The Vite manifest is used to total each unique static JavaScript dependency of the client entry, excluding lazy chunks. Budgets are 250 KB gzipped for that initial graph, 200 KB gzipped for any individual JavaScript chunk, and 150 KB total for the three template thumbnails. Heavy editor/media chunks must not appear in the initial graph. Run the check separately against an existing build with `pnpm performance:check`; a missing manifest is a failure, not a skipped check. Increase budgets only after reviewing the dependency change and measuring its effect.

## CI and external acceptance

Public CI runs validation, SQLite/D1 integration, deployment composition, browser tests with admin coverage, and the production-build media request-count check. Pro CI runs its private unit/UI tests, the same persistence contract on SQLite and D1, and Node/Workers builds with the real private modules. Set Pro's `PAGESCMS_CORE_REF` repository variable to the matching core revision; its initial fallback is the rewrite branch.

Prefer assertions about access, state transitions, saved data, keyboard behavior, loading accessibility and actual overflow/geometry. Avoid copying CSS classes, icons, colors or arbitrary payload compression ratios into tests.

Fixtures do not verify live Stripe/S3/Turso transport, production latency, or a real PostgreSQL cutover. Those remain explicit release acceptance checks in TODO.md.
