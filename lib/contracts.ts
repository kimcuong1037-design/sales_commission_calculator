import Decimal from 'decimal.js';
import { z } from 'zod';

import {
  type CommissionCalculation,
  type CommissionInputRecord,
  type CommissionResult,
  discountDetails,
} from './commission-engine.ts';

const nullableNumber = z.number().min(0).nullable().optional();

export const installmentSchema = z
  .object({
    id: z.string().optional(),
    installment_no: z.number().int().positive(),
    planned_amount: z.number().min(0),
    due_date: z.string(),
    received_amount: z.number().min(0),
    received_date: z.string(),
    implementation_fee_allocated: z.number().min(0),
    business_fee_allocated: z.number().min(0),
    milestone_complete: z.boolean(),
    cumulative_basis_before: nullableNumber,
    non_sales_delay: z.boolean(),
    non_sales_delay_reason: z.string().optional(),
    non_sales_approval_reference: z.string().optional(),
    early_payment_60_days: z.boolean(),
    early_payment_evidence: z.string().optional(),
    delivery_ahead_30_days: z.boolean(),
    delivery_evidence: z.string().optional(),
    discount_approval_reference: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (value.received_amount > 0 && !value.received_date) {
      context.addIssue({
        code: 'custom',
        path: ['received_date'],
        message: '已到账时必须填写实际到账日',
      });
    }
  });

export const contractSchema = z.object({
  id: z.string().optional(),
  customer_name: z.string().trim().min(1, '请填写客户名称'),
  contract_name: z.string().trim().min(1, '请填写合同名称'),
  contract_number: z.string().trim().min(1, '请填写合同编号'),
  salesperson: z.string().trim().min(1, '请填写签单人或销售人员'),
  business_type: z.enum([
    'unknown',
    'saas_first',
    'saas_renewal',
    'saas_private_first',
    'enterprise',
  ]),
  customer_source: z.enum(['unknown', 'self', 'lead', 'referral']),
  signed_date: z.string(),
  delivery_requirement: z.string().trim(),
  annual_contract_amount: z.number().positive('合同金额必须大于 0'),
  quoted_amount: nullableNumber,
  related_12m_amount: nullableNumber,
  related_contract_status: z.enum([
    'checked_none',
    'checked_grouped',
    'unknown',
  ]),
  has_customization: z.boolean(),
  has_staged_acceptance: z.boolean(),
  commission_mode: z.enum(['per_payment', 'hold_until_full']),
  hold_approved: z.boolean(),
  hold_approval_reference: z.string().optional(),
  any_prior_commission_paid: z.boolean(),
  sales_share: z.number().min(0).max(1),
  supervisor_share: z.number().min(0).max(1),
  team_split_approval_reference: z.string().optional(),
  approved_gm_gross_commission: nullableNumber,
  gm_approval_reference: z.string().optional(),
  installments: z.array(installmentSchema).min(1, '至少录入一期付款计划'),
});

export type ContractInput = z.infer<typeof contractSchema>;
export type InstallmentInput = z.infer<typeof installmentSchema>;
export type StoredContract = ContractInput & {
  id: string;
  created_at: string;
  installments: (InstallmentInput & { id: string })[];
};

export const emptyInstallment = (installmentNo: number): InstallmentInput => ({
  installment_no: installmentNo,
  planned_amount: 0,
  due_date: '',
  received_amount: 0,
  received_date: '',
  implementation_fee_allocated: 0,
  business_fee_allocated: 0,
  milestone_complete: true,
  cumulative_basis_before: null,
  non_sales_delay: false,
  non_sales_delay_reason: '',
  non_sales_approval_reference: '',
  early_payment_60_days: false,
  early_payment_evidence: '',
  delivery_ahead_30_days: false,
  delivery_evidence: '',
  discount_approval_reference: '',
});

export const emptyContract = (): ContractInput => ({
  customer_name: '',
  contract_name: '',
  contract_number: '',
  salesperson: '',
  business_type: 'saas_first',
  customer_source: 'self',
  signed_date: '',
  delivery_requirement: '',
  annual_contract_amount: 0,
  quoted_amount: null,
  related_12m_amount: null,
  related_contract_status: 'unknown',
  has_customization: false,
  has_staged_acceptance: false,
  commission_mode: 'per_payment',
  hold_approved: false,
  hold_approval_reference: '',
  any_prior_commission_paid: false,
  sales_share: 0.9,
  supervisor_share: 0.1,
  team_split_approval_reference: '',
  approved_gm_gross_commission: null,
  gm_approval_reference: '',
  installments: [emptyInstallment(1)],
});

