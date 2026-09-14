import { env } from 'cloudflare:workers';

import {
  installmentCommissionRecordId,
  unifiedCommissionRecordId,
  type CommissionAccrual,
  type CommissionAccrualInput,
} from '@/lib/commission-accruals';
import type { ContractInput, StoredContract } from '@/lib/contracts';

let initialized = false;

function database() {
  if (!env.DB) throw new Error('数据库连接不可用');
  return env.DB;
}

export async function ensureDatabase() {
  if (initialized) return;
  const db = database();
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS contracts (
        id TEXT PRIMARY KEY,
        customer_name TEXT NOT NULL,
        contract_name TEXT NOT NULL,
        contract_number TEXT NOT NULL,
        salesperson TEXT NOT NULL,
        business_type TEXT NOT NULL,
        customer_source TEXT NOT NULL,
        signed_date TEXT NOT NULL,
        delivery_requirement TEXT NOT NULL,
        annual_contract_amount REAL NOT NULL,
        quoted_amount REAL,
        related_12m_amount REAL,
        related_contract_status TEXT NOT NULL,
        has_customization INTEGER NOT NULL,
        has_staged_acceptance INTEGER NOT NULL,
        commission_mode TEXT NOT NULL,
        hold_approved INTEGER NOT NULL,
        hold_approval_reference TEXT,
        any_prior_commission_paid INTEGER NOT NULL,
        sales_share REAL NOT NULL,
        supervisor_share REAL NOT NULL,
        team_split_approval_reference TEXT,
        approved_gm_gross_commission REAL,
        gm_approval_reference TEXT,
        created_at TEXT NOT NULL
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS installments (
        id TEXT PRIMARY KEY,
        contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
        installment_no INTEGER NOT NULL,
        planned_amount REAL NOT NULL,
        due_date TEXT NOT NULL,
        received_amount REAL NOT NULL,
        received_date TEXT NOT NULL,
        implementation_fee_allocated REAL NOT NULL,
        business_fee_allocated REAL NOT NULL,
        milestone_complete INTEGER NOT NULL,
        cumulative_basis_before REAL,
        non_sales_delay INTEGER NOT NULL,
        non_sales_delay_reason TEXT,
        non_sales_approval_reference TEXT,
        early_payment_60_days INTEGER NOT NULL,
        early_payment_evidence TEXT,
        delivery_ahead_30_days INTEGER NOT NULL,
        delivery_evidence TEXT,
        discount_approval_reference TEXT
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS commission_accruals (
        record_id TEXT PRIMARY KEY,
        contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
        settlement_month TEXT NOT NULL,
        salesperson TEXT NOT NULL,
        commission_amount REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'accrued',
        accrued_at TEXT NOT NULL
      )
    `),
    db.prepare(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_contracts_contract_number ON contracts(contract_number)',
    ),
    db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_contracts_salesperson ON contracts(salesperson)',
    ),
    db.prepare(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_installments_contract_no ON installments(contract_id, installment_no)',
    ),
    db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_installments_received_date ON installments(received_date)',
    ),
  ]);
  await db.prepare('PRAGMA optimize').run();
  initialized = true;
}

type ContractRow = Record<string, string | number | null>;
type InstallmentRow = Record<string, string | number | null>;

const asBoolean = (value: string | number | null) => Boolean(value);

export async function listContracts(): Promise<StoredContract[]> {
  await ensureDatabase();
  const db = database();
  const [contractQuery, installmentQuery] = await Promise.all([
    db
      .prepare('SELECT * FROM contracts ORDER BY created_at DESC')
      .all<ContractRow>(),
    db
      .prepare(
        'SELECT * FROM installments ORDER BY contract_id, installment_no',
      )
      .all<InstallmentRow>(),
  ]);
  const installmentRows = installmentQuery.results ?? [];
  return (contractQuery.results ?? []).map((row) => ({
    id: String(row.id),
    customer_name: String(row.customer_name),
    contract_name: String(row.contract_name),
    contract_number: String(row.contract_number),
    salesperson: String(row.salesperson),
    business_type: String(row.business_type) as StoredContract['business_type'],
    customer_source: String(
      row.customer_source,
    ) as StoredContract['customer_source'],
    signed_date: String(row.signed_date),
    delivery_requirement: String(row.delivery_requirement),
    annual_contract_amount: Number(row.annual_contract_amount),
    quoted_amount:
      row.quoted_amount === null ? null : Number(row.quoted_amount),
    related_12m_amount:
      row.related_12m_amount === null ? null : Number(row.related_12m_amount),
    related_contract_status: String(
      row.related_contract_status,
    ) as StoredContract['related_contract_status'],
    has_customization: asBoolean(row.has_customization),
    has_staged_acceptance: asBoolean(row.has_staged_acceptance),
    commission_mode: String(
      row.commission_mode,
    ) as StoredContract['commission_mode'],
    hold_approved: asBoolean(row.hold_approved),
    hold_approval_reference: String(row.hold_approval_reference ?? ''),
    any_prior_commission_paid: asBoolean(row.any_prior_commission_paid),
    sales_share: Number(row.sales_share),
    supervisor_share: Number(row.supervisor_share),
    team_split_approval_reference: String(
      row.team_split_approval_reference ?? '',
    ),
    approved_gm_gross_commission:
      row.approved_gm_gross_commission === null
        ? null
        : Number(row.approved_gm_gross_commission),
    gm_approval_reference: String(row.gm_approval_reference ?? ''),
    created_at: String(row.created_at),
    installments: installmentRows
      .filter((installment) => installment.contract_id === row.id)
      .map((installment) => ({
        id: String(installment.id),
        installment_no: Number(installment.installment_no),
        planned_amount: Number(installment.planned_amount),
        due_date: String(installment.due_date),
        received_amount: Number(installment.received_amount),
        received_date: String(installment.received_date),
        implementation_fee_allocated: Number(
          installment.implementation_fee_allocated,
        ),
        business_fee_allocated: Number(installment.business_fee_allocated),
        milestone_complete: asBoolean(installment.milestone_complete),
        cumulative_basis_before:
          installment.cumulative_basis_before === null
            ? null
            : Number(installment.cumulative_basis_before),
        non_sales_delay: asBoolean(installment.non_sales_delay),
        non_sales_delay_reason: String(
          installment.non_sales_delay_reason ?? '',
        ),
        non_sales_approval_reference: String(
          installment.non_sales_approval_reference ?? '',
        ),
        early_payment_60_days: asBoolean(installment.early_payment_60_days),
        early_payment_evidence: String(
          installment.early_payment_evidence ?? '',
        ),
        delivery_ahead_30_days: asBoolean(installment.delivery_ahead_30_days),
        delivery_evidence: String(installment.delivery_evidence ?? ''),
        discount_approval_reference: String(
          installment.discount_approval_reference ?? '',
        ),
      })),
  }));
}

export async function createContract(input: ContractInput): Promise<string> {
  await ensureDatabase();
  const db = database();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await db.batch(insertContractStatements(db, input, id, createdAt));
  return id;
}

function insertContractStatements(
  db: ReturnType<typeof database>,
  input: ContractInput,
  id: string,
  createdAt: string,
) {
  return [
    db
      .prepare(`
        INSERT INTO contracts (
          id, customer_name, contract_name, contract_number, salesperson, business_type,
          customer_source, signed_date, delivery_requirement, annual_contract_amount,
          quoted_amount, related_12m_amount, related_contract_status, has_customization,
          has_staged_acceptance, commission_mode, hold_approved, hold_approval_reference,
          any_prior_commission_paid, sales_share, supervisor_share,
          team_split_approval_reference, approved_gm_gross_commission,
          gm_approval_reference, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        input.customer_name,
        input.contract_name,
        input.contract_number,
        input.salesperson,
        input.business_type,
        input.customer_source,
        input.signed_date,
        input.delivery_requirement,
        input.annual_contract_amount,
        input.quoted_amount ?? null,
        input.related_12m_amount ?? null,
        input.related_contract_status,
        Number(input.has_customization),
        Number(input.has_staged_acceptance),
        input.commission_mode,
        Number(input.hold_approved),
        input.hold_approval_reference || null,
        Number(input.any_prior_commission_paid),
        input.sales_share,
        input.supervisor_share,
        input.team_split_approval_reference || null,
        input.approved_gm_gross_commission ?? null,
        input.gm_approval_reference || null,
        createdAt,
      ),
    ...input.installments.map((installment) =>
      db
        .prepare(`
          INSERT INTO installments (
            id, contract_id, installment_no, planned_amount, due_date, received_amount,
            received_date, implementation_fee_allocated, business_fee_allocated,
            milestone_complete, cumulative_basis_before, non_sales_delay,
            non_sales_delay_reason, non_sales_approval_reference, early_payment_60_days,
            early_payment_evidence, delivery_ahead_30_days, delivery_evidence,
            discount_approval_reference
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          crypto.randomUUID(),
          id,
          installment.installment_no,
          installment.planned_amount,
          installment.due_date,
          installment.received_amount,
          installment.received_date,
          installment.implementation_fee_allocated,
          installment.business_fee_allocated,
          Number(installment.milestone_complete),
          installment.cumulative_basis_before ?? null,
          Number(installment.non_sales_delay),
          installment.non_sales_delay_reason || null,
          installment.non_sales_approval_reference || null,
          Number(installment.early_payment_60_days),
          installment.early_payment_evidence || null,
          Number(installment.delivery_ahead_30_days),
          installment.delivery_evidence || null,
          installment.discount_approval_reference || null,
        ),
    ),
  ];
}

export async function updateContract(id: string, input: ContractInput) {
  await ensureDatabase();
  const db = database();
  const existing = await db
    .prepare('SELECT id FROM contracts WHERE id = ?')
    .bind(id)
    .first();
  if (!existing) throw new Error('NOT_FOUND');
  const statements = [
    db
      .prepare(`
      UPDATE contracts SET
        customer_name = ?, contract_name = ?, contract_number = ?, salesperson = ?,
        business_type = ?, customer_source = ?, signed_date = ?, delivery_requirement = ?,
        annual_contract_amount = ?, quoted_amount = ?, related_12m_amount = ?,
        related_contract_status = ?, has_customization = ?, has_staged_acceptance = ?,
        commission_mode = ?, hold_approved = ?, hold_approval_reference = ?,
        any_prior_commission_paid = ?, sales_share = ?, supervisor_share = ?,
        team_split_approval_reference = ?, approved_gm_gross_commission = ?,
        gm_approval_reference = ?
      WHERE id = ?
    `)
      .bind(
        input.customer_name,
        input.contract_name,
        input.contract_number,
        input.salesperson,
        input.business_type,
        input.customer_source,
        input.signed_date,
        input.delivery_requirement,
        input.annual_contract_amount,
        input.quoted_amount ?? null,
        input.related_12m_amount ?? null,
        input.related_contract_status,
        Number(input.has_customization),
        Number(input.has_staged_acceptance),
        input.commission_mode,
        Number(input.hold_approved),
        input.hold_approval_reference || null,
        Number(input.any_prior_commission_paid),
        input.sales_share,
        input.supervisor_share,
        input.team_split_approval_reference || null,
        input.approved_gm_gross_commission ?? null,
        input.gm_approval_reference || null,
        id,
      ),
    db.prepare('DELETE FROM installments WHERE contract_id = ?').bind(id),
    ...input.installments.map((installment) =>
      db
        .prepare(`
        INSERT INTO installments (
          id, contract_id, installment_no, planned_amount, due_date, received_amount,
          received_date, implementation_fee_allocated, business_fee_allocated,
          milestone_complete, cumulative_basis_before, non_sales_delay,
          non_sales_delay_reason, non_sales_approval_reference, early_payment_60_days,
          early_payment_evidence, delivery_ahead_30_days, delivery_evidence,
          discount_approval_reference
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
        .bind(
          crypto.randomUUID(),
          id,
          installment.installment_no,
          installment.planned_amount,
          installment.due_date,
          installment.received_amount,
          installment.received_date,
          installment.implementation_fee_allocated,
          installment.business_fee_allocated,
          Number(installment.milestone_complete),
          installment.cumulative_basis_before ?? null,
          Number(installment.non_sales_delay),
          installment.non_sales_delay_reason || null,
          installment.non_sales_approval_reference || null,
          Number(installment.early_payment_60_days),
          installment.early_payment_evidence || null,
          Number(installment.delivery_ahead_30_days),
          installment.delivery_evidence || null,
          installment.discount_approval_reference || null,
        ),
    ),
  ];
  await db.batch(statements);
}

export async function deleteContract(id: string) {
  await ensureDatabase();
  const db = database();
  const existing = await db
    .prepare('SELECT id FROM contracts WHERE id = ?')
    .bind(id)
    .first();
  if (!existing) throw new Error('NOT_FOUND');
  await db.batch([
    db.prepare('DELETE FROM installments WHERE contract_id = ?').bind(id),
    db.prepare('DELETE FROM contracts WHERE id = ?').bind(id),
  ]);
}

export async function createContracts(inputs: ContractInput[]) {
  await ensureDatabase();
  const db = database();
  const query = await db
    .prepare('SELECT contract_number FROM contracts')
    .all<{ contract_number: string }>();
  const seen = new Set(
    (query.results ?? []).map((row) => String(row.contract_number)),
  );
  const created: string[] = [];
  const skipped: string[] = [];
  for (const input of inputs) {
    if (seen.has(input.contract_number)) {
      skipped.push(input.contract_number);
      continue;
    }
    const id = crypto.randomUUID();
    try {
      await db.batch(
        insertContractStatements(db, input, id, new Date().toISOString()),
      );
      seen.add(input.contract_number);
      created.push(input.contract_number);
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE')) {
        skipped.push(input.contract_number);
        seen.add(input.contract_number);
        continue;
      }
      throw error;
    }
  }
  return { created, skipped };
}

type CommissionAccrualRow = Record<string, string | number | null>;

function mapCommissionAccrual(row: CommissionAccrualRow): CommissionAccrual {
  return {
    record_id: String(row.record_id),
    contract_id: String(row.contract_id),
    settlement_month: String(row.settlement_month),
    salesperson: String(row.salesperson),
    commission_amount: Number(row.commission_amount),
    status: 'accrued',
    accrued_at: String(row.accrued_at),
  };
}

export async function listCommissionAccruals(): Promise<CommissionAccrual[]> {
  await ensureDatabase();
  const query = await database()
    .prepare(
      "SELECT * FROM commission_accruals WHERE status = 'accrued' ORDER BY accrued_at DESC",
    )
    .all<CommissionAccrualRow>();
  return (query.results ?? []).map(mapCommissionAccrual);
}

export async function markCommissionAccrued(
  input: CommissionAccrualInput,
): Promise<CommissionAccrual> {
  await ensureDatabase();
  const db = database();
  const contract = await db
    .prepare('SELECT id FROM contracts WHERE id = ?')
    .bind(input.contract_id)
    .first();
  if (!contract) throw new Error('NOT_FOUND');

  const unifiedId = unifiedCommissionRecordId(input.contract_id);
  if (input.record_id !== unifiedId) {
    const prefix = `${input.contract_id}:installment:`;
    if (!input.record_id.startsWith(prefix)) throw new Error('INVALID_RECORD');
    const installmentNo = Number(input.record_id.slice(prefix.length));
    if (
      !Number.isInteger(installmentNo) ||
      installmentNo <= 0 ||
      input.record_id !==
        installmentCommissionRecordId(input.contract_id, installmentNo)
    ) {
      throw new Error('INVALID_RECORD');
    }
    const installment = await db
      .prepare(
        'SELECT id FROM installments WHERE contract_id = ? AND installment_no = ?',
      )
      .bind(input.contract_id, installmentNo)
      .first();
    if (!installment) throw new Error('NOT_FOUND');
  }

  await db
    .prepare(`
      INSERT OR IGNORE INTO commission_accruals (
        record_id, contract_id, settlement_month, salesperson,
        commission_amount, status, accrued_at
      ) VALUES (?, ?, ?, ?, ?, 'accrued', ?)
    `)
    .bind(
      input.record_id,
      input.contract_id,
      input.settlement_month,
      input.salesperson,
      input.commission_amount,
      new Date().toISOString(),
    )
    .run();

  const saved = await db
    .prepare('SELECT * FROM commission_accruals WHERE record_id = ?')
    .bind(input.record_id)
    .first<CommissionAccrualRow>();
  if (!saved) throw new Error('SAVE_FAILED');
  return mapCommissionAccrual(saved);
}
