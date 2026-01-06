CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`photo_url` text,
	`access_token` text NOT NULL,
	`refresh_token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_email_unique` ON `accounts` (`email`);--> statement-breakpoint
CREATE TABLE `app_config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `current_account` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`account_id` integer,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `proxy_config` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`host` text DEFAULT '127.0.0.1' NOT NULL,
	`port` integer DEFAULT 8094 NOT NULL,
	`scheduling_mode` text DEFAULT 'cache-first' NOT NULL,
	`session_stickiness` integer DEFAULT true NOT NULL,
	`allowed_models` text DEFAULT '[]' NOT NULL,
	`api_key` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `proxy_monitor_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` integer NOT NULL,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`status_code` integer NOT NULL,
	`latency_ms` integer NOT NULL,
	`account_email` text,
	`model` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`error_message` text
);
--> statement-breakpoint
CREATE TABLE `quota_info` (
	`account_id` integer PRIMARY KEY NOT NULL,
	`input_quota` integer DEFAULT 0 NOT NULL,
	`input_used` integer DEFAULT 0 NOT NULL,
	`output_quota` integer DEFAULT 0 NOT NULL,
	`output_used` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
