# PostgreSQL migration

Version 3 transfers collaborator assignments from the retained version 2 PostgreSQL schema into a freshly migrated SQLite/libSQL or D1 destination. This is a collaborator-only upgrade, not a full database restore. No production migration has been run.

## Retained data

Keep each assignment's installation, owner and repository identifiers, owner/repository names, email and available display name. PostgreSQL reads run with `default_transaction_read_only=on`. Existing target users link by email; old user IDs are not reused. Accounts created after import bind to their assignments when the verified email matches.

Legacy nonempty branch restrictions require an explicit permission migration. Both import paths reject those rows rather than granting repository-wide access. Resolve that scope before cutover.

## Run the migration

Follow [Upgrading](../public/self-hosting/upgrading.md#2-move-collaborators).
The script reads the released 2.x PostgreSQL schema. That schema has no
membership creation timestamp, so imported timestamps are unknown. SQLite and
libSQL receive an atomic batch. For D1, the script prepares a new owner-only SQL
file for explicit application to the destination.

## Rehearsal and cutover

Unit tests cover CSV validation, SQL quoting, destination email linkage, idempotent upserts and scope rejection. Integration tests execute the prepared SQL against local D1. A real PostgreSQL snapshot export and deployed-provider rehearsal remain release gates.
