# Documentation

## Public manual

Public documentation is authored in [docs/public](./public/index.md). The [compact configuration guide](./public/reference.md) is bundled for external agents and hosted generation. Run `pnpm reference:build` to generate the curated static artifact; internal notes below are excluded.

## Features

- [Content localization](./features/content-localization.md)
- [Local content drafts](./features/local-drafts.md)
- [Repository activity](./features/activity.md)
- [Rich text](./features/rich-text.md)

## Development

- [Testing](./development/testing.md)
- [Database](./development/database.md)
- [PostgreSQL migration](./development/postgresql-migration.md)
- [Authentication](./development/authentication.md)
- [Cloudflare Workers](./development/cloudflare.md)
- [Plugins](./development/plugins.md)
- [Webhooks and cache](./development/webhooks-and-cache.md)
- [Parity status](./development/parity.md)

Migration acceptance is tracked in [Parity status](./development/parity.md) and [`TODO.md`](../TODO.md). Stable runtime mechanics live in [`ARCHITECTURE.md`](../ARCHITECTURE.md).