function dateForMonth(month: string, day: number) {
  return `${month}-${String(day).padStart(2, '0')}`;
}

export function createDemoContracts(month: string): StoredContract[] {
  return [
    {
      ...emptyContract(),
      id: 'demo-saas',
      created_at: new Date().toISOString(),
      customer_name: '远岸科技',
      contract_name: '2026 企业知识库 SaaS',
      contract_number: 'SaaS-2026-018',
      salesperson: '王璐',
      business_type: 'saas_first',
      customer_source: 'self',
      signed_date: dateForMonth(month, 1),
      delivery_requirement: '签约后 15 个工作日内完成标准版上线',
      annual_contract_amount: 100_000,
      related_contract_status: 'checked_none',
      installments: [
        {
          ...emptyInstallment(1),
          id: 'demo-saas-p1',
          planned_amount: 80_000,
          due_date: dateForMonth(month, 10),
          received_amount: 80_000,
          received_date: dateForMonth(month, 12),
          implementation_fee_allocated: 6_000,
        },
      ],
    },
    {
      ...emptyContract(),
      id: 'demo-enterprise',
      created_at: new Date().toISOString(),
      customer_name: '北辰制造',
      contract_name: '生产协同平台一期',
      contract_number: 'ENT-2026-007',
      salesperson: '王璐',
      business_type: 'enterprise',
      customer_source: 'self',
      signed_date: dateForMonth(month, 1),
      delivery_requirement: '一期里程碑于当月 8 日前完成验收',
      annual_contract_amount: 1_500_000,
      quoted_amount: 1_500_000,
      related_contract_status: 'checked_none',
      has_customization: true,
      has_staged_acceptance: true,
      installments: [
        {
          ...emptyInstallment(1),
          id: 'demo-enterprise-p1',
          planned_amount: 400_000,
          due_date: dateForMonth(month, 10),
          received_amount: 400_000,
          received_date: dateForMonth(month, 12),
          milestone_complete: true,
          cumulative_basis_before: 0,
        },
      ],
    },
    {
      ...emptyContract(),
      id: 'demo-review',
      created_at: new Date().toISOString(),
      customer_name: '启明零售',
      contract_name: '门店数据看板续费',
      contract_number: 'SaaS-2026-031',
      salesperson: '陈宇',
      business_type: 'saas_renewal',
      customer_source: 'lead',
      signed_date: dateForMonth(month, 2),
      delivery_requirement: '原服务到期前续订',
      annual_contract_amount: 120_000,
      related_contract_status: 'unknown',
      installments: [
        {
          ...emptyInstallment(1),
          id: 'demo-review-p1',
          planned_amount: 120_000,
          due_date: dateForMonth(month, 5),
          received_amount: 120_000,
          received_date: dateForMonth(month, 9),
        },
      ],
    },
  ];
}

