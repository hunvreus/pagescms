# Pages CMS

Pages CMS is an open-source content management system for GitHub repositories. This branch contains a new TanStack Start application targeting Cloudflare Workers. The previous Next.js implementation is preserved under [`_legacy/`](./_legacy/).

The replacement is being built in reviewable migration waves. [`PLAN.md`](./PLAN.md) defines scope, parity requirements, validation gates, and cutover criteria.

## Requirements

- Node.js 22
- pnpm 10

## Development

```bash
pnpm install
cp .dev.vars.example .dev.vars
pnpm db:migrate
pnpm dev
```

Set a random `BETTER_AUTH_SECRET`, a local PostgreSQL `DATABASE_URL`, and at least one sign-in method in `.dev.vars`. The application runs at `http://localhost:3000`; its health endpoint is `GET /api/health`. See [`docs/development/authentication.md`](./docs/development/authentication.md).

## Verification

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm cf:typecheck
pnpm cf:dry-run
```

`pnpm validate` runs every non-browser verification above. Browser binaries are installed separately with `pnpm exec playwright install chromium`.

## UI components

The UI uses the shadcn/ui Nova preset with Radix primitives, neutral surfaces, and Pages CMS green semantic tokens.

```bash
pnpm dlx shadcn@latest add button
```

Registry primitives belong in `src/components/ui`; feature UI belongs in `src/features`.

## Cloudflare

The checked-in `wrangler.jsonc` is the source of truth for Workers configuration. Generate binding types after any configuration change:

```bash
pnpm cf:typegen
```

No deployment occurs during `pnpm cf:dry-run`. See [`docs/development/cloudflare.md`](./docs/development/cloudflare.md) before configuring environments or secrets.

## Documentation

- [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- [`docs/index.md`](./docs/index.md)
- [`docs/development/authentication.md`](./docs/development/authentication.md)
- [`AGENTS.md`](./AGENTS.md)
