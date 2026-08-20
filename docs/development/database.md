# Database development

Pages CMS preserves the existing PostgreSQL tables and Drizzle migration history. Runtime code creates a typed Drizzle/Postgres.js client from a request-scoped connection string; it does not read `process.env` or retain a module-global pool. Cloudflare deployments will pass the Hyperdrive `connectionString` after that binding is configured.

## Schema changes

Drizzle CLI commands use a direct `DATABASE_URL` from the operator environment:

```bash
DATABASE_URL=postgres://... pnpm db:check
DATABASE_URL=postgres://... pnpm db:generate
```

Review generated SQL and snapshots before committing them. Do not edit an already-applied migration.

## Applying migrations

Migrations are an explicit release action:

```bash
DATABASE_URL=postgres://... pnpm db:migrate
```

Application builds, Workers dry runs, and deployments never execute migrations. Back up production data and follow the release rollback plan before applying a new migration. Tests that require PostgreSQL must use an isolated database rather than a developer or production schema.