export function contractsToCommissionRecords(
  contracts: StoredContract[],
  settlementMonth: string,
  salesperson: string,
) {
  const records: CommissionInputRecord[] = [];
  for (const contract of contracts.filter(
    (item) => item.salesperson === salesperson,
  )) {
    const sorted = [...contract.installments].sort((a, b) =>
      (a.received_date || '9999').localeCompare(b.received_date || '9999'),
    );
    if (
      contract.business_type !== 'enterprise' &&
      contract.commission_mode === 'hold_until_full'
    ) {
      const completed =
        sorted.length > 0 &&
        sorted.every((item) => item.received_amount > 0 && item.received_date);
      if (!completed) continue;
      const triggerDate = sorted
        .map((item) => item.received_date)
        .sort()
        .at(-1)!;
      if (!triggerDate.startsWith(settlementMonth)) continue;
      records.push({
        ...commonRecord(contract, sorted.at(-1)!),
        record_id: `${contract.id}:unified`,
        received_amount: sorted.reduce(
          (sum, item) => sum + item.received_amount,
          0,
        ),
        installments: sorted.map((item) => ({
          basis: Math.max(
            0,
            item.received_amount -
              item.implementation_fee_allocated -
              item.business_fee_allocated,
          ),
          due_date: item.due_date,
          received_date: item.received_date,
          non_sales_delay: item.non_sales_delay,
          non_sales_delay_reason: item.non_sales_delay_reason,
          non_sales_approval_reference: item.non_sales_approval_reference,
        })),
        commission_mode: 'hold_until_full',
        hold_approved: contract.hold_approved,
        hold_approval_reference: contract.hold_approval_reference,
        any_prior_commission_paid: contract.any_prior_commission_paid,
      });
      continue;
    }

    const discount = discountDetails(
      contract.annual_contract_amount,
      contract.quoted_amount,
    );
    let runningBasis = new Decimal(0);
    for (const installment of sorted) {
      const suppliedBefore = installment.cumulative_basis_before;
      const cumulativeBefore =
        suppliedBefore ?? Number(runningBasis.toString());
      if (installment.received_amount > 0) {
        runningBasis = new Decimal(cumulativeBefore).plus(
          new Decimal(installment.received_amount).mul(discount.coefficient),
        );
      }
      if (
        !installment.received_date.startsWith(settlementMonth) ||
        installment.received_amount <= 0
      )
        continue;
      records.push({
        ...commonRecord(contract, installment),
        implementation_fee_allocated: installment.implementation_fee_allocated,
        business_fee_allocated: installment.business_fee_allocated,
        commission_mode: 'per_payment',
        quoted_amount: contract.quoted_amount,
        milestone_complete: installment.milestone_complete,
        cumulative_basis_before: cumulativeBefore,
        discount_approval_reference: installment.discount_approval_reference,
        early_payment_60_days: installment.early_payment_60_days,
        early_payment_evidence: installment.early_payment_evidence,
        delivery_ahead_30_days: installment.delivery_ahead_30_days,
        delivery_evidence: installment.delivery_evidence,
        sales_share: contract.sales_share,
        supervisor_share: contract.supervisor_share,
        team_split_approval_reference: contract.team_split_approval_reference,
        approved_gm_gross_commission: contract.approved_gm_gross_commission,
        gm_approval_reference: contract.gm_approval_reference,
      });
    }
  }
  return records;
}

function commonRecord(
  contract: StoredContract,
  installment: StoredContract['installments'][number],
): CommissionInputRecord {
  const inputIssues: string[] = [];
  if (!contract.signed_date) inputIssues.push('请补充签约日期');
  if (!contract.delivery_requirement)
    inputIssues.push('请补充交付或服务期限要求');
  return {
    record_id: installment.id,
    business_type: contract.business_type,
    customer_name: contract.customer_name,
    contract_name: contract.contract_name,
    salesperson: contract.salesperson,
    contract_id: contract.contract_number,
    customer_source: contract.customer_source,
    annual_contract_amount: contract.annual_contract_amount,
    related_12m_amount: contract.related_12m_amount,
    related_contract_status: contract.related_contract_status,
    has_customization: contract.has_customization,
    has_staged_acceptance: contract.has_staged_acceptance,
    received_amount: installment.received_amount,
    due_date: installment.due_date,
    received_date: installment.received_date,
    non_sales_delay: installment.non_sales_delay,
    non_sales_delay_reason: installment.non_sales_delay_reason,
    non_sales_approval_reference: installment.non_sales_approval_reference,
    input_issues: inputIssues,
  };
}

export const STATUS_LABELS: Record<CommissionResult['status'], string> = {
  normal: '可计发',
  pending_approval: '信息待补全',
  review: '信息待补全',
  no_commission: '不计提',
  route_to_enterprise: '业务类型需修正',
  gm_special: '需人工定案',
};

export const BUSINESS_TYPE_LABELS: Record<
  ContractInput['business_type'],
  string
> = {
  unknown: '待判断',
  saas_first: 'SaaS 首年',
  saas_renewal: 'SaaS 续费',
  saas_private_first: '私有云首年',
  enterprise: '项目型',
};

export const CUSTOMER_SOURCE_LABELS: Record<
  ContractInput['customer_source'],
  string
> = {
  unknown: '待补全',
  self: '销售自拓',
  lead: '公司线索',
  referral: '客户转介绍',
};

