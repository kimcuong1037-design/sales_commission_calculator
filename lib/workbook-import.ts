import {
  BUSINESS_TYPE_LABELS,
  CUSTOMER_SOURCE_LABELS,
  contractSchema,
  emptyContract,
  emptyInstallment,
  type ContractInput,
} from './contracts.ts';

export type WorkbookCell = string | number | boolean | Date | null | undefined;

export interface WorkbookSheetData {
  sheet: string;
  data: WorkbookCell[][];
}

export interface ParsedContractImport {
  contract: ContractInput;
  errors: string[];
  warnings: string[];
  source_rows: number[];
}

export interface WorkbookImportResult {
  sheet_name: string;
  contracts: ParsedContractImport[];
  ignored_rows: number;
}

const REQUIRED_HEADERS = ['合同号', '公司名称', '签单人'];

function normalizedHeader(value: WorkbookCell) {
  return String(value ?? '').replace(/[\s\n\r]/g, '').trim();
}

function asText(value: WorkbookCell): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return formatDate(value);
  return String(value).trim();
}

function asNumber(value: WorkbookCell) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const normalized = asText(value).replace(/[¥￥,，元\s]/g, '');
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value: WorkbookCell): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const text = asText(value);
  const match = text.match(/(\d{4})[年/.-](\d{1,2})[月/.-](\d{1,2})日?/);
  if (!match) return '';
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

function extractDateAfterLabel(note: string, label: RegExp) {
  const labelMatch = note.match(label);
  if (!labelMatch || labelMatch.index === undefined) return '';
  return formatDate(note.slice(labelMatch.index + labelMatch[0].length, labelMatch.index + labelMatch[0].length + 24));
}

function extractAmount(note: string, pattern: RegExp) {
  const match = note.match(pattern);
  return match ? asNumber(match[1]) : null;
}

function firstText(rows: SourceRow[], field: string) {
  return rows.map((row) => asText(row.get(field))).find(Boolean) ?? '';
}

function firstNumber(rows: SourceRow[], field: string) {
  return rows.map((row) => asNumber(row.get(field))).find((value) => value > 0) ?? 0;
}

class SourceRow {
  readonly rowNumber: number;
  private readonly cells: WorkbookCell[];
  private readonly headers: Map<string, number>;

  constructor(rowNumber: number, cells: WorkbookCell[], headers: Map<string, number>) {
    this.rowNumber = rowNumber;
    this.cells = cells;
    this.headers = headers;
  }

  get(name: string) {
    const index = this.headers.get(normalizedHeader(name));
    return index === undefined ? null : this.cells[index];
  }
}

function customerSource(rows: SourceRow[]): ContractInput['customer_source'] {
  const evidence = `${firstText(rows, '客户来源')} ${rows.map((row) => asText(row.get('备注'))).join(' ')}`;
  if (/自拓/.test(evidence)) return 'self';
  if (/转介绍/.test(evidence)) return 'referral';
  if (/公司线索|客户线索|线索客户|(^|\s)线索($|\s)/.test(evidence)) return 'lead';
  return 'unknown';
}

function businessType(
  rows: SourceRow[],
  amount: number,
  hasCustomization: boolean,
  hasStagedAcceptance: boolean,
): ContractInput['business_type'] {
  const evidence = `${firstText(rows, '版本')} ${rows.map((row) => asText(row.get('备注'))).join(' ')}`;
  if (amount >= 300_000 || hasCustomization || hasStagedAcceptance) return 'enterprise';
  if (/续费/.test(evidence)) return 'saas_renewal';
  if (/私有云/.test(evidence)) return 'saas_private_first';
  if (/SaaS/i.test(evidence)) return 'saas_first';
  return 'unknown';
}

