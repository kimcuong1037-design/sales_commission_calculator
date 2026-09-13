import Decimal from 'decimal.js';

export type BusinessType =
  | 'saas_first'
  | 'saas_renewal'
  | 'saas_private_first'
  | 'enterprise';
export type CustomerSource = 'self' | 'lead' | 'referral';
export type CommissionStatus =
  | 'normal'
  | 'review'
  | 'pending_approval'
  | 'no_commission'
  | 'route_to_enterprise'
  | 'gm_special';

export interface UnifiedInstallment {
  basis: number;
  due_date: string;
  received_date: string;
  non_sales_delay?: boolean;
  non_sales_delay_reason?: string | null;
  non_sales_approval_reference?: string | null;
}

export interface CommissionInputRecord {
  record_id: string;
  business_type: BusinessType;
  customer_name: string;
  contract_name?: string;
  salesperson: string;
  contract_id: string;
  customer_source: CustomerSource;
  annual_contract_amount: number;
  related_12m_amount?: number | null;
  related_contract_status: 'checked_none' | 'checked_grouped' | 'unknown';
  has_customization: boolean;
  has_staged_acceptance: boolean;
  received_amount: number;
  due_date: string;
  received_date: string;
  non_sales_delay: boolean;
  non_sales_delay_reason?: string | null;
  non_sales_approval_reference?: string | null;
  implementation_fee_allocated?: number;
  business_fee_allocated?: number;
  commission_mode?: 'per_payment' | 'hold_until_full';
  hold_approved?: boolean;
  hold_approval_reference?: string | null;
  any_prior_commission_paid?: boolean;
  unified_first_year_basis?: number;
  installments?: UnifiedInstallment[];
  quoted_amount?: number | null;
  milestone_complete?: boolean;
  cumulative_basis_before?: number;
  discount_approval_reference?: string | null;
  early_payment_60_days?: boolean;
  early_payment_evidence?: string | null;
  delivery_ahead_30_days?: boolean;
  delivery_evidence?: string | null;
  sales_share?: number;
  supervisor_share?: number;
  team_split_approval_reference?: string | null;
  approved_gm_gross_commission?: number | null;
  gm_approval_reference?: string | null;
}

export interface CommissionResult {
  record_id: string;
  customer_name: string;
  salesperson: string;
  contract_id: string;
  contract_name?: string;
  business_type: BusinessType;
  status: CommissionStatus;
  issues: string[];
  commission_basis?: number | null;
  tier_or_segment?: string | null;
  rate?: number | null;
  overdue_days?: number | null;
  time_coefficient?: number | null;
  discount_rate?: number | null;
  discount_coefficient?: number | null;
  special_coefficient?: number | null;
  gross_commission_preview?: number;
  sales_payable_preview?: number;
  supervisor_pool_preview?: number;
  normal_sales_payable?: number;
  normal_supervisor_pool?: number;
  input_index: number;
}

export interface CommissionCalculation {
  settlement_month: string;
  results: CommissionResult[];
  summary: {
    normal_sales_payable: number;
    normal_supervisor_pool: number;
    normal_gross_commission: number;
    pending_approval_gross_preview: number;
    review_gross_preview: number;
    counts_by_status: Record<CommissionStatus, number>;
  };
}

const ZERO = new Decimal(0);
const ONE = new Decimal(1);

const SOURCE_RATES: Record<CustomerSource, Decimal[]> = {
  self: [new Decimal('0.10'), new Decimal('0.12'), new Decimal('0.07'), new Decimal('0.04')],
  lead: [new Decimal('0.08'), new Decimal('0.09'), new Decimal('0.06'), new Decimal('0.035')],
  referral: [new Decimal('0.10'), new Decimal('0.11'), new Decimal('0.07'), new Decimal('0.04')],
};

const SAAS_RATES: Record<string, Record<CustomerSource, Decimal>> = {
  A: { self: new Decimal('0.10'), lead: new Decimal('0.08'), referral: new Decimal('0.10') },
  B: { self: new Decimal('0.12'), lead: new Decimal('0.09'), referral: new Decimal('0.11') },
  C: { self: new Decimal('0.15'), lead: new Decimal('0.10'), referral: new Decimal('0.12') },
};

const STATUS_PRIORITY: Record<CommissionStatus, number> = {
  normal: 0,
  review: 1,
  pending_approval: 2,
  no_commission: 3,
  route_to_enterprise: 4,
  gm_special: 5,
};

class InputError extends Error {}

