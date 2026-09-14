import assert from 'node:assert/strict';
import test from 'node:test';

import {
  contractSchema,
  emptyContract,
  emptyInstallment,
} from '../lib/contracts.ts';

void test('rejects impossible calendar dates', () => {
  const parsed = contractSchema.safeParse({
    ...emptyContract(),
    customer_name: '测试客户',
    contract_name: '测试合同',
    contract_number: 'TEST-001',
    salesperson: '测试销售',
    annual_contract_amount: 50_000,
    signed_date: '2026-02-31',
  });

  assert.equal(parsed.success, false);
});

void test('rejects duplicate installment numbers before database insertion', () => {
  const parsed = contractSchema.safeParse({
    ...emptyContract(),
    customer_name: '测试客户',
    contract_name: '测试合同',
    contract_number: 'TEST-001',
    salesperson: '测试销售',
    annual_contract_amount: 50_000,
    installments: [emptyInstallment(1), emptyInstallment(1)],
  });

  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.match(parsed.error.issues.map((issue) => issue.message).join('；'), /重复/);
  }
});

void test('rejects unified accrual for a SaaS renewal', () => {
  const parsed = contractSchema.safeParse({
    ...emptyContract(),
    customer_name: '测试客户',
    contract_name: '续费合同',
    contract_number: 'TEST-002',
    salesperson: '测试销售',
    annual_contract_amount: 50_000,
    business_type: 'saas_renewal',
    commission_mode: 'hold_until_full',
  });

  assert.equal(parsed.success, false);
});
