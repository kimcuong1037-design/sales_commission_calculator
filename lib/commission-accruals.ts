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

const accruedDateTime = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function formatAccruedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '时间待核对'
    : accruedDateTime.format(date);
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
