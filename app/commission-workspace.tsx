'use client';

import {
  AlertTriangle,
  BadgeCheck,
  Calculator,
  CalendarDays,
  Check,
  CircleCheckBig,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Clipboard,
  FilePlus2,
  Landmark,
  LoaderCircle,
  PencilLine,
  RefreshCw,
  Database,
  Upload,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ContractDialog } from '@/app/contract-dialog';
import { ContractsManagerDialog } from '@/app/contracts-manager-dialog';
import { ImportContractsDialog } from '@/app/import-contracts-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import { readApiResponse } from '@/lib/api-response';
import {
  formatAccruedAt,
  installmentCommissionRecordId,
  unifiedCommissionRecordId,
  type CommissionAccrual,
} from '@/lib/commission-accruals';
import {
  calculateCommission,
  type CommissionResult,
} from '@/lib/commission-engine';
import {
  BUSINESS_TYPE_LABELS,
  STATUS_LABELS,
  buildSettlementExplanation,
  contractsToCommissionRecords,
  createDemoContracts,
  formatCurrency,
  formatPercent,
  humanizeIssue,
  type StoredContract,
} from '@/lib/contracts';

export function CommissionWorkspace({
  defaultMonth,
}: {
  defaultMonth: string;
}) {
  const [contracts, setContracts] = useState<StoredContract[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [settlementMonth, setSettlementMonth] = useState(defaultMonth);
  const [salesperson, setSalesperson] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<StoredContract | null>(
    null,
  );
  const [returnToManager, setReturnToManager] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedResultId, setSelectedResultId] = useState('');
  const [accruals, setAccruals] = useState<CommissionAccrual[]>([]);
  const [pendingAccrual, setPendingAccrual] = useState<CommissionResult | null>(
    null,
  );
  const [isAccruing, setIsAccruing] = useState(false);
  const [accrualError, setAccrualError] = useState('');

  const loadContracts = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const [contractsResponse, accrualsResponse] = await Promise.all([
        fetch('/api/contracts', { cache: 'no-store' }),
        fetch('/api/commissions/accruals', { cache: 'no-store' }),
      ]);
      const [contractsBody, accrualsBody] = await Promise.all([
        readApiResponse<{ contracts?: StoredContract[] }>(
          contractsResponse,
          '暂时无法读取合同台账',
        ),
        readApiResponse<{ accruals?: CommissionAccrual[] }>(
          accrualsResponse,
          '暂时无法读取财务计提状态',
        ),
      ]);
      setContracts(contractsBody.contracts ?? []);
      setAccruals(accrualsBody.accruals ?? []);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : '暂时无法读取合同台账',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadContracts(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadContracts]);

  const usingDemo = !isLoading && !loadError && contracts.length === 0;
  const effectiveContracts = useMemo(
    () => (usingDemo ? createDemoContracts(defaultMonth) : contracts),
    [contracts, defaultMonth, usingDemo],
  );
  const salespeople = useMemo(
    () =>
      [
        ...new Set(effectiveContracts.map((contract) => contract.salesperson)),
      ].sort(),
    [effectiveContracts],
  );

  const activeSalesperson = salespeople.includes(salesperson)
    ? salesperson
    : (salespeople[0] ?? '');

  const records = useMemo(
    () =>
      contractsToCommissionRecords(
        effectiveContracts,
        settlementMonth,
        activeSalesperson,
      ),
    [activeSalesperson, effectiveContracts, settlementMonth],
  );
  const calculation = useMemo(
    () => calculateCommission({ settlement_month: settlementMonth, records }),
    [records, settlementMonth],
  );
  const explanation = useMemo(
    () =>
      buildSettlementExplanation(calculation, activeSalesperson || '销售同事'),
    [activeSalesperson, calculation],
  );
  const selectedResult =
    calculation.results.find(
      (result) => result.record_id === selectedResultId,
    ) ??
    calculation.results[0] ??
    null;
  const accrualByRecordId = useMemo(
    () => new Map(accruals.map((accrual) => [accrual.record_id, accrual])),
    [accruals],
  );
  const accruedContractIds = useMemo(
    () => new Set(accruals.map((accrual) => accrual.contract_id)),
    [accruals],
  );
  const selectedAccrual = selectedResult
    ? accrualByRecordId.get(selectedResult.record_id)
    : undefined;
  const editableSelectedContract = useMemo(() => {
    if (!selectedResult || usingDemo) return null;
    return (
      contracts.find(
        (contract) =>
          !accruedContractIds.has(contract.id) &&
          commissionBelongsToContract(selectedResult.record_id, contract),
      ) ?? null
    );
  }, [accruedContractIds, contracts, selectedResult, usingDemo]);

  const requestAccrual = (result: CommissionResult) => {
    setSelectedResultId(result.record_id);
    setAccrualError('');
    setPendingAccrual(result);
  };

  const markAccrued = async () => {
    if (!pendingAccrual) return;
    const contract = contracts.find((item) =>
      commissionBelongsToContract(pendingAccrual.record_id, item),
    );
    if (!contract || pendingAccrual.status !== 'normal') {
      setAccrualError('当前记录还不能标记为已计提，请刷新后重试。');
      return;
    }
    setIsAccruing(true);
    setAccrualError('');
    try {
      const response = await fetch('/api/commissions/accruals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          record_id: pendingAccrual.record_id,
          contract_id: contract.id,
          settlement_month: settlementMonth,
        }),
      });
      const body = await readApiResponse<{ accrual?: CommissionAccrual }>(
        response,
        '计提状态保存失败',
      );
      if (!body.accrual) throw new Error('计提状态保存失败');
      setAccruals((current) => [
        body.accrual!,
        ...current.filter((item) => item.record_id !== body.accrual!.record_id),
      ]);
      setPendingAccrual(null);
    } catch (error) {
      setAccrualError(
        error instanceof Error ? error.message : '计提状态保存失败，请稍后重试',
      );
    } finally {
      setIsAccruing(false);
    }
  };

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
  const incompletePreview =
    calculation.summary.pending_approval_gross_preview +
    calculation.summary.review_gross_preview;
  const manualCount =
    calculation.summary.counts_by_status.gm_special +
    calculation.summary.counts_by_status.route_to_enterprise;

  const openNewContract = () => {
    setReturnToManager(false);
    setEditingContract(null);
    setDialogOpen(true);
  };

  const openContractForCorrection = () => {
    if (!editableSelectedContract) return;
    setReturnToManager(false);
    setEditingContract(editableSelectedContract);
    setDialogOpen(true);
  };

  const openManagedContractForEditing = (contract: StoredContract) => {
    setManagerOpen(false);
    setReturnToManager(true);
    setEditingContract(contract);
    setDialogOpen(true);
  };

  const setContractDialogOpen = (open: boolean) => {
    setDialogOpen(open);
    if (!open && returnToManager) {
      setReturnToManager(false);
      setManagerOpen(true);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/80 bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1480px] items-center justify-between px-5 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="brand-mark" aria-hidden="true">
              <Landmark className="size-4" />
            </span>
            <div>
              <p className="text-[15px] font-semibold tracking-[-0.01em]">
                佣金台账
              </p>
              <p className="text-[11px] text-muted-foreground">
                财务计算工作台
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rule-badge">
              <BadgeCheck className="size-3.5" /> 2026 统一规则 v2.0
            </span>
            <Button
              variant="outline"
              className="hidden h-9 px-3 sm:inline-flex"
              onClick={() => setManagerOpen(true)}
            >
              <Database data-icon="inline-start" /> 合同数据管理
            </Button>
            <Button
              variant="outline"
              className="hidden h-9 px-3 sm:inline-flex"
              onClick={() => setImportOpen(true)}
            >
              <Upload data-icon="inline-start" /> 导入 Excel
            </Button>
            <Button
              className="hidden h-9 px-3 sm:inline-flex"
              onClick={openNewContract}
            >
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
              月度销售提成计算
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              录入或导入合同与分期回款，按销售人员计算可计发金额，并直接提示待补信息。
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
                  <NativeSelectOption key={name} value={name}>
                    {name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <Button
              className="h-11 px-4"
              onClick={() =>
                setSelectedResultId(calculation.results[0]?.record_id ?? '')
              }
            >
              <Calculator data-icon="inline-start" /> 计算本月提成
            </Button>
          </div>
        </section>

        {usingDemo && (
          <Alert className="demo-alert mb-4">
            <AlertTriangle />
            <AlertDescription>
              当前展示 3
              笔演示记录。保存第一份真实合同后，演示数据会自动退出计算。
            </AlertDescription>
            <Button size="sm" onClick={() => setImportOpen(true)}>
              导入签单表
            </Button>
          </Alert>
        )}
        {loadError && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle />
            <AlertDescription>{loadError}</AlertDescription>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void loadContracts()}
            >
              <RefreshCw data-icon="inline-start" /> 重试
            </Button>
          </Alert>
        )}

        <section className="workspace-grid" aria-label="提成计算工作区">
          <div className="space-y-4">
            <Card className="workspace-card min-w-0 gap-0 py-0">
              <CardHeader className="border-b border-border px-5 py-4 sm:px-6">
                <CardTitle className="text-lg">本月到账明细</CardTitle>
                <CardDescription>
                  {activeSalesperson || '暂无销售人员'} ·{' '}
                  {settlementMonth || '未选择月份'} ·{' '}
                  {calculation.results.length} 笔触发记录
                </CardDescription>
                <CardAction className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    className="h-9"
                    onClick={() => setManagerOpen(true)}
                  >
                    <Database data-icon="inline-start" /> 数据管理
                  </Button>
                  <Button
                    variant="outline"
                    className="h-9"
                    onClick={() => setImportOpen(true)}
                  >
                    <Upload data-icon="inline-start" /> 导入 Excel
                  </Button>
                  <Button
                    variant="outline"
                    className="h-9"
                    onClick={openNewContract}
                  >
                    <FilePlus2 data-icon="inline-start" /> 手动录入
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="empty-state">
                    <LoaderCircle className="size-5 animate-spin" />{' '}
                    正在读取合同台账…
                  </div>
                ) : calculation.results.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[940px] border-collapse text-left">
                      <thead>
                        <tr className="table-head">
                          <th>客户 / 合同</th>
                          <th>计提基数</th>
                          <th>销售应得预览</th>
                          <th>计算结果</th>
                          <th>财务计提状态</th>
                          <th aria-label="查看计算详情" />
                        </tr>
                      </thead>
                      <tbody>
                        {calculation.results.map((result) => {
                          const accrual = accrualByRecordId.get(
                            result.record_id,
                          );
                          const canAccrue =
                            !usingDemo &&
                            result.status === 'normal' &&
                            (result.gross_commission_preview ?? 0) > 0;
                          return (
                            <tr
                              className={`table-row ${selectedResult?.record_id === result.record_id ? 'is-selected' : ''}`}
                              key={result.record_id}
                            >
                              <td>
                                <strong>{result.customer_name}</strong>
                                <span>
                                  {result.contract_name ?? result.contract_id} ·{' '}
                                  {result.contract_id}
                                </span>
                              </td>
                              <td className="numeric-cell">
                                {formatCurrency(result.commission_basis)}
                              </td>
                              <td className="numeric-cell">
                                {formatCurrency(result.sales_payable_preview)}
                              </td>
                              <td>
                                <span
                                  className={`status-pill status-${result.status}`}
                                >
                                  {STATUS_LABELS[result.status]}
                                </span>
                              </td>
                              <td className="min-w-[158px]">
                                {accrual ? (
                                  <div className="accrual-state">
                                    <span className="accrual-pill is-accrued">
                                      <CircleCheckBig /> 已计提
                                    </span>
                                    <small>
                                      {formatAccruedAt(accrual.accrued_at)}
                                    </small>
                                  </div>
                                ) : canAccrue ? (
                                  <Button
                                    size="sm"
                                    type="button"
                                    variant="outline"
                                    onClick={() => requestAccrual(result)}
                                  >
                                    <CircleCheckBig data-icon="inline-start" />
                                    标记已计提
                                  </Button>
                                ) : (
                                  <div className="accrual-state">
                                    <span className="accrual-pill">
                                      <Clock3 /> 未计提
                                    </span>
                                    <small>
                                      {usingDemo
                                        ? '演示记录'
                                        : '需先达到可计发'}
                                    </small>
                                  </div>
                                )}
                              </td>
                              <td>
                                <Button
                                  aria-label={`查看 ${result.contract_name ?? result.contract_id} 计算详情`}
                                  variant="ghost"
                                  size="icon"
                                  onClick={() =>
                                    setSelectedResultId(result.record_id)
                                  }
                                >
                                  <ChevronRight />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-state">
                    <CalendarDays className="size-5" />
                    当前销售在该月份没有已到账的计提记录。
                  </div>
                )}
                <div
                  className={`evidence-note ${issueCount ? 'has-issue' : ''}`}
                >
                  {issueCount ? (
                    <AlertTriangle className="size-4" />
                  ) : (
                    <BadgeCheck className="size-4" />
                  )}
                  <p>
                    {issueCount
                      ? `有 ${issueCount} 笔记录需要补充信息或人工定案。点击记录可查看原因并修正输入。`
                      : '当前记录的计算信息完整；主管池金额已单独列示。'}
                  </p>
                </div>
              </CardContent>
            </Card>

            {selectedResult && (
              <Card className="calculation-detail gap-0 py-0">
                <CardHeader className="border-b border-border px-5 py-4 sm:px-6">
                  <CardTitle>计算过程</CardTitle>
                  <CardDescription>
                    {selectedResult.customer_name} ·{' '}
                    {BUSINESS_TYPE_LABELS[selectedResult.business_type]}
                  </CardDescription>
                  <CardAction className="flex items-center gap-2">
                    {editableSelectedContract && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={openContractForCorrection}
                      >
                        <PencilLine data-icon="inline-start" /> 修正输入
                      </Button>
                    )}
                    <span
                      className={`status-pill status-${selectedResult.status}`}
                    >
                      {STATUS_LABELS[selectedResult.status]}
                    </span>
                  </CardAction>
                </CardHeader>
                <CardContent className="detail-grid px-5 py-5 sm:px-6">
                  <Detail
                    label="计提基数"
                    value={formatCurrency(selectedResult.commission_basis)}
                  />
                  <Detail
                    label={
                      selectedResult.business_type === 'enterprise'
                        ? '累计分段'
                        : '适用比例'
                    }
                    value={
                      selectedResult.business_type === 'enterprise'
                        ? (selectedResult.tier_or_segment ?? '—')
                        : formatPercent(selectedResult.rate)
                    }
                  />
                  <Detail
                    label="时效系数"
                    value={selectedResult.time_coefficient ?? '分期分别计算'}
                  />
                  <Detail
                    label="特殊系数"
                    value={selectedResult.special_coefficient ?? '—'}
                  />
                  <Detail
                    label="提成总额预览"
                    value={formatCurrency(
                      selectedResult.gross_commission_preview,
                    )}
                  />
                  <Detail
                    label="销售本人预览"
                    value={formatCurrency(selectedResult.sales_payable_preview)}
                  />
                  <Detail
                    label="财务计提状态"
                    value={
                      selectedAccrual ? (
                        <span className="accrual-pill is-accrued">
                          <CircleCheckBig /> 已计提
                        </span>
                      ) : (
                        <span className="accrual-pill">
                          <Clock3 /> 未计提
                        </span>
                      )
                    }
                  />
                  <Detail
                    label="已计提时间"
                    value={
                      selectedAccrual
                        ? formatAccruedAt(selectedAccrual.accrued_at)
                        : '—'
                    }
                  />
                  {selectedResult.issues.length > 0 && (
                    <div className="detail-issues">
                      <strong>请补充或核对</strong>
                      <ul>
                        {selectedResult.issues.map((issue) => (
                          <li key={issue}>{humanizeIssue(issue)}</li>
                        ))}
                      </ul>
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
                <CardTitle className="text-xl text-white">
                  销售本人可计发
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 py-6">
                <p className="amount-display">
                  <span>¥</span>
                  {formatCurrency(
                    calculation.summary.normal_sales_payable,
                  ).replace('¥', '')}
                </p>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <div className="result-metric">
                    <span>规则校验完整的提成总额</span>
                    <strong>
                      {formatCurrency(
                        calculation.summary.normal_gross_commission,
                      )}
                    </strong>
                  </div>
                  <div className="result-metric">
                    <span>主管池</span>
                    <strong>
                      {formatCurrency(
                        calculation.summary.normal_supervisor_pool,
                      )}
                    </strong>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="review-grid">
              <div>
                <span>信息待补全预览</span>
                <strong>{formatCurrency(incompletePreview)}</strong>
              </div>
              <div>
                <span>需调整或人工定案</span>
                <strong>{manualCount} 笔</strong>
              </div>
            </div>

            <Card className="gap-0 py-0">
              <CardHeader className="border-b border-border px-5 py-4">
                <CardTitle>给销售的结算说明</CardTitle>
                <CardDescription>自动生成，可直接复制发送</CardDescription>
                <CardAction>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void copyExplanation()}
                  >
                    {copied ? (
                      <Check data-icon="inline-start" />
                    ) : (
                      <Clipboard data-icon="inline-start" />
                    )}
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
        initialContract={editingContract}
        open={dialogOpen}
        onOpenChange={setContractDialogOpen}
        onSaved={loadContracts}
      />
      <ContractsManagerDialog
        accruals={accruals}
        contracts={contracts}
        open={managerOpen}
        onOpenChange={setManagerOpen}
        onEdit={openManagedContractForEditing}
        onChanged={loadContracts}
      />
      <ImportContractsDialog
        existingContractNumbers={contracts.map(
          (contract) => contract.contract_number,
        )}
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={loadContracts}
      />
      <AlertDialog
        open={Boolean(pendingAccrual)}
        onOpenChange={(open) => {
          if (!open && !isAccruing) {
            setPendingAccrual(null);
            setAccrualError('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-primary/10 text-primary">
              <CircleCheckBig />
            </AlertDialogMedia>
            <AlertDialogTitle>确认标记为已计提？</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAccrual
                ? `${pendingAccrual.customer_name}《${pendingAccrual.contract_name ?? pendingAccrual.contract_id}》本笔提成总额为 ${formatCurrency(pendingAccrual.gross_commission_preview)}。确认后将保留首次计提时间。`
                : '确认后将保留首次计提时间。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {accrualError && (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertDescription>{accrualError}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isAccruing}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={isAccruing}
              onClick={() => void markAccrued()}
            >
              {isAccruing ? (
                <LoaderCircle
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <CircleCheckBig data-icon="inline-start" />
              )}
              {isAccruing ? '正在保存…' : '确认已计提'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function commissionBelongsToContract(
  recordId: string,
  contract: StoredContract,
) {
  return (
    recordId === unifiedCommissionRecordId(contract.id) ||
    contract.installments.some(
      (installment) =>
        recordId ===
        installmentCommissionRecordId(contract.id, installment.installment_no),
    )
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
