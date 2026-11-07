CREATE TABLE `channels` (
	`id` text PRIMARY KEY NOT NULL,
	`notifier_id` text NOT NULL,
	`name` text NOT NULL,
	`config_json` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`watch_id` text NOT NULL,
	`type` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`watch_id`) REFERENCES `watches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `events_watch_created_idx` ON `events` (`watch_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `listing_items` (
	`watch_id` text NOT NULL,
	`item_id` text NOT NULL,
	`item_json` text NOT NULL,
	`missing_count` integer DEFAULT 0 NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`watch_id`, `item_id`),
	FOREIGN KEY (`watch_id`) REFERENCES `watches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `watch_channels` (
	`watch_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`watch_id`, `channel_id`),
	FOREIGN KEY (`watch_id`) REFERENCES `watches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `watches` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`url` text NOT NULL,
	`name` text NOT NULL,
	`source_id` text NOT NULL,
	`source_config_json` text DEFAULT '{}' NOT NULL,
	`interval_sec` integer,
	`active` integer DEFAULT true NOT NULL,
	`confirm_restock` integer DEFAULT true NOT NULL,
	`notification_overrides_json` text DEFAULT '{}' NOT NULL,
	`product_phase` text DEFAULT 'NEW' NOT NULL,
	`product_previous_phase` text,
	`listing_baselined` integer DEFAULT false NOT NULL,
	`last_checked_at` integer,
	`next_check_at` integer,
	`error_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `watches_next_check_at_idx` ON `watches` (`next_check_at`);