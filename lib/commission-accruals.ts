import { z } from 'zod';

export const commissionAccrualInputSchema = z.object({
  record_id: z.string().trim().min(1, '缺少提成记录编号'),
  contract_id: z.string().trim().min(1, '缺少合同记录编号'),
  settlement_month: z.string().regex(/^\d{4}-\d{2}$/, '计提月份格式不正确'),
  salesperson: z.string().trim().min(1, '缺少销售人员'),
  commission_amount: z.number().positive('提成金额必须大于 0'),
});

export type CommissionAccrualInput = z.infer<
  typeof commissionAccrualInputSchema
>;

export type CommissionAccrualStatus = 'unaccrued' | 'accrued';

export interface CommissionAccrual extends CommissionAccrualInput {
  status: Extract<CommissionAccrualStatus, 'accrued'>;
  accrued_at: string;
}

export function installmentCommissionRecordId(
  contractId: string,
  installmentNo: number,
) {
  return `${contractId}:installment:${installmentNo}`;
}

export function unifiedCommissionRecordId(contractId: string) {
  return `${contractId}:unified`;
}
