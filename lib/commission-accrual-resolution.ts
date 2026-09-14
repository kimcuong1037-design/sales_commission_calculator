import type {
  CommissionAccrualInput,
  CommissionAccrualRequest,
} from './commission-accruals.ts';
import { calculateCommission } from './commission-engine.ts';
import {
  contractsToCommissionRecords,
  type StoredContract,
} from './contracts.ts';

export function resolveCommissionAccrual(
  contracts: StoredContract[],
  request: CommissionAccrualRequest,
): CommissionAccrualInput {
  const contract = contracts.find((item) => item.id === request.contract_id);
  if (!contract) throw new Error('NOT_FOUND');

  const calculation = calculateCommission({
    settlement_month: request.settlement_month,
    records: contractsToCommissionRecords(
      [contract],
      request.settlement_month,
      contract.salesperson,
    ),
  });
  const result = calculation.results.find(
    (item) => item.record_id === request.record_id,
  );
  if (!result) throw new Error('STALE_RECORD');
  if (
    result.status !== 'normal' ||
    !result.gross_commission_preview ||
    result.gross_commission_preview <= 0
  ) {
    throw new Error('NOT_ACCRUABLE');
  }

  return {
    ...request,
    salesperson: result.salesperson,
    commission_amount: result.gross_commission_preview,
  };
}
