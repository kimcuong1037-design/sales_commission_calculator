CREATE TABLE IF NOT EXISTS `contract_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`contract_id` text NOT NULL,
	`object_key` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`uploaded_at` text NOT NULL,
	FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `contract_attachments_object_key_unique` ON `contract_attachments` (`object_key`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_contract_attachments_contract` ON `contract_attachments` (`contract_id`);