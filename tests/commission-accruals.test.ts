import assert from 'node:assert/strict';
import test from 'node:test';

import {
  commissionAccrualInputSchema,
  installmentCommissionRecordId,
  unifiedCommissionRecordId,
} from '../lib/commission-accruals.ts';
import {
  contractsToCommissionRecords,
  emptyContract,
  emptyInstallment,
  type StoredContract,
} from '../lib/contracts.ts';

void test('uses a stable commission record id across contract edits', () => {
  const contract: StoredContract = {
    ...emptyContract(),
    id: 'contract-1',
    created_at: '2026-09-01T00:00:00.000Z',
    customer_name: '测试客户',
    contract_name: '测试合同',
    contract_number: 'TEST-001',
    salesperson: '测试销售',
    annual_contract_amount: 50_000,
    related_contract_status: 'checked_none',
    installments: [
      {
        ...emptyInstallment(1),
        id: 'database-row-before-edit',
        planned_amount: 50_000,
        received_amount: 50_000,
        due_date: '2026-09-10',
        received_date: '2026-09-10',
      },
    ],
  };

  const before = contractsToCommissionRecords(
    [contract],
    '2026-09',
    '测试销售',
  );
  const after = contractsToCommissionRecords(
    [
      {
        ...contract,
        installments: [
          { ...contract.installments[0], id: 'database-row-after-edit' },
        ],
      },
    ],
    '2026-09',
    '测试销售',
  );

  assert.equal(
    before[0]?.record_id,
    installmentCommissionRecordId('contract-1', 1),
  );
  assert.equal(after[0]?.record_id, before[0]?.record_id);
  assert.equal(unifiedCommissionRecordId('contract-1'), 'contract-1:unified');
});

void test('validates the accounting accrual snapshot', () => {
  const valid = commissionAccrualInputSchema.safeParse({
    record_id: 'contract-1:installment:1',
    contract_id: 'contract-1',
    settlement_month: '2026-09',
    salesperson: '测试销售',
    commission_amount: 5_000,
  });
  assert.equal(valid.success, true);

  const invalid = commissionAccrualInputSchema.safeParse({
    record_id: 'contract-1:installment:1',
    contract_id: 'contract-1',
    settlement_month: '2026/09',
    salesperson: '测试销售',
    commission_amount: 0,
  });
  assert.equal(invalid.success, false);
});