export function humanizeIssue(issue: string) {
  const exact: Record<string, string> = {
    'SaaS 业务类型无效：unknown':
      '请补充业务类型（SaaS 首年、续费、私有云或项目型）',
    '日期格式无效：due_date': '请补充合同应收日',
    '日期格式无效：received_date': '请核对实际到账日',
    缺少事前统一计提依据: '请补充统一计提的事前合同或书面依据',
    未提供有效原始报价: '请补充原始报价，以核对成交折扣',
    关联合同检查未完成:
      '请确认该客户或同一项目近 12 个月是否还有其他合同；没有请选择“没有其他相关合同”，有则填写合计金额，以判断是否跨过 30 万或 300 万元门槛',
  };
  return (exact[issue] ?? issue)
    .replaceAll('审批依据', '有效书面依据')
    .replaceAll('待审批', '信息待补全');
}

const currency = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  minimumFractionDigits: 2,
});

export function formatCurrency(value: number | null | undefined) {
  return currency.format(value ?? 0).replace('CN¥', '¥');
}

export function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return `${new Decimal(value).mul(100).toDecimalPlaces(2).toString()}%`;
}

function coefficientIsOne(value: number | null | undefined) {
  return value === null || value === undefined || new Decimal(value).eq(1);
}

function coefficientLabel(value: number) {
  return new Decimal(value).toDecimalPlaces(2).toString();
}

function timeAdjustmentLine(result: CommissionResult) {
  const coefficient = result.time_coefficient;
  if (coefficientIsOne(coefficient)) return null;

  const overdueDays = result.overdue_days;
  const timing =
    typeof overdueDays === 'number'
      ? overdueDays > 0
        ? `实际到账比合同应收日晚 ${overdueDays} 天`
        : overdueDays < 0
          ? `实际到账比合同应收日提前 ${Math.abs(overdueDays)} 天`
          : '实际到账日与合同应收日相同'
      : '根据本期实际到账时间';

  if (coefficient === 0) {
    return `${timing}，已超过规则允许的计提时限，因此本期不计提（时效系数 0）。`;
  }
  return `${timing}，按规则以正常提成的 ${formatPercent(coefficient)} 计发（时效系数 ${coefficientLabel(coefficient!)}）。`;
}

function discountAdjustmentLine(result: CommissionResult) {
  const coefficient = result.discount_coefficient;
  if (coefficientIsOne(coefficient)) return null;
  const discountRate =
    result.discount_rate === null || result.discount_rate === undefined
      ? ''
      : `合同成交价约为原报价的 ${formatPercent(result.discount_rate)}，`;
  return `${discountRate}本期回款按 ${formatPercent(coefficient)} 折算为计提基数（折扣系数 ${coefficientLabel(coefficient!)}）。`;
}

function specialAdjustmentLine(result: CommissionResult) {
  const coefficient = result.special_coefficient;
  if (coefficientIsOne(coefficient)) return null;
  const decimal = new Decimal(coefficient!);
  if (decimal.gt(1)) {
    const increase = decimal.minus(1).mul(100).toDecimalPlaces(2).toString();
    return `本期满足“提前回款至少 60 天”或“交付提前至少 30 天”的奖励条件，提成上浮 ${increase}%（特殊系数 ${coefficientLabel(coefficient!)}）。`;
  }
  return `本期存在特殊调整，按基础提成的 ${formatPercent(coefficient)} 计算（特殊系数 ${coefficientLabel(coefficient!)}）。`;
}

function cumulativeSegmentLine(segment: string | null | undefined) {
  if (!segment) return '项目提成按累计分段方式计算。';
  const [before, after] = segment.split('->').map(Number);
  if (!Number.isFinite(before) || !Number.isFinite(after)) {
    return '项目提成按累计分段方式计算。';
  }
  return `项目提成按累计分段方式计算，累计计提基数由 ${formatCurrency(before)} 增至 ${formatCurrency(after)}。`;
}

function salesShareLine(result: CommissionResult) {
  const gross = result.gross_commission_preview;
  const sales = result.sales_payable_preview;
  const supervisor = result.supervisor_pool_preview;
  if (
    gross === undefined ||
    sales === undefined ||
    gross <= 0 ||
    supervisor === undefined
  )
    return null;
  const salesShare = new Decimal(sales).div(gross);
  const supervisorShare = new Decimal(supervisor).div(gross);
  if (supervisorShare.eq(0)) return null;
  return `提成总额按销售本人 ${formatPercent(salesShare.toNumber())}、主管池 ${formatPercent(supervisorShare.toNumber())} 分配。`;
}

