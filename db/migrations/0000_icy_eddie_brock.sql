CREATE TABLE IF NOT EXISTS "cache_file" (
	"id" serial PRIMARY KEY NOT NULL,
	"context" text DEFAULT 'collection' NOT NULL,
	"owner" text NOT NULL,
	"repo" text NOT NULL,
	"branch" text NOT NULL,
	"parent_path" text NOT NULL,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"type" text NOT NULL,
	"content" text,
	"sha" text,
	"size" integer,
	"download_url" text,
	"commit_sha" text,
	"commit_timestamp" timestamp,
	"last_updated" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cache_permission" (
	"id" serial PRIMARY KEY NOT NULL,
	"github_id" integer NOT NULL,
	"owner" text NOT NULL,
	"repo" text NOT NULL,
	"last_updated" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "collaborator" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text,
	"installation_id" integer NOT NULL,
	"owner_id" integer NOT NULL,
	"repo_id" integer,
	"owner" text NOT NULL,
	"repo" text NOT NULL,
	"branch" text,
	"email" text NOT NULL,
	"user_id" text,
	"invited_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "config" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"repo" text NOT NULL,
	"branch" text NOT NULL,
	"sha" text NOT NULL,
	"version" text NOT NULL,
	"object" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_login_token" (
	"token_hash" text NOT NULL,
	"email" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "email_login_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "github_installation_token" (
	"id" serial PRIMARY KEY NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"installation_id" integer NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "github_user_token" (
	"id" serial PRIMARY KEY NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user" (
	"id" text PRIMARY KEY NOT NULL,
	"github_email" text,
	"github_name" text,
	"github_id" integer,
	"github_username" text,
	"email" text,
	CONSTRAINT "user_github_id_unique" UNIQUE("github_id"),
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "collaborator" ADD CONSTRAINT "collaborator_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "collaborator" ADD CONSTRAINT "collaborator_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "github_user_token" ADD CONSTRAINT "github_user_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cache_file_owner_repo_branch_parentPath" ON "cache_file" USING btree ("owner","repo","branch","parent_path");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_cache_file_owner_repo_branch_path" ON "cache_file" USING btree ("owner","repo","branch","path");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_cache_permission_githubId_owner_repo" ON "cache_permission" USING btree ("github_id","owner","repo");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_collaborator_owner_repo_email" ON "collaborator" USING btree ("owner","repo","email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_collaborator_userId" ON "collaborator" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_config_owner_repo_branch" ON "config" USING btree ("owner","repo","branch");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_github_installation_token_installationId" ON "github_installation_token" USING btree ("installation_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_github_user_token_userId" ON "github_user_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_session_userId" ON "session" USING btree ("user_id");