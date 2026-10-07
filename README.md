# Pages CMS

Pages CMS is an open-source content management system for GitHub repositories. This branch contains a new TanStack Start application targeting Cloudflare Workers. The previous Next.js implementation is preserved under [`_legacy/`](./_legacy/).

The replacement is being built in reviewable migration waves. It currently includes repository and branch navigation, configuration editing/history, collections and fields, file and entry operations, media, references, actions, collaborators, cache controls, settings, administration, GitHub webhooks, and build-time plugins. [Parity status](./docs/development/parity.md) documents acceptance; [`TODO.md`](./TODO.md) records remaining cutover gates and concrete unfinished work.

## Requirements

- Node.js 22
- pnpm 10

## Development

```bash
pnpm install
cp .env.example .env.local
pnpm db:migrate
pnpm dev
```

Set a random `BETTER_AUTH_SECRET` and at least one sign-in method in `.env.local`. The default `DATABASE_URL=file:.data/pagescms.db` and derived `.data/pagescms-cache.db` keep durable application data separate from rebuildable repository caches. Database commands automatically load that file. `pnpm dev` runs ordinary TanStack Start/Vite under Node at `http://localhost:3000`; its `GET /api/health` readiness endpoint checks both databases. See [`docs/development/database.md`](./docs/development/database.md) and [`docs/development/authentication.md`](./docs/development/authentication.md).

## Verification

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm test:integration
pnpm cf:typecheck
pnpm cf:dry-run
```

`pnpm validate` runs every non-browser verification above, including a local Worker dry run. Browser binaries are installed separately with `pnpm exec playwright install chromium`. Live Cloudflare deployment verification is intentionally separate.

`pnpm test:e2e` and `pnpm test:integration` create and remove isolated SQLite databases. The integration suite also runs its persistence contract against a local D1 runtime. Neither command reads `.env.local` or uses a real GitHub account.

## UI components

The UI uses the shadcn/ui Nova preset with Radix primitives, neutral surfaces, and Pages CMS green semantic tokens.

```bash
pnpm dlx shadcn@latest add button
```

Registry primitives belong in `src/components/ui`; product components belong in `src/components` or a focused feature module when one is introduced.

## Cloudflare

The checked-in `wrangler.jsonc` is the source of truth for Workers configuration. Generate binding types after any configuration change:

```bash
pnpm cf:typegen
```

`pnpm build` and `pnpm preview` use the ordinary TanStack Start/Vite build. Cloudflare is selected only by explicit target commands: `pnpm cf:dev`, `pnpm cf:build`, `pnpm cf:preview`, and `pnpm deploy`. The application code and request services are identical in either build. Cloudflare production builds explicitly ignore `.env.local`; deployed secrets come from Cloudflare environment variables and its secret store.

No deployment occurs during `pnpm cf:dry-run`. See [`docs/development/cloudflare.md`](./docs/development/cloudflare.md) before configuring environments or secrets.

## Documentation

- [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- [`docs/index.md`](./docs/index.md)
- [`docs/development/authentication.md`](./docs/development/authentication.md)
- [`docs/development/webhooks-and-cache.md`](./docs/development/webhooks-and-cache.md)
- [`docs/development/parity.md`](./docs/development/parity.md)
- [`AGENTS.md`](./AGENTS.md)
