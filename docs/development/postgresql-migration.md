# PostgreSQL migration

This is the production data-migration strategy from the retained PostgreSQL schema to SQLite, D1, or Turso. It is intentionally separate from normal migrations and tests. No production migration has been executed.

## Data scope

Durable application data must be copied:

| PostgreSQL table            | SQLite table                | Required preservation                                                                                                                 |
| --------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `user`                      | `user`                      | `id`, name, image, GitHub username, email, verification state and timestamps                                                          |
| `account`                   | `account`                   | IDs, `user_id`, issuer/provider/account identity, access/refresh/ID tokens and expiries, scope, password hash and timestamps          |
| `session`                   | `session`                   | ID/token, `user_id`, expiry, IP/user-agent and timestamps                                                                             |
| `verification`              | `verification`              | ID, identifier/value, expiry and timestamps                                                                                           |
| `collaborator`              | `collaborator`              | generated ID, type, installation/owner/repository identity, branch, email and user/inviter IDs                                        |
| `collaborator_invite`       | `collaborator_invite`       | generated ID, token, email, owner/repository, expiry and timestamps                                                                   |
| `action_run`                | `action_run`                | generated ID, repository/action/context/workflow identity, run ID, status/conclusion/URL, trigger/failure/payload JSON and timestamps |
| `github_installation_token` | `github_installation_token` | generated ID, installation ID, ciphertext, IV and expiry                                                                              |

Rebuildable configuration, repository listings, file metadata, permissions, and cache chunks are omitted by default and rebuilt after cutover. Copying them is optional and must never block migration of durable data.

## Column conversion rules

- Preserve text identifiers exactly; do not regenerate Better Auth IDs, session tokens, invite tokens, provider identities, or password hashes.
- Convert timestamps to UTC Unix milliseconds. Verify samples around daylight-saving boundaries and sub-second precision before cutover.
- Convert booleans to SQLite integers `0` and `1`.
- Serialize JSON as validated JSON text without changing object/array shape. Reject invalid source JSON instead of coercing it.
- Preserve integer IDs exactly and fail if a value exceeds SQLite's signed 64-bit range or JavaScript's safe-integer requirements in application code.
- Preserve nullable values as `NULL`; do not replace them with empty strings or default JSON.
- Import parents before children and enable foreign-key enforcement for the entire import.

## Rehearsal

1. Take a consistent, read-only PostgreSQL snapshot.
2. Create empty app and cache SQLite targets from the committed migrations.
3. Export durable tables in dependency order and transform only with the rules above.
4. Import all rows in an atomic operation per dependency group; abort on any rejected row or constraint failure.
5. Compare source and destination row counts per table, primary IDs, uniqueness constraints, and foreign-key relationships.
6. Verify representative password and OAuth sign-in, active/expired sessions, repository access, collaborator invitations, action history, and token decryption in an isolated environment.
7. Rebuild cache/configuration state and run health, integration, and browser checks.
8. Repeat the rehearsal from a fresh snapshot until the result and duration are predictable.

## Cutover and rollback

1. Announce a write window and stop application/webhook writes to PostgreSQL.
2. Take the final consistent snapshot and run the rehearsed import into freshly migrated targets.
3. Repeat all count, relationship, authentication, authorization, and decryption checks.
4. Switch runtime configuration to the new databases, then restore traffic and webhook processing.
5. Keep PostgreSQL read-only and intact through the rollback window.

Rollback means stopping writes, pointing the application back to the untouched PostgreSQL database, and replaying or reconciling any writes accepted after SQLite cutover. A rollback is not safe after divergent writes unless that reconciliation has been performed.
