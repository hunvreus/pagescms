CREATE TABLE "collaborator_invite" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"email" text NOT NULL,
	"owner" text NOT NULL,
	"repo" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "collaborator_invite" (
  "token",
  "email",
  "owner",
  "repo",
  "expires_at",
  "created_at",
  "updated_at"
)
SELECT DISTINCT ON (
  lower(value::jsonb ->> 'owner'),
  lower(value::jsonb ->> 'repo'),
  lower(value::jsonb ->> 'email')
)
  identifier,
  value::jsonb ->> 'email',
  value::jsonb ->> 'owner',
  value::jsonb ->> 'repo',
  expires_at,
  created_at,
  updated_at
FROM "verification"
WHERE value IS NOT NULL
  AND value::jsonb ->> 'source' = 'collaborator-invite'
  AND value::jsonb ->> 'email' IS NOT NULL
  AND value::jsonb ->> 'owner' IS NOT NULL
  AND value::jsonb ->> 'repo' IS NOT NULL
ORDER BY
  lower(value::jsonb ->> 'owner'),
  lower(value::jsonb ->> 'repo'),
  lower(value::jsonb ->> 'email'),
  expires_at DESC;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_collaborator_invite_token" ON "collaborator_invite" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_collaborator_invite_owner_repo_email" ON "collaborator_invite" USING btree ("owner","repo","email");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_collaborator_invite_owner_repo_email_ci" ON "collaborator_invite" USING btree (lower("owner"),lower("repo"),lower("email"));--> statement-breakpoint
DELETE FROM "verification"
WHERE value IS NOT NULL
  AND value::jsonb ->> 'source' = 'collaborator-invite';
