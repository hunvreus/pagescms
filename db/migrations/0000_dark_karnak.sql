CREATE TABLE `collaborator` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text,
	`installation_id` integer NOT NULL,
	`owner_id` integer NOT NULL,
	`repo_id` integer,
	`owner` text NOT NULL,
	`repo` text NOT NULL,
	`branch` text,
	`email` text NOT NULL,
	`user_id` text,
	`invited_by` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invited_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `config` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner` text NOT NULL,
	`repo` text NOT NULL,
	`branch` text NOT NULL,
	`sha` text NOT NULL,
	`version` text NOT NULL,
	`object` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `email_login_token` (
	`token_hash` text NOT NULL,
	`email` text NOT NULL,
	`expires_at` integer NOT NULL
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
CREATE TABLE `github_user_token` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ciphertext` text NOT NULL,
	`iv` text NOT NULL,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner` text NOT NULL,
	`repo` text NOT NULL,
	`branch` text NOT NULL,
	`last_visited` integer NOT NULL,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`github_email` text,
	`github_name` text,
	`github_id` integer,
	`github_username` text,
	`email` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_login_token_token_hash_unique` ON `email_login_token` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_github_id_unique` ON `user` (`github_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);