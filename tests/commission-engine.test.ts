import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateCommission,
  type CommissionInputRecord,
} from '../lib/commission-engine.ts';

function common(overrides: Partial<CommissionInputRecord>): CommissionInputRecord {
  return {
    record_id: 'T',
    business_type: 'saas_first',
    customer_name: '测试客户',
    contract_name: '测试合同',
    salesperson: '测试销售',
    contract_id: 'TEST-1',
    customer_source: 'self',
    annual_contract_amount: 100_000,
    related_contract_status: 'checked_none',
    has_customization: false,
    has_staged_acceptance: false,
    received_amount: 80_000,
    due_date: '2026-08-10',
    received_date: '2026-08-12',
    non_sales_delay: false,
    ...overrides,
  };
}

void test('matches the ten controls in the 2026 reference engine', () => {
  const records: CommissionInputRecord[] = [
    common({
      record_id: 'S1',
      implementation_fee_allocated: 6_000,
      business_fee_allocated: 0,
      commission_mode: 'per_payment',
    }),
    common({
      record_id: 'S2',
      business_type: 'saas_renewal',
      customer_source: 'lead',
      received_amount: 120_000,
      annual_contract_amount: 120_000,
      due_date: '2026-08-15',
      received_date: '2026-09-19',
      commission_mode: 'per_payment',
    }),
    common({
      record_id: 'P1',
      received_amount: 29_000,
      annual_contract_amount: 58_000,
      implementation_fee_allocated: 0,
      business_fee_allocated: 0,
      commission_mode: 'per_payment',
    }),
    common({
      record_id: 'P2',
      received_amount: 29_000,
      annual_contract_amount: 58_000,
      implementation_fee_allocated: 0,
      business_fee_allocated: 0,
      commission_mode: 'per_payment',
    }),
    common({
      record_id: 'H1',
      received_amount: 58_000,
      annual_contract_amount: 58_000,
      commission_mode: 'hold_until_full',
      unified_first_year_basis: 58_000,
      hold_approved: true,
      hold_approval_reference: '合同约定',
      any_prior_commission_paid: false,
    }),
    common({
      record_id: 'E1',
      business_type: 'enterprise',
      annual_contract_amount: 1_500_000,
      received_amount: 400_000,
      quoted_amount: 1_500_000,
      milestone_complete: true,
      cumulative_basis_before: 0,
      early_payment_60_days: false,
      delivery_ahead_30_days: false,
    }),
    common({
      record_id: 'E2',
      business_type: 'enterprise',
      annual_contract_amount: 1_500_000,
      received_amount: 500_000,
      quoted_amount: 1_500_000,
      milestone_complete: true,
      cumulative_basis_before: 400_000,
      early_payment_60_days: false,
      delivery_ahead_30_days: false,
    }),
    common({
      record_id: 'E3',
      business_type: 'enterprise',
      annual_contract_amount: 1_500_000,
      received_amount: 600_000,
      quoted_amount: 1_500_000,
      milestone_complete: true,
      cumulative_basis_before: 900_000,
      early_payment_60_days: false,
      delivery_ahead_30_days: false,
    }),
    common({
      record_id: 'D1',
      business_type: 'enterprise',
      annual_contract_amount: 750_000,
      received_amount: 375_000,
      quoted_amount: 1_000_000,
      milestone_complete: true,
      cumulative_basis_before: 0,
      early_payment_60_days: false,
      delivery_ahead_30_days: false,
    }),
    common({
      record_id: 'G1',
      business_type: 'enterprise',
      annual_contract_amount: 3_200_000,
      received_amount: 960_000,
      quoted_amount: 3_200_000,
      milestone_complete: true,
      cumulative_basis_before: 0,
      early_payment_60_days: false,
      delivery_ahead_30_days: false,
    }),
  ];

  const result = calculateCommission({ settlement_month: '2026-09', records });
  const byId = Object.fromEntries(result.results.map((item) => [item.record_id, item]));
  assert.equal(byId.S1.gross_commission_preview, 8_880);
  assert.equal(byId.S2.gross_commission_preview, 3_780);
  assert.equal(
    (byId.P1.gross_commission_preview ?? 0) + (byId.P2.gross_commission_preview ?? 0),
    5_800,
  );
  assert.equal(byId.H1.gross_commission_preview, 6_960);
  assert.deepEqual(
    ['E1', 'E2', 'E3'].map((id) => byId[id].gross_commission_preview),
    [42_000, 35_000, 27_000],
  );
  assert.equal(byId.D1.gross_commission_preview, 35_000);
  assert.equal(byId.D1.status, 'pending_approval');
  assert.equal(byId.G1.status, 'gm_special');
});

void test('keeps review and approval previews out of normal payable', () => {
  const result = calculateCommission({
    settlement_month: '2026-09',
    records: [
      common({
        record_id: 'REVIEW',
        implementation_fee_allocated: 0,
        business_fee_allocated: 0,
        related_contract_status: 'unknown',
      }),
    ],
  });
  assert.equal(result.results[0].status, 'review');
  assert.equal(result.summary.normal_sales_payable, 0);
  assert.equal(result.summary.review_gross_preview, 9_600);
});