function dec(value: unknown, field: string, required = true): Decimal | null {
  if (value === null || value === undefined || value === '') {
    if (required) throw new InputError(`缺少字段：${field}`);
    return null;
  }
  try {
    const parsed = new Decimal(value as Decimal.Value);
    if (!parsed.isFinite()) throw new Error('not finite');
    return parsed;
  } catch {
    throw new InputError(`字段格式无效：${field}`);
  }
}

function requiredDec(value: unknown, field: string) {
  return dec(value, field, true) as Decimal;
}

function boolValue(record: CommissionInputRecord, field: keyof CommissionInputRecord) {
  const value = record[field];
  if (typeof value !== 'boolean') throw new InputError(`字段必须为是/否：${String(field)}`);
  return value;
}

function parseDate(value: unknown, field: string) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new InputError(`日期格式无效：${field}`);
  }
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(timestamp)) throw new InputError(`日期格式无效：${field}`);
  return timestamp;
}

function money(value: Decimal | null | undefined) {
  if (value === null || value === undefined) return null;
  return Number(value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString());
}

function ratio(value: Decimal | null | undefined) {
  return value === null || value === undefined ? null : Number(value.toString());
}

function timeCoefficient(
  due: unknown,
  received: unknown,
  nonSalesDelay: boolean,
  reason?: unknown,
  approval?: unknown,
) {
  const overdueDays = Math.round(
    (parseDate(received, 'received_date') - parseDate(due, 'due_date')) / 86_400_000,
  );
  const issues: string[] = [];
  if (nonSalesDelay) {
    if (!reason || !approval) issues.push('非销售责任缺少原因或审批依据');
    return { overdueDays, coefficient: ONE, issues };
  }
  let coefficient: Decimal;
  if (overdueDays <= 5) coefficient = ONE;
  else if (overdueDays <= 30) coefficient = new Decimal('0.9');
  else if (overdueDays <= 90) coefficient = new Decimal('0.7');
  else if (overdueDays <= 180) coefficient = new Decimal('0.5');
  else coefficient = ZERO;
  return { overdueDays, coefficient, issues };
}

function saasTier(base: Decimal) {
  if (base.lte(50_000)) return 'A';
  if (base.lte(100_000)) return 'B';
  if (base.lt(300_000)) return 'C';
  return null;
}

function progressive(amount: Decimal, source: CustomerSource) {
  const [r1, r2, r3, r4] = SOURCE_RATES[source];
  const positive = Decimal.max(amount, ZERO);
  const s1 = Decimal.min(positive, 50_000);
  const s2 = Decimal.max(ZERO, Decimal.min(positive, 300_000).minus(50_000));
  const s3 = Decimal.max(ZERO, Decimal.min(positive, 1_000_000).minus(300_000));
  const s4 = Decimal.max(ZERO, Decimal.min(positive, 3_000_000).minus(1_000_000));
  return s1.mul(r1).plus(s2.mul(r2)).plus(s3.mul(r3)).plus(s4.mul(r4));
}

export function discountDetails(contract: number, quoted?: number | null) {
  const contractValue = new Decimal(contract);
  if (quoted === null || quoted === undefined || new Decimal(quoted).lte(0)) {
    return { rate: null, coefficient: ONE, issue: '未提供有效原始报价' };
  }
  const rate = contractValue.div(quoted);
  let coefficient: Decimal;
  if (rate.gte('0.8')) coefficient = ONE;
  else if (rate.gte('0.7')) coefficient = new Decimal('0.8');
  else if (rate.gte('0.6')) coefficient = new Decimal('0.7');
  else if (rate.gte('0.5')) coefficient = new Decimal('0.6');
  else coefficient = rate.mul(10).ceil().div(10);
  return { rate, coefficient, issue: null };
}

function chooseStatus(candidates: CommissionStatus[]) {
  let chosen: CommissionStatus = 'normal';
  for (const candidate of candidates) {
    if (STATUS_PRIORITY[candidate] > STATUS_PRIORITY[chosen]) chosen = candidate;
  }
  return chosen;
}

function baseOutput(record: CommissionInputRecord) {
  return {
    record_id: record.record_id,
    customer_name: record.customer_name,
    salesperson: record.salesperson,
    contract_id: record.contract_id,
    contract_name: record.contract_name,
    business_type: record.business_type,
  };
}

