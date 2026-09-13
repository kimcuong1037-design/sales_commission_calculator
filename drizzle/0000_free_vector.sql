CREATE TABLE `contracts` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_name` text NOT NULL,
	`contract_name` text NOT NULL,
	`contract_number` text NOT NULL,
	`salesperson` text NOT NULL,
	`business_type` text NOT NULL,
	`customer_source` text NOT NULL,
	`signed_date` text NOT NULL,
	`delivery_requirement` text NOT NULL,
	`annual_contract_amount` real NOT NULL,
	`quoted_amount` real,
	`related_12m_amount` real,
	`related_contract_status` text NOT NULL,
	`has_customization` integer NOT NULL,
	`has_staged_acceptance` integer NOT NULL,
	`commission_mode` text NOT NULL,
	`hold_approved` integer NOT NULL,
	`hold_approval_reference` text,
	`any_prior_commission_paid` integer NOT NULL,
	`sales_share` real NOT NULL,
	`supervisor_share` real NOT NULL,
	`team_split_approval_reference` text,
	`approved_gm_gross_commission` real,
	`gm_approval_reference` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_contracts_contract_number` ON `contracts` (`contract_number`);--> statement-breakpoint
CREATE INDEX `idx_contracts_salesperson` ON `contracts` (`salesperson`);--> statement-breakpoint
CREATE TABLE `installments` (
	`id` text PRIMARY KEY NOT NULL,
	`contract_id` text NOT NULL,
	`installment_no` integer NOT NULL,
	`planned_amount` real NOT NULL,
	`due_date` text NOT NULL,
	`received_amount` real NOT NULL,
	`received_date` text NOT NULL,
	`implementation_fee_allocated` real NOT NULL,
	`business_fee_allocated` real NOT NULL,
	`milestone_complete` integer NOT NULL,
	`cumulative_basis_before` real,
	`non_sales_delay` integer NOT NULL,
	`non_sales_delay_reason` text,
	`non_sales_approval_reference` text,
	`early_payment_60_days` integer NOT NULL,
	`early_payment_evidence` text,
	`delivery_ahead_30_days` integer NOT NULL,
	`delivery_evidence` text,
	`discount_approval_reference` text,
	FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_installments_contract_no` ON `installments` (`contract_id`,`installment_no`);--> statement-breakpoint
CREATE INDEX `idx_installments_received_date` ON `installments` (`received_date`);