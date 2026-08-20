WITH ranked_collaborators AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY lower(owner), lower(repo), lower(email)
      ORDER BY CASE WHEN user_id IS NOT NULL THEN 0 ELSE 1 END, id
    ) AS row_num
  FROM "collaborator"
)
DELETE FROM "collaborator"
USING ranked_collaborators
WHERE "collaborator"."id" = ranked_collaborators.id
  AND ranked_collaborators.row_num > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_collaborator_owner_repo_email_ci" ON "collaborator" USING btree (lower("owner"),lower("repo"),lower("email"));
