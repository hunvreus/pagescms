CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`issuer` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_account_userId` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_account_providerId` ON `account` (`provider_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `account_issuer_accountId_uidx` ON `account` (`issuer`,`account_id`);--> statement-breakpoint
CREATE TABLE `action_run` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner` text NOT NULL,
	`repo` text NOT NULL,
	`ref` text NOT NULL,
	`workflow_ref` text NOT NULL,
	`sha` text NOT NULL,
	`action_name` text NOT NULL,
	`context_type` text NOT NULL,
	`context_name` text,
	`context_path` text,
	`workflow` text NOT NULL,
	`workflow_run_id` integer,
	`status` text NOT NULL,
	`conclusion` text,
	`html_url` text,
	`triggered_by` text NOT NULL,
	`failure` text,
	`payload` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_action_run_owner_repo_createdAt` ON `action_run` (`owner`,`repo`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_action_run_owner_repo_actionName` ON `action_run` (`owner`,`repo`,`action_name`);--> statement-breakpoint
CREATE INDEX `idx_action_run_owner_repo_status` ON `action_run` (`owner`,`repo`,`status`);--> statement-breakpoint
CREATE INDEX `idx_action_run_context` ON `action_run` (`owner`,`repo`,`context_type`,`context_name`,`context_path`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_action_run_workflowRunId` ON `action_run` (`workflow_run_id`);--> statement-breakpoint
CREATE TABLE `cache_file_meta` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text DEFAULT 'github.com' NOT NULL,
	`owner` text NOT NULL,
	`repo` text NOT NULL,
	`branch` text NOT NULL,
	`path` text DEFAULT '' NOT NULL,
	`context` text DEFAULT 'branch' NOT NULL,
	`commit_sha` text,
	`commit_timestamp` integer,
	`status` text DEFAULT 'ok' NOT NULL,
	`error` text,
	`publication_token` text,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`last_checked_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_cache_file_meta_source_owner_repo_branch_path_context` ON `cache_file_meta` (`source`,`owner`,`repo`,`branch`,`path`,`context`);--> statement-breakpoint
CREATE TABLE `cache_file` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text DEFAULT 'github.com' NOT NULL,
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
	`commit_sha` text,
	`commit_timestamp` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_cache_file_source_owner_repo_branch_parentPath` ON `cache_file` (`source`,`owner`,`repo`,`branch`,`parent_path`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_cache_file_source_owner_repo_branch_path_context` ON `cache_file` (`source`,`owner`,`repo`,`branch`,`path`,`context`);--> statement-breakpoint
CREATE TABLE `cache_permission` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`github_id` integer NOT NULL,
	`owner` text NOT NULL,
	`repo` text NOT NULL,
	`last_updated` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_cache_permission_githubId_owner_repo` ON `cache_permission` (`github_id`,`owner`,`repo`);--> statement-breakpoint
CREATE TABLE `collaborator_invite` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token` text NOT NULL,
	`email` text NOT NULL,
	`owner` text NOT NULL,
	`repo` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_collaborator_invite_token` ON `collaborator_invite` (`token`);--> statement-breakpoint
CREATE INDEX `idx_collaborator_invite_owner_repo_email` ON `collaborator_invite` (`owner`,`repo`,`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_collaborator_invite_owner_repo_email_ci` ON `collaborator_invite` (lower("owner"),lower("repo"),lower("email"));--> statement-breakpoint
CREATE TABLE `collaborator` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`installation_id` integer NOT NULL,
	`owner_id` integer NOT NULL,
	`repo_id` integer,
	`owner` text NOT NULL,
	`repo` text NOT NULL,
	`branch` text,
	`email` text NOT NULL,
	`user_id` text,
	`invited_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invited_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_collaborator_owner_repo_email` ON `collaborator` (`owner`,`repo`,`email`);--> statement-breakpoint
CREATE INDEX `idx_collaborator_userId` ON `collaborator` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_collaborator_owner_repo_email_ci` ON `collaborator` (lower("owner"),lower("repo"),lower("email"));--> statement-breakpoint
CREATE TABLE `config` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text DEFAULT 'github.com' NOT NULL,
	`owner` text NOT NULL,
	`repo` text NOT NULL,
	`branch` text NOT NULL,
	`sha` text NOT NULL,
	`version` text NOT NULL,
	`object` text NOT NULL,
	`last_checked_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_config_source_owner_repo_branch` ON `config` (`source`,`owner`,`repo`,`branch`);--> statement-breakpoint
CREATE TABLE `github_installation_token` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ciphertext` text NOT NULL,
	`iv` text NOT NULL,
	`installation_id` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_github_installation_token_installationId` ON `github_installation_token` (`installation_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `idx_session_userId` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`image` text,
	`github_username` text,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_verification_identifier` ON `verification` (`identifier`);