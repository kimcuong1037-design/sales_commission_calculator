'use client';

import {
  AlertTriangle,
  CircleCheckBig,
  Clock3,
  Database,
  LoaderCircle,
  PencilLine,
  Paperclip,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { ContractAttachments } from '@/app/contract-attachments';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { readApiResponse } from '@/lib/api-response';
import {
  formatAccruedAt,
  type CommissionAccrual,
} from '@/lib/commission-accruals';
import {
  BUSINESS_TYPE_LABELS,
  formatCurrency,
  type StoredContract,
} from '@/lib/contracts';

interface ContractsManagerDialogProps {
  accruals: CommissionAccrual[];
  contracts: StoredContract[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (contract: StoredContract) => void;
  onChanged: () => Promise<void> | void;
}

export function ContractsManagerDialog({
  accruals,
  contracts,
  open,
  onOpenChange,
  onEdit,
  onChanged,
}: ContractsManagerDialogProps) {
  const [query, setQuery] = useState('');
  const [attachmentContract, setAttachmentContract] =
    useState<StoredContract | null>(null);
  const [contractToDelete, setContractToDelete] =
    useState<StoredContract | null>(null);
  const [deletingId, setDeletingId] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
  const visibleContracts = useMemo(() => {
    if (!normalizedQuery) return contracts;
    return contracts.filter(
      (contract) =>
        contract.contract_number.trim().toLocaleLowerCase('zh-CN') ===
          normalizedQuery ||
        contract.customer_name.trim().toLocaleLowerCase('zh-CN') ===
          normalizedQuery,
    );
  }, [contracts, normalizedQuery]);
  const accrualsByContract = useMemo(() => {
    const grouped = new Map<string, CommissionAccrual[]>();
    for (const accrual of accruals) {
      const contractAccruals = grouped.get(accrual.contract_id) ?? [];
      contractAccruals.push(accrual);
      grouped.set(accrual.contract_id, contractAccruals);
    }
    for (const contractAccruals of grouped.values()) {
      contractAccruals.sort((left, right) =>
        right.accrued_at.localeCompare(left.accrued_at),
      );
    }
    return grouped;
  }, [accruals]);

  const setOpen = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setQuery('');
      setAttachmentContract(null);
      setDeleteError('');
      setContractToDelete(null);
    }
  };

  const editContract = (contract: StoredContract) => {
    setOpen(false);
    onEdit(contract);
  };

  const deleteContract = async () => {
    if (!contractToDelete) return;
    setDeletingId(contractToDelete.id);
    setDeleteError('');
    try {
      const response = await fetch('/api/contracts/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: contractToDelete.id }),
      });
      await readApiResponse<{ id: string }>(
        response,
        '合同删除失败，请稍后重试',
      );
      setContractToDelete(null);
      await onChanged();
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : '合同删除失败，请稍后重试',
      );
      setContractToDelete(null);
    } finally {
      setDeletingId('');
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] max-w-[1120px] gap-0 overflow-hidden p-0 sm:max-h-[92dvh]">
          <DialogHeader className="border-b border-border px-4 py-4 pr-14 sm:px-6 sm:py-5">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Database className="size-5 text-primary" /> 合同数据管理
            </DialogTitle>
            <DialogDescription>
              查看全部已保存合同及佣金计提情况。计提后仍可追加分期、编辑未计提分期。已有计提记录的合同不能删除。
            </DialogDescription>
          </DialogHeader>

          <div className="border-b border-border bg-muted/25 px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="按完整合同编号或客户名称筛选"
                  className="h-10 bg-card pl-9 pr-10"
                  placeholder="输入完整合同编号或客户名称"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query && (
                  <Button
                    aria-label="清除筛选"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2"
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                    onClick={() => setQuery('')}
                  >
                    <X />
                  </Button>
                )}
              </div>
              <p className="shrink-0 text-xs text-muted-foreground">
                {normalizedQuery
                  ? `精确匹配 ${visibleContracts.length} 份`
                  : `共 ${contracts.length} 份合同`}
              </p>
            </div>
          </div>

          <div className="min-h-64 flex-1 overflow-y-auto">
            {deleteError && (
              <Alert className="m-4" variant="destructive">
                <AlertTriangle />
                <AlertDescription>{deleteError}</AlertDescription>
              </Alert>
            )}

            {visibleContracts.length ? (
              <Table className="min-w-[1120px]">
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead className="pl-6">客户 / 合同</TableHead>
                    <TableHead>销售人员</TableHead>
                    <TableHead>业务类型</TableHead>
                    <TableHead className="text-right">合同金额</TableHead>
                    <TableHead className="text-center">分期</TableHead>
                    <TableHead>财务计提</TableHead>
                    <TableHead className="pr-6 text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleContracts.map((contract) => {
                    const contractAccruals =
                      accrualsByContract.get(contract.id) ?? [];
                    const latestAccrual = contractAccruals[0];

                    return (
                      <TableRow key={contract.id}>
                        <TableCell className="max-w-[360px] pl-6 whitespace-normal">
                          <strong className="block font-semibold">
                            {contract.customer_name}
                          </strong>
                          <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                            {contract.contract_name} ·{' '}
                            {contract.contract_number}
                          </span>
                        </TableCell>
                        <TableCell>{contract.salesperson}</TableCell>
                        <TableCell>
                          {BUSINESS_TYPE_LABELS[contract.business_type]}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatCurrency(contract.annual_contract_amount)}
                        </TableCell>
                        <TableCell className="text-center">
                          {contract.installments.length} 期
                        </TableCell>
                        <TableCell className="min-w-[180px]">
                          {latestAccrual ? (
                            <div className="accrual-state">
                              <span className="accrual-pill is-accrued">
                                <CircleCheckBig /> 已计提{' '}
                                {contractAccruals.length} 笔
                              </span>
                              <small>
                                最近 {formatAccruedAt(latestAccrual.accrued_at)}
                              </small>
                            </div>
                          ) : (
                            <span className="accrual-pill">
                              <Clock3 /> 尚未计提
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="pr-6">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              type="button"
                              variant="outline"
                              onClick={() => setAttachmentContract(contract)}
                            >
                              <Paperclip data-icon="inline-start" /> 合同附件
                            </Button>
                            <Button
                              size="sm"
                              type="button"
                              variant="outline"
                              onClick={() => editContract(contract)}
                            >
                              <PencilLine data-icon="inline-start" /> 编辑
                            </Button>
                            <Button
                              disabled={
                                deletingId === contract.id ||
                                contractAccruals.length > 0
                              }
                              title={
                                contractAccruals.length
                                  ? '已有计提记录，不能删除'
                                  : undefined
                              }
                              size="sm"
                              type="button"
                              variant="destructive"
                              onClick={() => setContractToDelete(contract)}
                            >
                              {deletingId === contract.id ? (
                                <LoaderCircle
                                  className="animate-spin"
                                  data-icon="inline-start"
                                />
                              ) : (
                                <Trash2 data-icon="inline-start" />
                              )}
                              删除
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="grid min-h-64 place-items-center px-6 text-center">
                <div>
                  <Database className="mx-auto mb-3 size-6 text-muted-foreground" />
                  <p className="font-medium">
                    {contracts.length
                      ? '没有精确匹配的合同'
                      : '当前还没有已保存合同'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {contracts.length
                      ? '请输入完整合同编号或完整客户名称。'
                      : '导入 Excel 或手动录入后会显示在这里。'}
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="m-0 px-4 py-4 sm:px-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(attachmentContract)}
        onOpenChange={(nextOpen) => !nextOpen && setAttachmentContract(null)}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>合同附件</DialogTitle>
            <DialogDescription>
              {attachmentContract?.customer_name} ·{' '}
              {attachmentContract?.contract_number}
            </DialogDescription>
          </DialogHeader>
          {attachmentContract && (
            <ContractAttachments
              key={attachmentContract.id}
              contractId={attachmentContract.id}
            />
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAttachmentContract(null)}
            >
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(contractToDelete)}
        onOpenChange={(nextOpen) => !nextOpen && setContractToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive">
              <Trash2 />
            </AlertDialogMedia>
            <AlertDialogTitle>确认删除这份合同？</AlertDialogTitle>
            <AlertDialogDescription>
              {contractToDelete
                ? `${contractToDelete.customer_name} · ${contractToDelete.contract_number}，以及其 ${contractToDelete.installments.length} 期回款记录及合同附件将被永久删除。`
                : '合同及其分期回款记录及合同附件将被永久删除。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingId)}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={Boolean(deletingId)}
              variant="destructive"
              onClick={() => void deleteContract()}
            >
              {deletingId ? (
                <LoaderCircle
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <Trash2 data-icon="inline-start" />
              )}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