function classification(record: CommissionInputRecord) {
  const annual = requiredDec(record.annual_contract_amount, 'annual_contract_amount');
  const related = dec(record.related_12m_amount, 'related_12m_amount', false);
  const amount = Decimal.max(annual, related ?? ZERO);
  const issues = record.related_contract_status === 'checked_none' ||
    record.related_contract_status === 'checked_grouped'
    ? []
    : ['关联合同检查未完成'];
  return { amount, issues };
}

function calcSaas(record: CommissionInputRecord): Omit<CommissionResult, 'input_index'> {
  const out = baseOutput(record);
  const issues: string[] = [];
  const statuses: CommissionStatus[] = [];
  const source = record.customer_source;
  const classificationResult = classification(record);
  issues.push(...classificationResult.issues);
  if (classificationResult.issues.length) statuses.push('review');
  if (
    classificationResult.amount.gte(300_000) ||
    boolValue(record, 'has_customization') ||
    boolValue(record, 'has_staged_acceptance')
  ) {
    return { ...out, status: 'route_to_enterprise', issues: [...issues, '满足大客户/项目型条件'] };
  }

  const received = requiredDec(record.received_amount, 'received_amount');
  if (received.lte(0)) {
    return { ...out, status: 'no_commission', issues: [...issues, '未到账或到账金额不大于0'] };
  }

  const mode = record.commission_mode ?? 'per_payment';
  let basis: Decimal | null = null;
  let gross: Decimal | null = null;
  let overdueDays: number | null = null;
  let timeCoeff: Decimal | null = null;
  let tier: string | null = null;
  let rate: Decimal | null = null;

  if (mode === 'hold_until_full') {
    if (!['saas_first', 'saas_private_first'].includes(record.business_type)) {
      throw new InputError('统一计提仅适用于 SaaS 首年或私有云首年');
    }
    if (record.any_prior_commission_paid === true) {
      statuses.push('review');
      issues.push('已有分期提成发放，不得追溯改为统一计提');
    }
    if (record.hold_approved !== true || !record.hold_approval_reference) {
      statuses.push('pending_approval');
      issues.push('缺少事前统一计提依据');
    }
    const installments = record.installments ?? [];
    if (installments.length) {
      const installmentData = installments.map((item, index) => {
        const itemBasis = requiredDec(item.basis, `installments[${index + 1}].basis`);
        const timing = timeCoefficient(
          item.due_date,
          item.received_date,
          item.non_sales_delay ?? false,
          item.non_sales_delay_reason,
          item.non_sales_approval_reference,
        );
        if (timing.issues.length) {
          issues.push(...timing.issues.map((issue) => `第${index + 1}期：${issue}`));
          statuses.push('review');
        }
        return { basis: itemBasis, coefficient: timing.coefficient };
      });
      basis = Decimal.sum(...installmentData.map((item) => item.basis));
      tier = saasTier(basis);
      if (!tier) {
        return { ...out, status: 'route_to_enterprise', issues: [...issues, '统一计提基数达到项目型范围'] };
      }
      rate = SAAS_RATES[tier][source];
      gross = Decimal.sum(...installmentData.map((item) => item.basis.mul(rate!).mul(item.coefficient)));
    } else {
      basis = requiredDec(record.unified_first_year_basis, 'unified_first_year_basis');
      const timing = timeCoefficient(
        record.due_date,
        record.received_date,
        boolValue(record, 'non_sales_delay'),
        record.non_sales_delay_reason,
        record.non_sales_approval_reference,
      );
      overdueDays = timing.overdueDays;
      timeCoeff = timing.coefficient;
      issues.push(...timing.issues);
      if (timing.issues.length) statuses.push('review');
      tier = saasTier(basis);
      if (!tier) {
        return { ...out, status: 'route_to_enterprise', issues: [...issues, '统一计提基数达到项目型范围'] };
      }
      rate = SAAS_RATES[tier][source];
      gross = basis.mul(rate).mul(timeCoeff);
    }
  } else if (mode === 'per_payment') {
    if (record.business_type === 'saas_renewal') {
      basis = received.mul('0.5');
    } else if (['saas_first', 'saas_private_first'].includes(record.business_type)) {
      const implementation = requiredDec(record.implementation_fee_allocated, 'implementation_fee_allocated');
      const business = requiredDec(record.business_fee_allocated, 'business_fee_allocated');
      const rawBasis = received.minus(implementation).minus(business);
      if (rawBasis.lt(0)) {
        issues.push('扣费后计提基数为负，暂按0');
        statuses.push('review');
      }
      basis = Decimal.max(ZERO, rawBasis);
    } else {
      throw new InputError(`SaaS 业务类型无效：${record.business_type}`);
    }
    const timing = timeCoefficient(
      record.due_date,
      record.received_date,
      boolValue(record, 'non_sales_delay'),
      record.non_sales_delay_reason,
      record.non_sales_approval_reference,
    );
    overdueDays = timing.overdueDays;
    timeCoeff = timing.coefficient;
    issues.push(...timing.issues);
    if (timing.issues.length) statuses.push('review');
    tier = saasTier(basis);
    if (!tier) {
      return { ...out, status: 'route_to_enterprise', issues: [...issues, '计提基数达到项目型范围'] };
    }
    rate = SAAS_RATES[tier][source];
    gross = basis.mul(rate).mul(timeCoeff);
  } else {
    throw new InputError('计提方式无效');
  }

  if (!basis || !gross || !tier || !rate) throw new Error('SaaS calculation failed');
  if (timeCoeff?.eq(0)) {
    statuses.push('no_commission');
    issues.push('逾期超过180天');
  }
  const status = chooseStatus(statuses);
  return {
    ...out,
    status,
    issues,
    commission_basis: money(basis),
    tier_or_segment: tier,
    rate: ratio(rate),
    overdue_days: overdueDays,
    time_coefficient: ratio(timeCoeff),
    discount_rate: null,
    discount_coefficient: null,
    special_coefficient: 1,
    gross_commission_preview: money(gross)!,
    sales_payable_preview: money(gross)!,
    supervisor_pool_preview: 0,
    normal_sales_payable: status === 'normal' ? money(gross)! : 0,
    normal_supervisor_pool: 0,
  };
}

