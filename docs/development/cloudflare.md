# Cloudflare Workers

## Configuration

`wrangler.jsonc` is checked in and validated against Wrangler's bundled schema. It enables `nodejs_compat`, Workers observability, and the current compatibility date. Run `pnpm cf:typegen` after changing bindings or configuration that affects generated types.

## Static asset caching

`public/_headers` gives `/assets/*` a one-year immutable browser cache. Vite fingerprints these files; changed content receives a new URL. Keep mutable public files outside that directory. The rule does not apply to HTML, session responses, or APIs. Verify the deployed response header when changing the asset pipeline.

## Local development

Normal application development uses the Node runtime, not workerd:

```bash
pnpm install
pnpm dev
```

Put local secrets in `.env.local`; it is ignored by Git. Keep only documented placeholders in `.env.example`. When runtime-parity investigation is useful, run `pnpm cf:dev` explicitly; the Cloudflare Vite plugin will use the same local environment file. Production builds disable dotenv ingestion so local secrets are not copied into build output.

The ordinary `pnpm build` command remains provider-neutral. `pnpm cf:build` adds the Cloudflare Vite integration to the deployment artifact without changing application modules or request services.

## Request CPU budget

Workers Free currently allows 10 ms of CPU per HTTP request. This is a per-request
execution budget, not a concurrent-user limit; waiting for GitHub or D1 does not
count toward it. Check the invocation outcome (`exceededCpu`) rather than
inferring the cause from the generic 1102 page. See [Workers limits](https://developers.cloudflare.com/workers/platform/limits/#cpu-time).

The hosted staging build on November 7, 2026 is **not validated for Workers
Free**. Ten successful configuration document requests in the final captured
sequence consumed 33–53 ms of CPU, alongside earlier `exceededCpu` failures.
Successful over-budget requests do not demonstrate reliable operation: the
runtime permits occasional overruns but can terminate repeated overruns.
This measurement concerns the hosted build, not every possible OSS deployment.

Pre-refactor workerd profiles with synthetic D1 and mocked GitHub identified
query construction, D1 response handling, and server rendering/serialization as
contributors. They are diagnostic samples, not production CPU accounting; the
current client is a static SPA.
Changing the deployment's CPU allowance is a separate operational decision and
does not resolve GitHub network latency or prove browser performance parity.

## Validation and deployment

```bash
pnpm cf:dry-run
pnpm deploy
```

The first command never uploads. The second changes external state and requires an authenticated Wrangler session. Production and preview environment variables, callbacks, routes, migrations, and rollback remain deployment-owned. The application never runs database migrations during build or deployment.

Configure the GitHub App webhook endpoint as `/api/webhook/github` and set `GITHUB_APP_WEBHOOK_SECRET`. The endpoint verifies `X-Hub-Signature-256` before accepting work. See [`webhooks-and-cache.md`](./webhooks-and-cache.md).

Use `pnpm exec wrangler secret put NAME` interactively for production secrets. Do not place credentials in source, `wrangler.jsonc`, shell history, or command arguments.
