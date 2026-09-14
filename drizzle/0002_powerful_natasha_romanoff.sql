CREATE TABLE `commission_accruals` (
	`record_id` text PRIMARY KEY NOT NULL,
	`contract_id` text NOT NULL,
	`settlement_month` text NOT NULL,
	`salesperson` text NOT NULL,
	`commission_amount` real NOT NULL,
	`status` text DEFAULT 'accrued' NOT NULL,
	`accrued_at` text NOT NULL,
	FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON UPDATE no action ON DELETE cascade
);
