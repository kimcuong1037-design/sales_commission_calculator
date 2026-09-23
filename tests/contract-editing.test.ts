import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createTestStorage } from './helpers/storage.ts';

import { contractAccrualState } from '../lib/contract-editing.ts';
import {
  installmentCommissionRecordId,
  unifiedCommissionRecordId,
} from '../lib/commission-accruals.ts';
import {
  emptyContract,
  emptyInstallment,
  type StoredContract,
} from '../lib/contracts.ts';

async function storageFor(sqlite: DatabaseSync) {
  return (await createTestStorage(sqlite)).storage;
}

function fixture() {
  return {
    ...emptyContract(),
    customer_name: '测试客户',
    contract_name: '两期合同',
    contract_number: 'TEST-2',
    salesperson: '测试销售',
    signed_date: '2026-09-01',
    delivery_requirement: '按期交付',
    annual_contract_amount: 58_000,
    related_contract_status: 'checked_none' as const,
    installments: [
      {
        ...emptyInstallment(1),
        planned_amount: 29_000,
        received_amount: 29_000,
        due_date: '2026-09-10',
        received_date: '2026-09-10',
      },
      {
        ...emptyInstallment(2),
        planned_amount: 29_000,
        due_date: '2026-10-10',
      },
    ],
  };
}

void test('accrued installments stay protected and a third installment can be added after both accrue', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    let storage = await storageFor(sqlite);
    const id = await storage.createContract({
      ...fixture(),
      annual_contract_amount: 60_000,
    });
    await storage.markCommissionAccrued({
      record_id: installmentCommissionRecordId(id, 1),
      contract_id: id,
      settlement_month: '2026-09',
      salesperson: '测试销售',
      commission_amount: 2900,
    });
    const before = (await storage.listContracts())[0];
    const history = await storage.listCommissionAccruals();
    assert.equal(contractAccrualState(before, history).fullyAccrued, false);

    // Reproduce the old database trigger, then start the updated application.
    sqlite.exec(`DROP TRIGGER protect_accrued_installment_delete;
      CREATE TRIGGER protect_accrued_installment_delete BEFORE DELETE ON installments
      WHEN EXISTS (SELECT 1 FROM commission_accruals WHERE contract_id = OLD.contract_id)
      BEGIN SELECT RAISE(ABORT, 'ACCRUED_CONTRACT'); END;`);
    storage = await storageFor(sqlite);
    const updated = structuredClone(before);
    updated.installments[1].received_amount = 29_000;
    updated.installments[1].received_date = '2026-10-10';
    await storage.updateContract(id, updated);
    const after = (await storage.listContracts())[0];
    assert.deepEqual(after.installments[0], before.installments[0]);
    assert.equal(after.installments[1].received_amount, 29_000);
    assert.deepEqual(await storage.listCommissionAccruals(), history);
    await assert.rejects(storage.deleteContract(id), /ACCRUED_CONTRACT/);
    await assert.rejects(
      storage.updateContract(id, { ...after, salesperson: '其他销售' }),
      /ACCRUED_CONTRACT_DETAILS/,
    );
    await assert.rejects(
      storage.updateContract(id, {
        ...after,
        installments: [after.installments[1]],
      }),
      /ACCRUED_INSTALLMENT/,
    );
    const changedHistory = structuredClone(after);
    changedHistory.installments[0].received_amount = 1;
    await assert.rejects(
      storage.updateContract(id, changedHistory),
      /ACCRUED_INSTALLMENT/,
    );
    assert.throws(
      () =>
        sqlite
          .prepare(
            'UPDATE installments SET received_amount = 1 WHERE contract_id = ? AND installment_no = 1',
          )
          .run(id),
      /ACCRUED_CONTRACT/,
    );

    await storage.markCommissionAccrued({
      record_id: installmentCommissionRecordId(id, 2),
      contract_id: id,
      settlement_month: '2026-10',
      salesperson: '测试销售',
      commission_amount: 2900,
    });
    assert.equal(
      contractAccrualState(after, await storage.listCommissionAccruals())
        .fullyAccrued,
      true,
    );
    const accruedHistory = await storage.listCommissionAccruals();
    await storage.updateContract(id, {
      ...after,
      installments: [
        ...after.installments,
        {
          ...emptyInstallment(3),
          planned_amount: 1000,
          due_date: '2026-11-10',
          received_amount: 1000,
          received_date: '2026-11-10',
        },
      ],
    });
    const withThird = (await storage.listContracts())[0];
    assert.equal(withThird.installments.length, 3);
    assert.deepEqual(withThird.installments.slice(0, 2), after.installments);
    assert.deepEqual(await storage.listCommissionAccruals(), accruedHistory);
    await storage.markCommissionAccrued({
      record_id: installmentCommissionRecordId(id, 3),
      contract_id: id,
      settlement_month: '2026-11',
      salesperson: '测试销售',
      commission_amount: 100,
    });
    assert.equal((await storage.listCommissionAccruals()).length, 3);
  } finally {
    sqlite.close();
  }
});

void test('unaccrued contracts stay editable and unified accrual locks every installment', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const storage = await storageFor(sqlite);
    const id = await storage.createContract(fixture());
    await storage.updateContract(id, {
      ...fixture(),
      contract_name: '已修改',
      commission_mode: 'hold_until_full',
    });
    const contract = (await storage.listContracts())[0];
    assert.equal(contract.contract_name, '已修改');
    await storage.markCommissionAccrued({
      record_id: unifiedCommissionRecordId(id),
      contract_id: id,
      settlement_month: '2026-10',
      salesperson: '测试销售',
      commission_amount: 5800,
    });
    assert.equal(
      contractAccrualState(contract, await storage.listCommissionAccruals())
        .fullyAccrued,
      true,
    );
    await storage.updateContract(id, contract);
    const changed = structuredClone(contract);
    changed.installments[0].received_amount = 100;
    await assert.rejects(
      storage.updateContract(id, changed),
      /ACCRUED_INSTALLMENT/,
    );
  } finally {
    sqlite.close();
  }
});

void test('unaccrued earlier project receipts cannot change an accrued cumulative basis', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const storage = await storageFor(sqlite);
    const input = fixture();
    input.installments[1].received_amount = 29_000;
    input.installments[1].received_date = '2026-10-10';
    const id = await storage.createContract({
      ...input,
      business_type: 'enterprise',
      quoted_amount: 58_000,
    });
    await storage.markCommissionAccrued({
      record_id: installmentCommissionRecordId(id, 2),
      contract_id: id,
      settlement_month: '2026-10',
      salesperson: '测试销售',
      commission_amount: 1000,
    });
    const contract: StoredContract = (await storage.listContracts())[0];
    contract.installments[0].received_amount = 100;
    await assert.rejects(
      storage.updateContract(id, contract),
      /ACCRUED_CALCULATION_CHANGED/,
    );
  } finally {
    sqlite.close();
  }
});
