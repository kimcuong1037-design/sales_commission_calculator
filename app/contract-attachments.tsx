'use client';

import {
  AlertCircle,
  FileText,
  LoaderCircle,
  Paperclip,
  Upload,
} from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { readApiResponse } from '@/lib/api-response';
import {
  ATTACHMENT_ACCEPT,
  validateAttachmentFile,
  type ContractAttachment,
} from '@/lib/contract-attachments';

export function ContractAttachments({ contractId }: { contractId?: string }) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<ContractAttachment[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(Boolean(contractId));
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!contractId) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(
          `/api/contracts/attachments?contract_id=${encodeURIComponent(contractId!)}`,
          { cache: 'no-store', signal: controller.signal },
        );
        const body = await readApiResponse<{
          attachments: ContractAttachment[];
        }>(response, '附件列表读取失败');
        if (!controller.signal.aborted) setAttachments(body.attachments);
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : '附件列表读取失败');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [contractId, reload]);

  async function upload() {
    if (!contractId || !files.length || uploading) return;
    setError('');
    setMessage('');
    setUploading(true);
    const remaining = [...files];
    let uploaded = 0;
    try {
      for (const file of files) validateAttachmentFile(file);
      for (const file of files) {
        const form = new FormData();
        form.set('contract_id', contractId);
        form.set('file', file);
        const response = await fetch('/api/contracts/attachments', {
          method: 'POST',
          body: form,
        });
        const body = await readApiResponse<{ attachment: ContractAttachment }>(
          response,
          `${file.name} 上传失败`,
        );
        setAttachments((current) => [body.attachment, ...current]);
        remaining.shift();
        uploaded += 1;
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : '附件上传失败，请稍后重试',
      );
    } finally {
      setFiles(remaining);
      if (!remaining.length && input.current) input.current.value = '';
      if (uploaded)
        setMessage(
          `已上传 ${uploaded} 份附件${remaining.length ? `，还有 ${remaining.length} 份未上传` : ''}。`,
        );
      setUploading(false);
    }
  }

  return (
    <section className="space-y-4" aria-label="合同附件">
      <div>
        <h3 className="flex items-center gap-2 font-semibold">
          <Paperclip className="size-4" />
          合同附件
        </h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          同一合同的各期共用附件，可上传合同原件和补充协议。附件仅供核对，不会自动修改金额或提成结果。
        </p>
      </div>
      {!contractId ? (
        <p className="text-sm text-muted-foreground">
          请先保存合同，再从“合同附件”入口上传。
        </p>
      ) : (
        <>
          <div className="space-y-2 rounded-lg border border-dashed p-3">
            <label htmlFor={inputId} className="block text-sm font-medium">
              选择合同附件
            </label>
            <input
              ref={input}
              id={inputId}
              type="file"
              multiple
              accept={ATTACHMENT_ACCEPT}
              disabled={uploading || loading}
              className="block w-full min-w-0 text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm"
              onChange={(event) => {
                setFiles(Array.from(event.target.files ?? []));
                setError('');
                setMessage('');
              }}
            />
            <p className="text-xs text-muted-foreground">
              支持 PDF、JPG、PNG，单个文件不超过 10 MB，可选择多份。
            </p>
            <Button
              type="button"
              onClick={() => void upload()}
              disabled={!files.length || uploading || loading}
            >
              {uploading ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Upload />
              )}
              {uploading
                ? '正在上传…'
                : `上传附件${files.length ? `（${files.length}）` : ''}`}
            </Button>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {message && (
            <output className="block text-sm text-primary">{message}</output>
          )}
          {loading ? (
            <output className="block text-sm text-muted-foreground">
              正在读取附件…
            </output>
          ) : attachments.length ? (
            <ul className="divide-y rounded-lg border px-3">
              {attachments.map((attachment) => {
                const url = `/api/contracts/attachments/file?id=${encodeURIComponent(attachment.id)}`;
                return (
                  <li
                    key={attachment.id}
                    className="flex flex-wrap items-center gap-3 py-3"
                  >
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="break-all text-sm font-medium">
                        {attachment.file_name}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {(attachment.size_bytes / 1024).toFixed(1)} KB ·{' '}
                        {new Date(attachment.uploaded_at).toLocaleString(
                          'zh-CN',
                          { hour12: false },
                        )}
                      </p>
                    </div>
                    <a
                      className="text-sm text-primary underline underline-offset-4"
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`查看 ${attachment.file_name}`}
                    >
                      查看
                    </a>
                    <a
                      className="text-sm text-primary underline underline-offset-4"
                      href={`${url}&download=1`}
                      aria-label={`下载 ${attachment.file_name}`}
                    >
                      下载
                    </a>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">暂无合同附件。</p>
          )}
          {!loading && error && (
            <Button
              type="button"
              variant="outline"
              disabled={uploading}
              onClick={() => setReload((value) => value + 1)}
            >
              重新读取附件
            </Button>
          )}
        </>
      )}
    </section>
  );
}
