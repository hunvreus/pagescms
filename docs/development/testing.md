# Testing

## Performance regression checks

Builds run `pnpm performance:check` against the production client manifest. It enforces gzip budgets for initial JavaScript (257,000 bytes) and the largest chunk (200,000 bytes), a 150,000-byte total for template images, and keeps heavy editor/media modules and the configured icon catalogue out of the initial import graph. The startup recovery boundary adds about 1.1 KB gzip to the localized baseline; its English/French recovery text stays in the entry chunk so failed catalogue downloads still offer a usable reload action. Interface icons use individual Hugeicons module imports; avoid a shared barrel that pulls editor-only glyphs into the initial chunk.

Run `pnpm test:e2e:media-performance --workers=1 --retries=0` to benchmark the production build against deterministic GitHub fixtures. It records 20 cold/warm render samples for each public/private repository, with p50/p95 summaries, and enforces one upstream directory request per cold listing and zero on warm reloads. Cold samples use fresh directory paths; warm samples immediately reload those paths. These measure directory-cache behavior, not a fresh browser or server process for every sample.

Open `playwright-report/index.html` for results and the attached `media-performance.json` with raw samples. `playwright-report/results.json` contains the machine-readable test report. CI retains the report for 30 days on successful and failed runs, using the commit SHA in the artifact name. Benchmarks run with one worker and no retries so competing test workers and successful retries do not conceal the original result.

Elapsed-time results currently track trends; they do not fail on a latency threshold. Establish timing budgets from repeated runs on the same CI runner class before adding enforcement. Compare matching production-build workloads and inspect raw samples alongside p50/p95. Fixture timings exclude real GitHub and deployed-network latency.

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

## Browser tests

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

The Playwright command creates and migrates temporary SQLite databases. A build-time test service seam supplies a deterministic in-process GitHub fixture, so authenticated repository navigation and mutations never use a real GitHub account, development database, or production database. Screenshots are captured on failure; traces are retained on the first retry. Each test, including retries, receives its own seeded database, cache, mutable forge fixture and metrics stream. This keeps parallel configuration saves and request-count assertions independent. The seam is enabled only by `pnpm test:e2e` and is excluded from normal builds.

## Build and Workers checks

```bash
pnpm typecheck
pnpm build
pnpm cf:typecheck
pnpm cf:dry-run
```

The dry run builds and bundles the Worker without uploading it. `pnpm build` uses the ordinary Vite production composition; `pnpm cf:dry-run` explicitly selects and bundles the Cloudflare target. `pnpm dev` exercises the ordinary Node development runtime.

## CI and external acceptance

Prefer assertions about access, state transitions, saved data, keyboard behavior, loading accessibility and actual overflow/geometry. Avoid copying CSS classes, icons, colors or arbitrary payload compression ratios into tests.

### Rich-text editor

`pnpm test:e2e rich-text-switch.spec.ts` checks the CMS adapter using the local GitHub fixture: HTML and Markdown saving, repeated reopen cycles, configured filtering, safe clipboard HTML, source switching without changing the body, and media upload success/failure.

For Chromium, Firefox, and WebKit, install all three Playwright browsers and run `PAGESCMS_E2E_CROSS_BROWSER=true pnpm test:e2e rich-text-switch.spec.ts`. Add `PAGESCMS_E2E_PRODUCTION=true` to test the built app instead of the development server. Parsing and sanitization regression tests also live in the separate editor repository and run in all three browsers with `npm test`.

### Vercel and Netlify

The beta acceptance run deployed generated projects with separate Turso databases. GitHub and Google sign-in created sessions on both platforms. Editing the same collection entry from each host produced two Git commits. After a third edit pushed directly to GitHub, both repository webhooks returned HTTP 200. Both cached listings went stale and refreshed to the pushed commit on reload. Repository webhooks omit the installation ID, so this run covered cache invalidation and refresh. A second test used the staging GitHub App. A temporary relay verified the GitHub signature and forwarded the installation push for the test branch to both deployments, signing it with each preview's secret. Before any subsequent collection read, both Turso databases contained the edited file and an `ok` collection snapshot at the pushed SHA. Authenticated Git media uploads matched their Git blob hashes up to 3 MiB on Vercel and 4 MiB on Netlify. Both providers rejected larger requests before GitHub created a file.

Earlier deployment checks exercised core and plugin migrations on Turso and a registered plugin API route on both platforms. Netlify served a `/.well-known` plugin route. A Vercel routing check covered both OAuth metadata paths and query preservation.

## Extension and production builds

Run `pnpm typecheck`, `pnpm lint`, `pnpm build` and `pnpm test:package`. The package check installs packed core and plugin artifacts into a generated project. It exercises the Netlify and Vercel function entries, Node and local Cloudflare builds, migrations, signed local webhook handling, cold development startup, browser rendering and client/server isolation. `pnpm cf:typecheck` verifies generated Worker bindings; `pnpm cf:dry-run` builds and bundles locally without deployment.

The package check opens and edits a deferred rich-text field in Node development, Node production, Cloudflare development and Cloudflare preview. Dependency caches are separated by runtime, build/serve command and mode, so another build cannot replace chunks used by an active development server. Fixture and package checks do not replace acceptance on a real repository and its deployed runtime.
