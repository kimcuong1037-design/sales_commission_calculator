import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const contracts = sqliteTable(
  'contracts',
  {
    id: text('id').primaryKey(),
    customerName: text('customer_name').notNull(),
    contractName: text('contract_name').notNull(),
    contractNumber: text('contract_number').notNull(),
    salesperson: text('salesperson').notNull(),
    businessType: text('business_type').notNull(),
    customerSource: text('customer_source').notNull(),
    signedDate: text('signed_date').notNull(),
    deliveryRequirement: text('delivery_requirement').notNull(),
    annualContractAmount: real('annual_contract_amount').notNull(),
    quotedAmount: real('quoted_amount'),
    related12mAmount: real('related_12m_amount'),
    relatedContractStatus: text('related_contract_status').notNull(),
    hasCustomization: integer('has_customization', {
      mode: 'boolean',
    }).notNull(),
    hasStagedAcceptance: integer('has_staged_acceptance', {
      mode: 'boolean',
    }).notNull(),
    commissionMode: text('commission_mode').notNull(),
    holdApproved: integer('hold_approved', { mode: 'boolean' }).notNull(),
    holdApprovalReference: text('hold_approval_reference'),
    anyPriorCommissionPaid: integer('any_prior_commission_paid', {
      mode: 'boolean',
    }).notNull(),
    salesShare: real('sales_share').notNull(),
    supervisorShare: real('supervisor_share').notNull(),
    teamSplitApprovalReference: text('team_split_approval_reference'),
    approvedGmGrossCommission: real('approved_gm_gross_commission'),
    gmApprovalReference: text('gm_approval_reference'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_contracts_contract_number').on(table.contractNumber),
    index('idx_contracts_salesperson').on(table.salesperson),
  ],
);

export const installments = sqliteTable(
  'installments',
  {
    id: text('id').primaryKey(),
    contractId: text('contract_id')
      .notNull()
      .references(() => contracts.id, { onDelete: 'cascade' }),
    installmentNo: integer('installment_no').notNull(),
    plannedAmount: real('planned_amount').notNull(),
    dueDate: text('due_date').notNull(),
    receivedAmount: real('received_amount').notNull(),
    receivedDate: text('received_date').notNull(),
    implementationFeeAllocated: real('implementation_fee_allocated').notNull(),
    businessFeeAllocated: real('business_fee_allocated').notNull(),
    milestoneComplete: integer('milestone_complete', {
      mode: 'boolean',
    }).notNull(),
    cumulativeBasisBefore: real('cumulative_basis_before'),
    nonSalesDelay: integer('non_sales_delay', { mode: 'boolean' }).notNull(),
    nonSalesDelayReason: text('non_sales_delay_reason'),
    nonSalesApprovalReference: text('non_sales_approval_reference'),
    earlyPayment60Days: integer('early_payment_60_days', {
      mode: 'boolean',
    }).notNull(),
    earlyPaymentEvidence: text('early_payment_evidence'),
    deliveryAhead30Days: integer('delivery_ahead_30_days', {
      mode: 'boolean',
    }).notNull(),
    deliveryEvidence: text('delivery_evidence'),
    discountApprovalReference: text('discount_approval_reference'),
  },
  (table) => [
    uniqueIndex('idx_installments_contract_no').on(
      table.contractId,
      table.installmentNo,
    ),
    index('idx_installments_received_date').on(table.receivedDate),
  ],
);

export const commissionAccruals = sqliteTable('commission_accruals', {
  recordId: text('record_id').primaryKey(),
  contractId: text('contract_id')
    .notNull()
    .references(() => contracts.id, { onDelete: 'cascade' }),
  settlementMonth: text('settlement_month').notNull(),
  salesperson: text('salesperson').notNull(),
  commissionAmount: real('commission_amount').notNull(),
  status: text('status').notNull().default('accrued'),
  accruedAt: text('accrued_at').notNull(),
});

export const contractAttachments = sqliteTable(
  'contract_attachments',
  {
    id: text('id').primaryKey(),
    contractId: text('contract_id')
      .notNull()
      .references(() => contracts.id, { onDelete: 'cascade' }),
    objectKey: text('object_key').notNull().unique(),
    fileName: text('file_name').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    uploadedAt: text('uploaded_at').notNull(),
  },
  (table) => [index('idx_contract_attachments_contract').on(table.contractId)],
);