function deliveryRequirement(rows: SourceRow[]) {
  const start = firstText(rows, '系统生效时间');
  const end = firstText(rows, '系统失效时间');
  const parts: string[] = [];
  if (start || end) parts.push(`系统服务期：${formatDate(start) || start || '待补充'} 至 ${formatDate(end) || end || '待补充'}`);
  for (const row of rows) {
    const note = asText(row.get('备注'));
    for (const segment of note.split(/[；;。]/)) {
      const cleaned = segment.trim();
      if (cleaned && /(交付|验收|上线|许可期限|服务期)/.test(cleaned)) parts.push(cleaned);
    }
  }
  return [...new Set(parts)].join('；');
}

function parseInstallment(
  row: SourceRow,
  index: number,
  fallbackAmount: number,
  business: ContractInput['business_type'],
) {
  const installment = emptyInstallment(index + 1);
  const note = asText(row.get('备注'));
  const planned = asNumber(row.get('分期金额')) || fallbackAmount;
  const receivedDate = formatDate(row.get('付款日期'));
  const implementation = extractAmount(note, /(?:本期|合同)?实施费(?:分摊)?\s*([\d,.]+)\s*元/);
  const businessFee = extractAmount(note, /(?:本期)?商务费(?:分摊)?\s*([\d,.]+)\s*元/);
  const cumulative = extractAmount(note, /累计前(?:计提)?基数\s*([\d,.]+)\s*元/);
  return {
    ...installment,
    installment_no: index + 1,
    planned_amount: planned,
    due_date: extractDateAfterLabel(note, /(?:合同)?应收日期?|合同应收日/),
    received_amount: receivedDate ? planned : 0,
    received_date: receivedDate,
    implementation_fee_allocated: implementation ?? 0,
    business_fee_allocated: businessFee ?? 0,
    milestone_complete: business === 'enterprise' ? /已触发|已完成.{0,8}验收|验收.{0,8}已完成/.test(note) : true,
    cumulative_basis_before: cumulative,
  };
}

function parseContract(rows: SourceRow[]): ParsedContractImport {
  const notes = rows.map((row) => asText(row.get('备注'))).filter(Boolean);
  const noteText = notes.join('；');
  const annualAmount = firstNumber(rows, '合同金额') || rows.reduce((sum, row) => sum + asNumber(row.get('分期金额')), 0);
  const hasCustomization = /定制/.test(`${firstText(rows, '版本')} ${noteText}`);
  const hasStagedAcceptance = rows.length > 1 && /(分阶段|里程碑|验收后|验收确认后)/.test(noteText);
  const type = businessType(rows, annualAmount, hasCustomization, hasStagedAcceptance);
  const source = customerSource(rows);
  const delivery = deliveryRequirement(rows);
  const contract = {
    ...emptyContract(),
    customer_name: firstText(rows, '公司名称'),
    contract_name: firstText(rows, '版本'),
    contract_number: firstText(rows, '合同号'),
    salesperson: firstText(rows, '签单人'),
    business_type: type,
    customer_source: source,
    signed_date: formatDate(firstText(rows, '合同签订时间')),
    delivery_requirement: delivery,
    annual_contract_amount: annualAmount,
    related_contract_status: /用户确认.{0,12}(?:本合同)?独立计提|已确认无关联合同/.test(noteText)
      ? 'checked_none' as const
      : 'unknown' as const,
    has_customization: hasCustomization,
    has_staged_acceptance: hasStagedAcceptance,
    any_prior_commission_paid: rows.some((row) => /^(是|已发放)$/.test(asText(row.get('是否发放')))),
    installments: rows.map((row, index) =>
      parseInstallment(row, index, rows.length === 1 ? annualAmount : 0, type),
    ),
  } satisfies ContractInput;

  const warnings: string[] = [];
  if (type === 'unknown') warnings.push('业务类型无法可靠判断，导入后请补充');
  if (source === 'unknown') warnings.push('客户来源不是“自拓、线索或转介绍”，导入后请补充');
  if (!contract.signed_date) warnings.push('缺少签约日期');
  if (!delivery) warnings.push('缺少交付或服务期限要求');
  if (contract.related_contract_status === 'unknown') warnings.push('需确认同客户 / 同项目近 12 个月是否还有其他合同');
  if (type === 'enterprise' && !contract.quoted_amount) warnings.push('项目型合同缺少原始报价');
  contract.installments.forEach((installment, index) => {
    if (installment.received_amount > 0 && !installment.due_date) warnings.push(`第 ${index + 1} 期已到账但缺少合同应收日`);
    if (type === 'enterprise' && installment.received_amount > 0 && !installment.milestone_complete) {
      warnings.push(`第 ${index + 1} 期缺少里程碑已完成的明确记录`);
    }
  });
  if (contract.any_prior_commission_paid) warnings.push('原表标记为已发放；导入仅用于按规则复算');

  const errors: string[] = [];
  if (!contract.contract_number) errors.push('缺少合同号');
  if (!contract.customer_name) errors.push('缺少公司名称');
  if (!contract.contract_name) errors.push('缺少合同名称或版本');
  if (!contract.salesperson) errors.push('缺少签单人');
  if (contract.annual_contract_amount <= 0) errors.push('缺少有效合同金额');
  const validation = contractSchema.safeParse(contract);
  if (!validation.success) {
    for (const issue of validation.error.issues) {
      if (!errors.includes(issue.message)) errors.push(issue.message);
    }
  }

  return {
    contract,
    errors,
    warnings,
    source_rows: rows.map((row) => row.rowNumber),
  };
}

