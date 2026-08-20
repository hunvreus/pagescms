ALTER TABLE "cache_file_meta" RENAME COLUMN "sha" TO "commit_sha";--> statement-breakpoint
ALTER TABLE "cache_file" RENAME COLUMN "last_updated" TO "updated_at";--> statement-breakpoint
DROP INDEX "idx_cache_file_meta_owner_repo_branch";--> statement-breakpoint
ALTER TABLE "cache_file_meta" ADD COLUMN "path" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "cache_file_meta" ADD COLUMN "context" text DEFAULT 'branch' NOT NULL;--> statement-breakpoint
ALTER TABLE "cache_file_meta" ADD COLUMN "commit_timestamp" timestamp;--> statement-breakpoint
ALTER TABLE "cache_file_meta" ADD COLUMN "target_commit_sha" text;--> statement-breakpoint
ALTER TABLE "cache_file_meta" ADD COLUMN "target_commit_timestamp" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_cache_file_meta_owner_repo_branch_path_context" ON "cache_file_meta" USING btree ("owner","repo","branch","path","context");