function calcEnterprise(record: CommissionInputRecord): Omit<CommissionResult, 'input_index'> {
  const out = baseOutput(record);
  const issues: string[] = [];
  const statuses: CommissionStatus[] = [];
  const source = record.customer_source;
  const classificationResult = classification(record);
  issues.push(...classificationResult.issues);
  if (classificationResult.issues.length) statuses.push('review');
  const contract = requiredDec(record.annual_contract_amount, 'annual_contract_amount');

  if (classificationResult.amount.gte(3_000_000)) {
    const approved = dec(record.approved_gm_gross_commission, 'approved_gm_gross_commission', false);
    if (!approved || !record.gm_approval_reference) {
      return { ...out, status: 'gm_special', issues: [...issues, '300万及以上且无完整专项方案'] };
    }
    const salesShare = requiredDec(record.sales_share ?? 0.9, 'sales_share');
    const supervisorShare = requiredDec(record.supervisor_share ?? 0.1, 'supervisor_share');
    if (!salesShare.plus(supervisorShare).eq(ONE)) {
      throw new InputError('销售分成与主管池之和必须等于100%');
    }
    const status: CommissionStatus = classificationResult.issues.length ? 'review' : 'normal';
    return {
      ...out,
      status,
      issues: [...issues, '按总经理专项方案金额执行'],
      commission_basis: null,
      tier_or_segment: 'GM-approved',
      rate: null,
      overdue_days: null,
      time_coefficient: null,
      discount_rate: null,
      discount_coefficient: null,
      special_coefficient: null,
      gross_commission_preview: money(approved)!,
      sales_payable_preview: money(approved.mul(salesShare))!,
      supervisor_pool_preview: money(approved.mul(supervisorShare))!,
      normal_sales_payable: status === 'normal' ? money(approved.mul(salesShare))! : 0,
      normal_supervisor_pool: status === 'normal' ? money(approved.mul(supervisorShare))! : 0,
    };
  }

  const received = requiredDec(record.received_amount, 'received_amount');
  if (received.lte(0)) {
    return { ...out, status: 'no_commission', issues: [...issues, '未到账或到账金额不大于0'] };
  }
  if (boolValue(record, 'milestone_complete') !== true) {
    return { ...out, status: 'no_commission', issues: [...issues, '里程碑条件未完成'] };
  }

  const quoted = dec(record.quoted_amount, 'quoted_amount', false);
  const discount = discountDetails(Number(contract.toString()), quoted ? Number(quoted.toString()) : null);
  if (discount.issue) {
    issues.push(discount.issue);
    statuses.push('review');
  } else if (discount.rate?.lt('0.8') && !record.discount_approval_reference) {
    issues.push('折扣低于80%，缺少审批依据');
    statuses.push('pending_approval');
  }

  const basis = received.mul(discount.coefficient);
  const cumulativeBefore = requiredDec(record.cumulative_basis_before, 'cumulative_basis_before');
  const cumulativeAfter = cumulativeBefore.plus(basis);
  const baseCommission = progressive(cumulativeAfter, source).minus(progressive(cumulativeBefore, source));
  const timing = timeCoefficient(
    record.due_date,
    record.received_date,
    boolValue(record, 'non_sales_delay'),
    record.non_sales_delay_reason,
    record.non_sales_approval_reference,
  );
  issues.push(...timing.issues);
  if (timing.issues.length) statuses.push('review');
  if (timing.coefficient.eq(0)) {
    statuses.push('no_commission');
    issues.push('逾期超过180天');
  }

  const earlyPayment = boolValue(record, 'early_payment_60_days');
  const earlyDelivery = boolValue(record, 'delivery_ahead_30_days');
  const validEarlyPayment = earlyPayment && Boolean(record.early_payment_evidence);
  const validEarlyDelivery = earlyDelivery && Boolean(record.delivery_evidence);
  if (earlyPayment && !validEarlyPayment) {
    issues.push('提前回款缺少证据，未应用1.05');
    statuses.push('review');
  }
  if (earlyDelivery && !validEarlyDelivery) {
    issues.push('提前交付缺少证据，未应用1.05');
    statuses.push('review');
  }
  const special = validEarlyPayment || validEarlyDelivery ? new Decimal('1.05') : ONE;
  const salesShare = requiredDec(record.sales_share ?? 0.9, 'sales_share');
  const supervisorShare = requiredDec(record.supervisor_share ?? 0.1, 'supervisor_share');
  if (!salesShare.plus(supervisorShare).eq(ONE)) {
    issues.push('销售分成与主管池之和不等于100%');
    statuses.push('review');
  }
  if ((!salesShare.eq('0.9') || !supervisorShare.eq('0.1')) && !record.team_split_approval_reference) {
    issues.push('特殊团队分成缺少审批依据');
    statuses.push('pending_approval');
  }

  const gross = baseCommission.mul(timing.coefficient).mul(special);
  const sales = gross.mul(salesShare);
  const supervisor = gross.mul(supervisorShare);
  const status = chooseStatus(statuses);
  return {
    ...out,
    status,
    issues,
    commission_basis: money(basis),
    tier_or_segment: `${money(cumulativeBefore)}->${money(cumulativeAfter)}`,
    rate: null,
    overdue_days: timing.overdueDays,
    time_coefficient: ratio(timing.coefficient),
    discount_rate: ratio(discount.rate),
    discount_coefficient: ratio(discount.coefficient),
    special_coefficient: ratio(special),
    gross_commission_preview: money(gross)!,
    sales_payable_preview: money(sales)!,
    supervisor_pool_preview: money(supervisor)!,
    normal_sales_payable: status === 'normal' ? money(sales)! : 0,
    normal_supervisor_pool: status === 'normal' ? money(supervisor)! : 0,
  };
}

