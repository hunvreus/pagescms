# Database development

Pages CMS preserves the existing PostgreSQL tables and Drizzle migration history. Runtime code creates a typed Drizzle/Postgres.js client from a request-scoped connection string; it does not read `process.env` or retain a module-global pool. Cloudflare deployments will pass the Hyperdrive `connectionString` after that binding is configured.

## Schema changes

Drizzle CLI commands automatically load `DATABASE_URL` from an ignored root `.env.local` file. An explicitly exported environment variable takes precedence, which is how isolated test containers supply their connection:

```bash
pnpm db:check
pnpm db:generate
```

Review generated SQL and snapshots before committing them. Do not edit an already-applied migration.

## Applying migrations

Migrations are an explicit release action:

```bash
pnpm db:migrate
```

Application builds, Workers dry runs, and deployments never execute migrations. Back up production data and follow the release rollback plan before applying a new migration. Tests that require PostgreSQL must use an isolated database rather than a developer or production schema.
