# Contributing to Pages CMS

- Submit pull requests (PRs) against the `development` branch, not `main`.
- For branches, we have:
  - `main` is our production and default branch. This is what we deploy to https://app.pagescms.org.
  - `development` is for staging. We deploy it at https://dev.pagescms.org.
  - New features are worked in `feature/name-of-the-feature` branches.
  - Issues are addressed in `issue/123-main-isse` branches.
  - When ready, we PR against `development`, test it and then finally merge to `main`.
- Keep changes focused: one feature or fix per PR.
- Test locally before submitting.
- Follow existing code style.

Thanks for helping!

## Database lookup indexes

Repository owner and name lookups use `lower(owner)` and `lower(repo)`. Keep the matching expression indexes in the Drizzle schema; ordinary indexes on the original columns do not serve these predicates efficiently. The additional indexes are non-unique, so existing uniqueness rules and case-insensitive lookup behavior remain unchanged.

`npm run build` runs `db:migrate` through its `postbuild` hook. A live database can receive these additive indexes without an application deployment. Build each index with `CREATE INDEX CONCURRENTLY IF NOT EXISTS` in its own statement outside a transaction, then verify `pg_index.indisvalid` and the query plan. The checked-in migration uses `IF NOT EXISTS`, so a later deployment safely skips indexes already installed manually. Verify existing index definitions: matching names alone do not guarantee matching or valid indexes. Do not run the normal migration runner against an active database to create these indexes for the first time: its transactional, non-concurrent build can block writes.