export function parseSalesWorkbook(sheets: WorkbookSheetData[]): WorkbookImportResult {
  let selected: { sheet: WorkbookSheetData; headerRowIndex: number } | null = null;
  for (const sheet of sheets) {
    const headerRowIndex = sheet.data.findIndex((row) => {
      const headers = row.map(normalizedHeader);
      return REQUIRED_HEADERS.every((header) => headers.includes(header));
    });
    if (headerRowIndex >= 0) {
      selected = { sheet, headerRowIndex };
      break;
    }
  }
  if (!selected) throw new Error('没有找到包含“合同号、公司名称、签单人”的签单明细表');

  const headerMap = new Map<string, number>();
  selected.sheet.data[selected.headerRowIndex].forEach((value, index) => {
    const header = normalizedHeader(value);
    if (header) headerMap.set(header, index);
  });
  const groups = new Map<string, SourceRow[]>();
  let ignoredRows = 0;
  let lastContractNumber = '';
  selected.sheet.data.slice(selected.headerRowIndex + 1).forEach((cells, offset) => {
    const row = new SourceRow(selected!.headerRowIndex + offset + 2, cells, headerMap);
    const customer = asText(row.get('公司名称'));
    const amount = asNumber(row.get('合同金额')) + asNumber(row.get('分期金额'));
    const note = asText(row.get('备注'));
    let contractNumber = asText(row.get('合同号'));
    if (!contractNumber && lastContractNumber && (customer || amount > 0)) contractNumber = lastContractNumber;
    if (!contractNumber || (contractNumber.startsWith('备注') && !customer)) {
      ignoredRows += 1;
      return;
    }
    if (!customer && amount <= 0 && !note) {
      ignoredRows += 1;
      return;
    }
    lastContractNumber = contractNumber;
    const existing = groups.get(contractNumber) ?? [];
    existing.push(row);
    groups.set(contractNumber, existing);
  });

  const contracts = [...groups.values()].map(parseContract);
  if (!contracts.length) throw new Error('签单明细表中没有可导入的合同记录');
  return { sheet_name: selected.sheet.sheet, contracts, ignored_rows: ignoredRows };
}

export function importSummaryLabel(item: ParsedContractImport) {
  return `${BUSINESS_TYPE_LABELS[item.contract.business_type]} · ${CUSTOMER_SOURCE_LABELS[item.contract.customer_source]}`;
}
