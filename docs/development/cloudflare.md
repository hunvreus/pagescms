# Cloudflare Workers

## Configuration

`wrangler.jsonc` is checked in and validated against Wrangler's bundled schema. It enables `nodejs_compat`, Workers observability, and the current compatibility date. Run `pnpm cf:typegen` after changing bindings or configuration that affects generated types.

## Local development

```bash
pnpm install
pnpm cf:typegen
pnpm dev
```

Put local secrets in `.dev.vars`; it is ignored by Git. Keep only documented placeholders in `.dev.vars.example`.

## Validation and deployment

```bash
pnpm cf:dry-run
pnpm deploy
```

The first command never uploads. The second changes external state and requires an authenticated Wrangler session. Production and preview bindings, Hyperdrive, callbacks, routes, migrations, and rollback remain intentionally unconfigured until their migration waves.

Use `pnpm exec wrangler secret put NAME` interactively for production secrets. Do not place credentials in source, `wrangler.jsonc`, shell history, or command arguments.
