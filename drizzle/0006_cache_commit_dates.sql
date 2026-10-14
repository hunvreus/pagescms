ALTER TABLE `cache_file_meta` ADD `refreshed_at` integer;--> statement-breakpoint
ALTER TABLE `cache_file` ADD `change_commit_sha` text;--> statement-breakpoint
-- Existing directory commit timestamps were cache publication times, not Git dates.
UPDATE cache_file_meta SET refreshed_at = commit_timestamp, commit_timestamp = NULL;
--> statement-breakpoint
-- No previous writer established last-file-change provenance.
UPDATE cache_file SET commit_timestamp = NULL;
