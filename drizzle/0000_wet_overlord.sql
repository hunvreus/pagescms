CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
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
CREATE UNIQUE INDEX `account_providerId_accountId_uidx` ON `account` (`provider_id`,`account_id`);--> statement-breakpoint
CREATE TABLE `action_run` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repository_id` integer NOT NULL,
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
	`checked_at` integer,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`repository_id`) REFERENCES `repository`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_action_run_owner_repo_createdAt` ON `action_run` (`repository_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_action_run_scope_time_ci` ON `action_run` (`repository_id`,`ref`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_action_run_owner_repo_actionName` ON `action_run` (`repository_id`,`action_name`);--> statement-breakpoint
CREATE INDEX `idx_action_run_owner_repo_status` ON `action_run` (`repository_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_action_run_context` ON `action_run` (`repository_id`,`context_type`,`context_name`,`context_path`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_action_run_workflowRunId` ON `action_run` (`workflow_run_id`);--> statement-breakpoint
CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`repository_id` integer NOT NULL,
	`source` text NOT NULL,
	`owner` text NOT NULL,
	`repo` text NOT NULL,
	`branch` text NOT NULL,
	`kind` text NOT NULL,
	`area` text NOT NULL,
	`resource` text DEFAULT '' NOT NULL,
	`path` text DEFAULT '' NOT NULL,
	`previous_path` text,
	`actor` text,
	`actor_image` text,
	`actor_id` text,
	`title` text,
	`commit_sha` text,
	`origin` text NOT NULL,
	`occurred_at` integer NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repository`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_activity_scope_time` ON `activity` (`repository_id`,`branch`,`occurred_at`,`id`);--> statement-breakpoint
CREATE TABLE `auth_email_rate` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`started_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_email_rate_started_at_idx` ON `auth_email_rate` (`started_at`);--> statement-breakpoint
CREATE TABLE `cache_file_meta` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repository_id` integer NOT NULL,
	`source` text DEFAULT 'github.com' NOT NULL,
	`owner` text NOT NULL,
	`repo` text NOT NULL,
	`branch` text NOT NULL,
	`path` text DEFAULT '' NOT NULL,
	`context` text DEFAULT 'branch' NOT NULL,
	`commit_sha` text,
	`commit_timestamp` integer,
	`refreshed_at` integer,
	`status` text DEFAULT 'ok' NOT NULL,
	`error` text,
	`publication_token` text,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`last_checked_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repository`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_cache_file_meta_source_owner_repo_branch_path_context` ON `cache_file_meta` (`repository_id`,`branch`,`path`,`context`);--> statement-breakpoint
CREATE TABLE `cache_file` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repository_id` integer NOT NULL,
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
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repository`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_cache_file_source_owner_repo_branch_parentPath` ON `cache_file` (`repository_id`,`branch`,`parent_path`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_cache_file_source_owner_repo_branch_path_context` ON `cache_file` (`repository_id`,`branch`,`path`,`context`);--> statement-breakpoint
CREATE TABLE `collaborator_invite` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repo_id` integer NOT NULL,
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
CREATE UNIQUE INDEX `uq_collaborator_invite_owner_repo_email_ci` ON `collaborator_invite` (`repo_id`,lower("email"));--> statement-breakpoint
CREATE TABLE `collaborator` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`installation_id` integer NOT NULL,
	`owner_id` integer NOT NULL,
	`repo_id` integer NOT NULL,
	`owner` text NOT NULL,
	`repo` text NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`user_id` text,
	`invited_by` text,
	`pending` integer DEFAULT false NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invited_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_collaborator_owner_repo_email` ON `collaborator` (`owner`,`repo`,`email`);--> statement-breakpoint
CREATE INDEX `idx_collaborator_userId` ON `collaborator` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_collaborator_owner_repo_email_ci` ON `collaborator` (`repo_id`,lower("email"));--> statement-breakpoint
CREATE TABLE `config` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repository_id` integer NOT NULL,
	`source` text DEFAULT 'github.com' NOT NULL,
	`owner` text NOT NULL,
	`repo` text NOT NULL,
	`branch` text NOT NULL,
	`sha` text NOT NULL,
	`version` text NOT NULL,
	`object` text NOT NULL,
	`last_checked_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repository`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_config_source_owner_repo_branch` ON `config` (`repository_id`,`branch`);--> statement-breakpoint
CREATE TABLE `deployment_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`default_language` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `github_installation_token` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ciphertext` text NOT NULL,
	`iv` text NOT NULL,
	`installation_id` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_github_installation_token_installationId` ON `github_installation_token` (`installation_id`);--> statement-breakpoint
CREATE TABLE `rate_limit` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`count` integer NOT NULL,
	`last_request` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rate_limit_key_unique` ON `rate_limit` (`key`);--> statement-breakpoint
CREATE TABLE `repository_address` (
	`source` text NOT NULL,
	`owner` text NOT NULL,
	`repo` text NOT NULL,
	`repository_id` integer NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repository`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_repository_address` ON `repository_address` (`source`,`owner`,`repo`);--> statement-breakpoint
CREATE INDEX `idx_repository_address_id` ON `repository_address` (`repository_id`);--> statement-breakpoint
CREATE TABLE `repository` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`external_id` text,
	`owner_id` text,
	`owner` text NOT NULL,
	`repo` text NOT NULL,
	`last_opened_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_repository_source_external_id` ON `repository` (`source`,`external_id`);--> statement-breakpoint
CREATE INDEX `idx_repository_owner` ON `repository` (`source`,`owner`);--> statement-breakpoint
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
CREATE TABLE `sign_in_allowlist` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`value` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sign_in_allowlist_type_value_idx` ON `sign_in_allowlist` (`type`,`value`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`image` text,
	`github_username` text,
	`onboarding_completed_at` integer,
	`preferences` text DEFAULT '{}' NOT NULL,
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