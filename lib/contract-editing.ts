import type { CommissionAccrual } from './commission-accruals.ts';
import {
  installmentCommissionRecordId,
  unifiedCommissionRecordId,
} from './commission-accruals.ts';
import {
  contractSchema,
  contractsToCommissionRecords,
  installmentSchema,
  type ContractInput,
  type StoredContract,
} from './contracts.ts';

export function contractAccrualState(
  contract: StoredContract,
  accruals: CommissionAccrual[],
) {
  const records = new Set(
    accruals
      .filter(
        (item) => item.contract_id === contract.id && item.status === 'accrued',
      )
      .map((item) => item.record_id),
  );
  const unified = records.has(unifiedCommissionRecordId(contract.id));
  const accruedInstallmentNumbers = new Set(
    contract.installments
      .filter(
        (item) =>
          unified ||
          records.has(
            installmentCommissionRecordId(contract.id, item.installment_no),
          ),
      )
      .map((item) => item.installment_no),
  );
  return {
    hasAccruals: records.size > 0,
    fullyAccrued:
      unified ||
      (contract.installments.length > 0 &&
        accruedInstallmentNumbers.size === contract.installments.length),
    accruedInstallmentNumbers,
  };
}

function contractDetails(input: ContractInput) {
  const {
    id: _id,
    installments: _installments,
    ...details
  } = contractSchema.parse(input);
  return JSON.stringify(details);
}

function installmentDetails(input: ContractInput['installments'][number]) {
  const { id: _id, ...details } = installmentSchema.parse(input);
  return JSON.stringify(details);
}

export function assertContractEditableUpdate(
  existing: StoredContract,
  input: ContractInput,
  accruals: CommissionAccrual[],
) {
  const state = contractAccrualState(existing, accruals);
  if (!state.hasAccruals) return state;
  if (contractDetails(existing) !== contractDetails(input))
    throw new Error('ACCRUED_CONTRACT_DETAILS');
  for (const installment of existing.installments) {
    if (!state.accruedInstallmentNumbers.has(installment.installment_no))
      continue;
    const next = input.installments.find(
      (item) => item.installment_no === installment.installment_no,
    );
    if (!next || installmentDetails(installment) !== installmentDetails(next)) {
      throw new Error('ACCRUED_INSTALLMENT');
    }
  }
  // Earlier unaccrued receipts can change an accrued project's cumulative basis.
  // Keep those historical calculation inputs stable too.
  const next: StoredContract = {
    ...existing,
    ...input,
    id: existing.id,
    installments: input.installments.map((item) => ({
      ...item,
      id: item.id ?? '',
    })),
  };
  for (const accrual of accruals.filter(
    (item) => item.contract_id === existing.id,
  )) {
    const before = contractsToCommissionRecords(
      [existing],
      accrual.settlement_month,
      existing.salesperson,
    ).find((item) => item.record_id === accrual.record_id);
    const after = contractsToCommissionRecords(
      [next],
      accrual.settlement_month,
      next.salesperson,
    ).find((item) => item.record_id === accrual.record_id);
    if (JSON.stringify(before) !== JSON.stringify(after))
      throw new Error('ACCRUED_CALCULATION_CHANGED');
  }
  return state;
}
