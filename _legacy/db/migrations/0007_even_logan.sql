DELETE FROM "github_installation_token" AS "stale"
USING "github_installation_token" AS "kept"
WHERE "stale"."installation_id" = "kept"."installation_id"
  AND (
    "stale"."expires_at" < "kept"."expires_at"
    OR (
      "stale"."expires_at" = "kept"."expires_at"
      AND "stale"."id" < "kept"."id"
    )
  );--> statement-breakpoint
DROP INDEX "idx_github_installation_token_installationId";--> statement-breakpoint
CREATE UNIQUE INDEX "uq_github_installation_token_installationId" ON "github_installation_token" USING btree ("installation_id");
