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

The Playwright web server supplies isolated non-secret runtime placeholders, so the guest smoke test does not depend on a developer's `.dev.vars`. Browser tests that read or mutate persisted state must receive a real isolated PostgreSQL database and own their fixtures; they must never use a development or production database.

## Build and Workers checks

```bash
pnpm typecheck
pnpm build
pnpm cf:typecheck
pnpm cf:dry-run
```

The dry run builds and bundles the Worker without uploading it. `pnpm build` is the framework production split and can be run independently when live Cloudflare validation is deferred.
