CREATE TABLE `cache_file` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`context` text DEFAULT 'collection' NOT NULL,
	`owner` text NOT NULL,
	`repo` text NOT NULL,
	`branch` text NOT NULL,
	`parent_path` text NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`type` text NOT NULL,
	`content` text,
	`sha` text,
	`size` integer,
	`download_url` text,
	`commit_sha` text,
	`commit_timestamp` integer,
	`last_updated` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cache_permission` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`github_id` integer NOT NULL,
	`owner` text NOT NULL,
	`repo` text NOT NULL,
	`last_updated` integer NOT NULL
);
--> statement-breakpoint
DROP TABLE `history`;--> statement-breakpoint
CREATE INDEX `idx_cache_file_owner_repo_branch_parentPath` ON `cache_file` (`owner`,`repo`,`branch`,`parent_path`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_cache_file_owner_repo_branch_path` ON `cache_file` (`owner`,`repo`,`branch`,`path`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_cache_permission_githubId_owner_repo` ON `cache_permission` (`github_id`,`owner`,`repo`);--> statement-breakpoint
CREATE INDEX `idx_collaborator_owner_repo_email` ON `collaborator` (`owner`,`repo`,`email`);--> statement-breakpoint
CREATE INDEX `idx_collaborator_userId` ON `collaborator` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_config_owner_repo_branch` ON `config` (`owner`,`repo`,`branch`);--> statement-breakpoint
CREATE INDEX `idx_github_installation_token_installationId` ON `github_installation_token` (`installation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_github_user_token_userId` ON `github_user_token` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_session_userId` ON `session` (`user_id`);