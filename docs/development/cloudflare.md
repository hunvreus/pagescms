# Cloudflare Workers

## Configuration

`wrangler.jsonc` is checked in and validated against Wrangler's bundled schema. It enables `nodejs_compat`, Workers observability, and the current compatibility date. Run `pnpm cf:typegen` after changing bindings or configuration that affects generated types.

## Local development

Normal application development uses the Node runtime, not workerd:

```bash
pnpm install
pnpm dev
```

Put local secrets in `.env.local`; it is ignored by Git. Keep only documented placeholders in `.env.example`. When runtime-parity investigation is useful, run `pnpm cf:dev` explicitly; the Cloudflare Vite plugin will use the same local environment file. Production builds disable dotenv ingestion so local secrets are not copied into build output.

The ordinary `pnpm build` command remains provider-neutral. `pnpm cf:build` adds the Cloudflare Vite integration to the deployment artifact without changing application modules or request services.

## Validation and deployment

```bash
pnpm cf:dry-run
pnpm deploy
```

The first command never uploads. The second changes external state and requires an authenticated Wrangler session. Production and preview environment variables, callbacks, routes, migrations, and rollback remain deployment-owned. The application never runs database migrations during build or deployment.

Configure the GitHub App webhook endpoint as `/api/webhook/github` and set `GITHUB_APP_WEBHOOK_SECRET`. The endpoint verifies `X-Hub-Signature-256` before accepting work. See [`webhooks-and-cache.md`](./webhooks-and-cache.md).

Use `pnpm exec wrangler secret put NAME` interactively for production secrets. Do not place credentials in source, `wrangler.jsonc`, shell history, or command arguments.
