'use client';

import { AlertCircle, CheckCircle2, FileSpreadsheet, LoaderCircle, Upload } from 'lucide-react';
import readExcelFile from 'read-excel-file/browser';
import { useMemo, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { readApiResponse } from '@/lib/api-response';
import {
  importSummaryLabel,
  parseSalesWorkbook,
  type WorkbookImportResult,
  type WorkbookSheetData,
} from '@/lib/workbook-import';

interface ImportContractsDialogProps {
  existingContractNumbers: string[];
  onImported: () => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function ImportContractsDialog({
  existingContractNumbers,
  onImported,
  onOpenChange,
  open,
}: ImportContractsDialogProps) {
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<WorkbookImportResult | null>(null);
  const [error, setError] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [completed, setCompleted] = useState<{ created: string[]; skipped: string[] } | null>(null);
  const existing = useMemo(() => new Set(existingContractNumbers), [existingContractNumbers]);
  const readyItems = useMemo(
    () => parsed?.contracts.filter((item) => item.errors.length === 0 && !existing.has(item.contract.contract_number)) ?? [],
    [existing, parsed],
  );

  const close = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setFileName('');
      setParsed(null);
      setError('');
      setCompleted(null);
    }
  };

  const selectFile = async (file?: File) => {
    if (!file) return;
    setError('');
    setParsed(null);
    setCompleted(null);
    setFileName(file.name);
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setError('请上传 .xlsx 格式的 Excel 文件');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError('文件超过 15 MB，请拆分后再导入');
      return;
    }
    setIsParsing(true);
    try {
      const sheets = await readExcelFile(file);
      setParsed(parseSalesWorkbook(sheets as WorkbookSheetData[]));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Excel 解析失败，请核对文件格式');
    } finally {
      setIsParsing(false);
    }
  };

  const importContracts = async () => {
    if (!readyItems.length) return;
    setIsImporting(true);
    setError('');
    try {
      const response = await fetch('/api/contracts/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contracts: readyItems.map((item) => item.contract) }),
      });
      const body = await readApiResponse<{ created?: string[]; skipped?: string[] }>(
        response,
        '批量导入失败，请稍后重试',
      );
      setCompleted({ created: body.created ?? [], skipped: body.skipped ?? [] });
      await onImported();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '批量导入失败，请稍后重试');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] max-w-[920px] gap-0 overflow-hidden p-0 sm:max-h-[90dvh]">
        <DialogHeader className="border-b border-border px-4 py-4 pr-14 sm:px-6 sm:py-5">
          <DialogTitle className="text-xl">导入签单表</DialogTitle>
          <DialogDescription>
            支持 .xlsx。文件只在当前浏览器中解析，确认后仅保存合同与分期字段。
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[calc(100dvh-9rem)] overflow-y-auto px-4 py-4 sm:max-h-[calc(90dvh-9rem)] sm:px-6 sm:py-5">
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {completed ? (
            <div className="import-complete">
              <CheckCircle2 />
              <div>
                <strong>导入完成</strong>
                <p>新增 {completed.created.length} 份合同，跳过 {completed.skipped.length} 份已存在合同。</p>
              </div>
            </div>
          ) : (
            <>
              <label className="import-dropzone">
                {isParsing ? <LoaderCircle className="animate-spin" /> : <FileSpreadsheet />}
                <strong>{isParsing ? '正在解析签单表…' : fileName || '选择 Excel 签单表'}</strong>
                <span>系统会自动识别表头，并按合同号合并多行分期。</span>
                <input
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  disabled={isParsing}
                  type="file"
                  onChange={(event) => void selectFile(event.target.files?.[0])}
                />
              </label>

              {parsed && (
                <section className="mt-5" aria-label="Excel 解析预览">
                  <div className="import-summary">
                    <div>
                      <span>识别工作表</span>
                      <strong>{parsed.sheet_name}</strong>
                    </div>
                    <div>
                      <span>合同</span>
                      <strong>{parsed.contracts.length} 份</strong>
                    </div>
                    <div>
                      <span>可导入</span>
                      <strong>{readyItems.length} 份</strong>
                    </div>
                    <p>提成点数、历史提成金额和“是否发放”不会改写当前计算规则。</p>
                  </div>

                  <div className="import-list">
                    {parsed.contracts.map((item) => {
                      const duplicate = existing.has(item.contract.contract_number);
                      const messages = duplicate
                        ? ['合同编号已存在，本次将跳过']
                        : item.errors.length
                          ? item.errors
                          : item.warnings;
                      return (
                        <article className="import-row" key={`${item.contract.contract_number}-${item.source_rows.join('-')}`}>
                          <div className="min-w-0">
                            <strong>{item.contract.customer_name || '未识别客户'}</strong>
                            <span>{item.contract.contract_number || '缺少合同号'} · {item.contract.salesperson || '缺少签单人'}</span>
                          </div>
                          <div>
                            <strong>{importSummaryLabel(item)}</strong>
                            <span>{item.contract.installments.length} 期 · 源表第 {item.source_rows.join('、')} 行</span>
                          </div>
                          <div className={`import-status ${duplicate || item.errors.length ? 'is-blocked' : item.warnings.length ? 'has-warning' : ''}`}>
                            <strong>{duplicate ? '已存在' : item.errors.length ? '无法导入' : item.warnings.length ? '导入后待补全' : '字段完整'}</strong>
                            {messages.length > 0 && (
                              <span>{messages.slice(0, 2).join('；')}{messages.length > 2 ? `；另有 ${messages.length - 2} 项` : ''}</span>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        <DialogFooter className="m-0 px-4 py-4 sm:px-6">
          {completed ? (
            <Button onClick={() => close(false)}>完成</Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => close(false)}>取消</Button>
              <Button disabled={!readyItems.length || isParsing || isImporting} onClick={() => void importContracts()}>
                {isImporting ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <Upload data-icon="inline-start" />}
                {isImporting ? '正在导入…' : `确认导入 ${readyItems.length} 份合同`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
