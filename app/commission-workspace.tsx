'use client';

import {
  AlertTriangle,
  BadgeCheck,
  Calculator,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clipboard,
  FilePlus2,
  Landmark,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ContractDialog } from '@/app/contract-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { calculateCommission } from '@/lib/commission-engine';
import {
  STATUS_LABELS,
  buildSettlementExplanation,
  contractsToCommissionRecords,
  createDemoContracts,
  formatCurrency,
  formatPercent,
  type StoredContract,
} from '@/lib/contracts';

const BUSINESS_LABELS: Record<StoredContract['business_type'], string> = {
  saas_first: 'SaaS 首年',
  saas_renewal: 'SaaS 续费',
  saas_private_first: '私有云首年',
  enterprise: '项目型',
};

export function CommissionWorkspace({ defaultMonth }: { defaultMonth: string }) {
  const [contracts, setContracts] = useState<StoredContract[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [settlementMonth, setSettlementMonth] = useState(defaultMonth);
  const [salesperson, setSalesperson] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedResultId, setSelectedResultId] = useState('');

  const loadContracts = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const response = await fetch('/api/contracts', { cache: 'no-store' });
      const body = (await response.json()) as { contracts?: StoredContract[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? '暂时无法读取合同台账');
      setContracts(body.contracts ?? []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '暂时无法读取合同台账');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadContracts(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadContracts]);

  const usingDemo = !isLoading && contracts.length === 0;
  const effectiveContracts = useMemo(
    () => (contracts.length ? contracts : createDemoContracts(defaultMonth)),
    [contracts, defaultMonth],
  );
  const salespeople = useMemo(
    () => [...new Set(effectiveContracts.map((contract) => contract.salesperson))].sort(),
    [effectiveContracts],
  );

  const activeSalesperson = salespeople.includes(salesperson)
    ? salesperson
    : salespeople[0] ?? '';

  const records = useMemo(
    () => contractsToCommissionRecords(effectiveContracts, settlementMonth, activeSalesperson),
    [activeSalesperson, effectiveContracts, settlementMonth],
  );
  const calculation = useMemo(
    () => calculateCommission({ settlement_month: settlementMonth, records }),
    [records, settlementMonth],
  );
  const explanation = useMemo(
    () => buildSettlementExplanation(calculation, activeSalesperson || '销售同事'),
    [activeSalesperson, calculation],
  );
  const selectedResult = calculation.results.find((result) => result.record_id === selectedResultId)
    ?? calculation.results[0]
    ?? null;

  const copyExplanation = async () => {
    try {
      await navigator.clipboard.writeText(explanation);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const issueCount =
    calculation.summary.counts_by_status.pending_approval +
    calculation.summary.counts_by_status.review +
    calculation.summary.counts_by_status.gm_special +
    calculation.summary.counts_by_status.route_to_enterprise;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/80 bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1480px] items-center justify-between px-5 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="brand-mark" aria-hidden="true">
              <Landmark className="size-4" />
            </span>
            <div>
              <p className="text-[15px] font-semibold tracking-[-0.01em]">佣金台账</p>
              <p className="text-[11px] text-muted-foreground">财务结算工作台</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rule-badge">
              <BadgeCheck className="size-3.5" /> 2026 统一规则 v2.0
            </span>
            <Button className="hidden h-9 px-3 sm:inline-flex" onClick={() => setDialogOpen(true)}>
              <FilePlus2 data-icon="inline-start" /> 录入新合同
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1480px] px-5 py-7 lg:px-8 lg:py-9">
        <section className="mb-7 flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-emerald-800">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
              结算月按实际到账日期筛选
            </div>
            <h1 className="font-heading text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
              月度销售提成结算
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              录入合同与分期回款，按销售人员核算正常应发、待审批和待复核金额。
            </p>
          </div>

          <div className="filter-panel">
            <div className="filter-field">
              <span>
                <CalendarDays className="size-3.5" /> 业绩计提月份
              </span>
              <Input
                aria-label="业绩计提月份"
                className="h-10 border-0 bg-transparent px-0 font-medium shadow-none focus-visible:ring-0"
                type="month"
                value={settlementMonth}
                onChange={(event) => setSettlementMonth(event.target.value)}
              />
            </div>
            <div className="filter-divider" />
            <div className="filter-field min-w-[180px]">
              <span>
                <CircleDollarSign className="size-3.5" /> 签单人 / 销售
              </span>
              <NativeSelect
                aria-label="签单人或销售人员"
                className="w-full"
                disabled={!salespeople.length}
                value={activeSalesperson}
                onChange={(event) => setSalesperson(event.target.value)}
              >
                {salespeople.map((name) => (
                  <NativeSelectOption key={name} value={name}>{name}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <Button className="h-11 px-4" onClick={() => setSelectedResultId(calculation.results[0]?.record_id ?? '')}>
              <Calculator data-icon="inline-start" /> 计算本月提成
            </Button>
          </div>
        </section>

        {usingDemo && (
          <Alert className="demo-alert mb-4">
            <AlertTriangle />
            <AlertDescription>
              当前展示 3 笔演示记录。保存第一份真实合同后，演示数据会自动退出计算。
            </AlertDescription>
            <Button size="sm" onClick={() => setDialogOpen(true)}>录入第一份合同</Button>
          </Alert>
        )}
        {loadError && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle />
            <AlertDescription>{loadError}</AlertDescription>
            <Button size="sm" variant="outline" onClick={() => void loadContracts()}>
              <RefreshCw data-icon="inline-start" /> 重试
            </Button>
          </Alert>
        )}

        <section className="workspace-grid" aria-label="提成结算工作区">
          <div className="space-y-4">
            <Card className="workspace-card min-w-0 gap-0 py-0">
              <CardHeader className="border-b border-border px-5 py-4 sm:px-6">
                <CardTitle className="text-lg">本月到账明细</CardTitle>
                <CardDescription>
                  {activeSalesperson || '暂无销售人员'} · {settlementMonth || '未选择月份'} · {calculation.results.length} 笔触发记录
                </CardDescription>
                <CardAction>
                  <Button variant="outline" className="h-9" onClick={() => setDialogOpen(true)}>
                    <FilePlus2 data-icon="inline-start" /> 新增记录
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="empty-state">
                    <LoaderCircle className="size-5 animate-spin" /> 正在读取合同台账…
                  </div>
                ) : calculation.results.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] border-collapse text-left">
                      <thead>
                        <tr className="table-head">
                          <th>客户 / 合同</th>
                          <th>计提基数</th>
                          <th>销售应得预览</th>
                          <th>状态</th>
                          <th aria-label="查看计算详情" />
                        </tr>
                      </thead>
                      <tbody>
                        {calculation.results.map((result) => (
                          <tr
                            className={`table-row ${selectedResult?.record_id === result.record_id ? 'is-selected' : ''}`}
                            key={result.record_id}
                          >
                            <td>
                              <strong>{result.customer_name}</strong>
                              <span>{result.contract_name ?? result.contract_id} · {result.contract_id}</span>
                            </td>
                            <td className="numeric-cell">{formatCurrency(result.commission_basis)}</td>
                            <td className="numeric-cell">{formatCurrency(result.sales_payable_preview)}</td>
                            <td>
                              <span className={`status-pill status-${result.status}`}>
                                {STATUS_LABELS[result.status]}
                              </span>
                            </td>
                            <td>
                              <Button
                                aria-label={`查看 ${result.contract_name ?? result.contract_id} 计算详情`}
                                variant="ghost"
                                size="icon"
                                onClick={() => setSelectedResultId(result.record_id)}
                              >
                                <ChevronRight />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-state">
                    <CalendarDays className="size-5" />
                    当前销售在该月份没有已到账的计提记录。
                  </div>
                )}
                <div className={`evidence-note ${issueCount ? 'has-issue' : ''}`}>
                  {issueCount ? <AlertTriangle className="size-4" /> : <BadgeCheck className="size-4" />}
                  <p>
                    {issueCount
                      ? `发现 ${issueCount} 笔待审批、待复核或需专项处理的记录，均未混入正常发放。`
                      : '当前记录依据完整，可进入正式发放；主管池另行汇总。'}
                  </p>
                </div>
              </CardContent>
            </Card>

            {selectedResult && (
              <Card className="calculation-detail gap-0 py-0">
                <CardHeader className="border-b border-border px-5 py-4 sm:px-6">
                  <CardTitle>计算过程</CardTitle>
                  <CardDescription>
                    {selectedResult.customer_name} · {BUSINESS_LABELS[selectedResult.business_type]}
                  </CardDescription>
                  <CardAction>
                    <span className={`status-pill status-${selectedResult.status}`}>
                      {STATUS_LABELS[selectedResult.status]}
                    </span>
                  </CardAction>
                </CardHeader>
                <CardContent className="detail-grid px-5 py-5 sm:px-6">
                  <Detail label="计提基数" value={formatCurrency(selectedResult.commission_basis)} />
                  <Detail
                    label={selectedResult.business_type === 'enterprise' ? '累计分段' : '适用比例'}
                    value={selectedResult.business_type === 'enterprise'
                      ? selectedResult.tier_or_segment ?? '—'
                      : formatPercent(selectedResult.rate)}
                  />
                  <Detail label="时效系数" value={selectedResult.time_coefficient ?? '分期分别计算'} />
                  <Detail label="特殊系数" value={selectedResult.special_coefficient ?? '—'} />
                  <Detail label="提成总额预览" value={formatCurrency(selectedResult.gross_commission_preview)} />
                  <Detail label="销售本人预览" value={formatCurrency(selectedResult.sales_payable_preview)} />
                  {selectedResult.issues.length > 0 && (
                    <div className="detail-issues">
                      <strong>需要处理</strong>
                      <ul>{selectedResult.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          <aside className="space-y-4 xl:sticky xl:top-5">
            <Card className="result-card gap-0 py-0">
              <CardHeader className="border-b border-white/15 px-5 py-5">
                <CardDescription className="text-emerald-100">
                  {settlementMonth} · {activeSalesperson || '暂无销售'}
                </CardDescription>
                <CardTitle className="text-xl text-white">销售本人正常应发</CardTitle>
              </CardHeader>
              <CardContent className="px-5 py-6">
                <p className="amount-display">
                  <span>¥</span>
                  {formatCurrency(calculation.summary.normal_sales_payable).replace('¥', '')}
                </p>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <div className="result-metric">
                    <span>正常提成总额</span>
                    <strong>{formatCurrency(calculation.summary.normal_gross_commission)}</strong>
                  </div>
                  <div className="result-metric">
                    <span>主管池</span>
                    <strong>{formatCurrency(calculation.summary.normal_supervisor_pool)}</strong>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="review-grid">
              <div>
                <span>待审批预览</span>
                <strong>{formatCurrency(calculation.summary.pending_approval_gross_preview)}</strong>
              </div>
              <div>
                <span>待复核预览</span>
                <strong>{formatCurrency(calculation.summary.review_gross_preview)}</strong>
              </div>
            </div>

            <Card className="gap-0 py-0">
              <CardHeader className="border-b border-border px-5 py-4">
                <CardTitle>给销售的结算说明</CardTitle>
                <CardDescription>自动生成，可直接复制发送</CardDescription>
                <CardAction>
                  <Button variant="outline" size="sm" onClick={() => void copyExplanation()}>
                    {copied ? <Check data-icon="inline-start" /> : <Clipboard data-icon="inline-start" />}
                    {copied ? '已复制' : '复制'}
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="px-5 py-5">
                <pre className="explanation-copy">{explanation}</pre>
              </CardContent>
            </Card>
          </aside>
        </section>
      </div>

      <ContractDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={loadContracts}
      />
    </main>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
