CREATE TABLE `repository` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`owner` text NOT NULL,
	`repo` text NOT NULL,
	`last_opened_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_repository_source_owner_repo` ON `repository` (`source`,`owner`,`repo`);