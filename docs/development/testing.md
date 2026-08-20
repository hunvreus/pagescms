# Testing

Pages CMS uses layered verification so failures are caught at the narrowest useful boundary.

## Unit tests

Vitest covers framework-neutral behavior such as plugin contracts, identifiers, validation, serialization, caching rules, and authorization decisions.

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

## Build and Workers checks

```bash
pnpm typecheck
pnpm build
pnpm cf:typecheck
pnpm cf:dry-run
```

The dry run builds and bundles the Worker without uploading it. Tests requiring bindings or Workers-specific runtime behavior will use Cloudflare's Vitest integration when those bindings are introduced.