function resultOutcomeLines(result: CommissionResult) {
  const sales = result.sales_payable_preview;
  if (result.status === 'normal' && sales !== undefined) {
    return [`本笔你可获得：${formatCurrency(sales)}（可计发）。`];
  }
  if (result.status === 'no_commission') {
    return ['本笔结果：暂不计提。'];
  }
  if (result.status === 'route_to_enterprise') {
    return ['本笔结果：需要改按项目型规则核算，暂不计入本月发放。'];
  }
  if (result.status === 'gm_special') {
    return ['本笔结果：需要确定专项提成方案，暂不计入本月发放。'];
  }
  const estimate =
    sales === undefined
      ? ''
      : `，按现有资料暂估销售提成为 ${formatCurrency(sales)}`;
  return [`本笔结果：还需补充或确认资料${estimate}，暂不计入本月发放。`];
}

export function buildSettlementExplanation(
  calculation: CommissionCalculation,
  salesperson: string,
) {
  const [year, month] = calculation.settlement_month.split('-');
  const lines = [
    `${salesperson}，你好：`,
    '',
    `你在 ${year} 年 ${Number(month)} 月可计发的销售提成为 ${formatCurrency(calculation.summary.normal_sales_payable)}。明细如下：`,
  ];
  calculation.results.forEach((result, index) => {
    lines.push(
      '',
      `${index + 1}. ${result.customer_name}｜《${result.contract_name ?? result.contract_id}》（合同编号：${result.contract_id}）`,
    );

    const basis = result.commission_basis;
    const gross = result.gross_commission_preview;
    if (result.tier_or_segment === 'GM-approved' && gross !== undefined) {
      lines.push(
        `   本合同按已确认的专项方案计算，提成总额为 ${formatCurrency(gross)}。`,
      );
    } else if (result.business_type === 'enterprise') {
      if (basis !== undefined && basis !== null) {
        lines.push(`   本月折算后的计提基数：${formatCurrency(basis)}。`);
      }
      lines.push(`   ${cumulativeSegmentLine(result.tier_or_segment)}`);
      const discountLine = discountAdjustmentLine(result);
      if (discountLine) lines.push(`   ${discountLine}`);
      const timeLine = timeAdjustmentLine(result);
      if (timeLine) lines.push(`   ${timeLine}`);
      const specialLine = specialAdjustmentLine(result);
      if (specialLine) lines.push(`   ${specialLine}`);
      if (gross !== undefined)
        lines.push(`   本期提成总额：${formatCurrency(gross)}。`);
      const shareLine = salesShareLine(result);
      if (shareLine) lines.push(`   ${shareLine}`);
    } else if (basis !== undefined && basis !== null && gross !== undefined) {
      lines.push(`   本月可计提基数：${formatCurrency(basis)}。`);
      const timeLine = timeAdjustmentLine(result);
      if (timeLine) lines.push(`   ${timeLine}`);
      if (
        result.time_coefficient === null ||
        result.time_coefficient === undefined
      ) {
        lines.push(
          `   适用提成比例为 ${formatPercent(result.rate)}；各期按各自到账时效分别计算后，本合同提成合计为 ${formatCurrency(gross)}。`,
        );
      } else {
        const timingPart = coefficientIsOne(result.time_coefficient)
          ? ''
          : ` × ${formatPercent(result.time_coefficient)}`;
        lines.push(
          `   计算方式：${formatCurrency(basis)} × ${formatPercent(result.rate)}${timingPart} = ${formatCurrency(gross)}。`,
        );
      }
    }

    lines.push(...resultOutcomeLines(result).map((line) => `   ${line}`));
    if (result.status !== 'normal' && result.issues.length) {
      lines.push(
        `   还需确认：${result.issues.map(humanizeIssue).join('；')}。`,
      );
    }
  });
  const incompleteSalesPreview = calculation.results
    .filter(
      (result) =>
        result.status === 'pending_approval' || result.status === 'review',
    )
    .reduce(
      (sum, result) => sum.plus(result.sales_payable_preview ?? 0),
      new Decimal(0),
    )
    .toNumber();
  if (incompleteSalesPreview > 0) {
    lines.push(
      '',
      `另有 ${formatCurrency(incompleteSalesPreview)} 的销售提成仍需补充或确认资料，暂未计入本月可计发金额。`,
    );
  }
  if (!calculation.results.length) {
    lines.push('', '该月份暂未找到已到账且满足当前筛选条件的记录。');
  }
  lines.push(
    '',
    '以上金额根据当前已录入的合同和回款资料计算；如资料有调整，最终结果也会相应更新。',
  );
  return lines.join('\n');
}
