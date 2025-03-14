CREATE TABLE `cached_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner` text NOT NULL,
	`repo` text NOT NULL,
	`branch` text NOT NULL,
	`parent_path` text NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`type` text NOT NULL,
	`content` text,
	`sha` text,
	`last_updated` integer NOT NULL
);
