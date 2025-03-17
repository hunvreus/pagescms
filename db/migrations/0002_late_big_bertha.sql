ALTER TABLE `cached_entries` ADD `context` text DEFAULT 'collection' NOT NULL;--> statement-breakpoint
ALTER TABLE `cached_entries` ADD `size` integer;--> statement-breakpoint
ALTER TABLE `cached_entries` ADD `download_url` text;--> statement-breakpoint
ALTER TABLE `cached_entries` ADD `commit_sha` text;--> statement-breakpoint
ALTER TABLE `cached_entries` ADD `commit_timestamp` integer;