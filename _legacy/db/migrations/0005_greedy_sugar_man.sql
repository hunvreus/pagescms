CREATE TABLE "cache_file_meta" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"repo" text NOT NULL,
	"branch" text NOT NULL,
	"sha" text,
	"status" text DEFAULT 'ok' NOT NULL,
	"error" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_checked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_cache_file_meta_owner_repo_branch" ON "cache_file_meta" USING btree ("owner","repo","branch");