export function calculateCommission(payload: {
  settlement_month: string;
  records: CommissionInputRecord[];
}): CommissionCalculation {
  const results = payload.records.map((record, index): CommissionResult => {
    try {
      const result = record.business_type === 'enterprise' ? calcEnterprise(record) : calcSaas(record);
      return { ...result, input_index: index + 1 };
    } catch (error) {
      return {
        ...baseOutput(record),
        status: 'review',
        issues: [error instanceof Error ? error.message : '输入无法计算'],
        input_index: index + 1,
      };
    }
  });

  const sum = (values: number[]) =>
    Number(Decimal.sum(ZERO, ...values.map((value) => new Decimal(value))).toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
  const statuses = Object.keys(STATUS_PRIORITY) as CommissionStatus[];
  const normalSales = sum(results.map((result) => result.normal_sales_payable ?? 0));
  const normalSupervisor = sum(results.map((result) => result.normal_supervisor_pool ?? 0));
  return {
    settlement_month: payload.settlement_month,
    results,
    summary: {
      normal_sales_payable: normalSales,
      normal_supervisor_pool: normalSupervisor,
      normal_gross_commission: sum([normalSales, normalSupervisor]),
      pending_approval_gross_preview: sum(
        results.filter((result) => result.status === 'pending_approval').map((result) => result.gross_commission_preview ?? 0),
      ),
      review_gross_preview: sum(
        results.filter((result) => result.status === 'review').map((result) => result.gross_commission_preview ?? 0),
      ),
      counts_by_status: Object.fromEntries(
        statuses.map((status) => [status, results.filter((result) => result.status === status).length]),
      ) as Record<CommissionStatus, number>,
    },
  };
}
