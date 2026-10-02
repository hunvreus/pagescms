# Database development

Pages CMS uses one Drizzle SQLite schema through runtime-specific adapters:

- local development and Node deployments use `@libsql/client`;
- Turso uses the same libSQL adapter with a remote URL and auth token;
- Cloudflare Workers use native D1 bindings.

Application data and rebuildable repository/cache data are separately addressable. Local development defaults to `./.data/pagescms.db` and `./.data/pagescms-cache.db`. A deployment may point both at the same database, but separate databases are recommended so cache data can be discarded without affecting users, sessions, collaborators, or action history.

The Node/libSQL adapter is isolated from the Worker-safe database core. Do not import the Node client from code bundled into the Cloudflare Worker.

## Configuration

```dotenv
DATABASE_URL=file:./.data/pagescms.db
CACHE_DATABASE_URL=file:./.data/pagescms-cache.db
```

Remote libSQL/Turso deployments additionally set `DATABASE_AUTH_TOKEN` and, when separate, `CACHE_DATABASE_AUTH_TOKEN`.

Cloudflare deployments bind D1 databases as `DATABASE` and optionally `CACHE_DATABASE`. Database IDs and migration application belong to deployment configuration, not the open-source repository.

## Schema changes

```bash
pnpm db:check
pnpm db:generate
```

Review generated SQL and snapshots before committing them. Do not edit an already-applied migration.

Current SQLite migrations live in `drizzle/`. The retained PostgreSQL history lives in `drizzle-postgresql/` for audit and data-migration planning only.

## Applying local migrations

```bash
pnpm db:migrate
```

This migrates both configured database targets, while avoiding duplicate work when they are the same target. Application builds and deployments never execute migrations automatically.

See [PostgreSQL migration](./postgresql-migration.md) for the explicit production cutover strategy. No production data migration is performed by repository tooling or tests.

## Collaborator transfers

`pnpm db:collaborators:export -- --output=collaborators.csv` and `pnpm db:collaborators:import -- --input=collaborators.csv` use the configured SQLite/libSQL application database. Export refuses to overwrite a file; import validates all rows before an atomic upsert. `--replace` explicitly replaces assignments. User links resolve by destination email, then ID; invitations and sessions are not transferred. Use `--url` to select another source database and keep its auth token in `DATABASE_AUTH_TOKEN`.
