# Database development

Pages CMS uses one Drizzle SQLite schema through runtime-specific adapters:

- local development and Node deployments use `@libsql/client`;
- Turso uses the same libSQL adapter with a remote URL and auth token;
- Cloudflare Workers use native D1 bindings.

Application data and rebuildable repository/cache data are separately addressable and share `DATABASE_URL` by default, including local development. Optional `CACHE_DATABASE_URL` or `CACHE_DATABASE` selects separate cache storage. An existing explicit separate-cache setting remains effective; existing cache files are not deleted. Separate databases provide storage and workload isolation; table-scoped cache clearing does not require them.

The Node/libSQL adapter is isolated from the Worker-safe database core. Do not import the Node client from code bundled into the Cloudflare Worker.

Production PostgreSQL cache metadata queries wrap indexed owner/repository
columns in `lower()`, producing expensive scans. The current SQLite/D1 code
already uses exact normalized predicates, skips unchanged file rows and avoids
legacy branch-sentinel creation and broad cache deletion on large pushes.
Legacy PostgreSQL query costs therefore do not predict the new D1 workload.
In one complete production delivery hour, pushes averaged 0.58 per second and
peaked at five in one second; these are observed values, not deployment maxima
or a D1 capacity guarantee.

Before production cutover, test the compiled Worker against native remote D1
with application reads, workflow updates, push bursts and cold/large directory
publications together, including headroom above the observed workload. Compare
application latency with an application-only baseline and inspect batch failures,
background publication errors and push-to-visible latency, not only webhook HTTP
responses. Enable `CACHE_DATABASE` if cache work causes unacceptable application
latency/contention, or measured storage growth requires isolation. Keep an
explicit cache storage policy and rehearse the actual SQLite import size. A
freshness TTL controls when data is checked; it is not automatic storage eviction.

D1 has a fixed per-database size limit and serializes work within each database;
separate databases provide independent execution capacity.
Avoid assuming that account-wide storage allowances increase a single database's
capacity. The current adapter uses the primary binding directly; it does not use
the Sessions API required for D1 read replicas. Adding replica support requires
an explicit consistency design for authentication, permissions and read-after-write
behavior.

The dashboard activity feed retains the latest 50 events per
owner/repository/branch in the application's `activity` table and displays ten
at a time. Repository-wide collaborator and permission changes have their own
50-event scope, stored once rather than duplicated for every branch. Existing
action-run records are read directly and keep their existing lifecycle. Measure the complete
indexed schema and total deployment volume, keep database headroom, and prune in
bounded batches. Keep content bodies and binary assets out of event rows. Reads
must use stored data; webhook enrichment must not delay dashboard rendering.
A separate activity database is an option if measured contention or growth
justifies isolation, not a prerequisite. It does not remove D1's per-database
ceiling. See
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/) and
[read replication](https://developers.cloudflare.com/d1/best-practices/read-replication/).

## Configuration

```dotenv
DATABASE_URL=file:./.data/pagescms.db
# Optional isolation; omit to share DATABASE_URL:
# CACHE_DATABASE_URL=file:./.data/pagescms-cache.db
```

Remote libSQL/Turso deployments additionally set `DATABASE_AUTH_TOKEN` and, when separate, `CACHE_DATABASE_AUTH_TOKEN`.

Cloudflare deployments bind D1 databases as `DATABASE` and optionally `CACHE_DATABASE`. Database IDs and migration application belong to deployment configuration, not the open-source repository.

## Schema changes

```bash
pnpm db:check
pnpm db:generate
```

Review generated SQL and snapshots before committing them. Do not edit an already-applied migration.

Current SQLite migrations live in `drizzle/`.

The baseline reflects the current schema. Revocation deletes the grant and matching invite together; removal events remain in the activity feed, and reinvitations receive new membership IDs.

## Applying local migrations

```bash
pnpm db:migrate
```

This migrates both configured database targets, while avoiding duplicate work when they are the same target. Application builds and deployments never execute migrations automatically.

See [PostgreSQL migration](./postgresql-migration.md) for the explicit production cutover strategy. No production data migration is performed by repository tooling or tests.

## Collaborator transfers

`pnpm db:collaborators:export -- --output=collaborators.csv` and `pnpm db:collaborators:import -- --input=collaborators.csv` use the migrated SQLite/libSQL application database. Export refuses to overwrite a file and includes only active assignments and known creation dates; it is not a full membership-history backup. Import validates all rows before an atomic upsert of active assignments. Missing creation dates remain unknown. `--replace` revokes existing active memberships and pending invitations atomically, then imports the replacement assignments. User links resolve by destination email; invitations and sessions are not transferred. Use `--url` to select another source database and keep its auth token in `DATABASE_AUTH_TOKEN`. PostgreSQL sources and D1 SQL preparation are covered in the [collaborator-only upgrade guide](./postgresql-migration.md).
