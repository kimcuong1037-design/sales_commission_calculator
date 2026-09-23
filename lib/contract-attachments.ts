export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png';

export interface ContractAttachment {
  id: string;
  contract_id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
}

export class AttachmentError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function validateAttachmentFile(file: Pick<File, 'name' | 'size'>) {
  if (file.size <= 0) throw new AttachmentError('不能上传空文件');
  if (file.size > MAX_ATTACHMENT_BYTES)
    throw new AttachmentError('单个附件不能超过 10 MB', 413);
  const name =
    file.name
      .split(/[\\/]/)
      .at(-1)
      ?.split('')
      .filter(
        (character) =>
          character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
      )
      .join('')
      .trim() ?? '';
  if (!name || name.length > 200)
    throw new AttachmentError('文件名不能为空或超过 200 个字符');
  const extension = name.split('.').at(-1)?.toLowerCase();
  const types: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
  };
  const contentType = types[extension ?? ''];
  if (!contentType) throw new AttachmentError('只支持 PDF、JPG 和 PNG 文件');
  return { name, contentType };
}

export function validateAttachmentSignature(
  bytes: Uint8Array,
  contentType: string,
) {
  const signatures: Record<string, number[]> = {
    'application/pdf': [0x25, 0x50, 0x44, 0x46, 0x2d],
    'image/jpeg': [0xff, 0xd8, 0xff],
    'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  };
  const signature = signatures[contentType];
  if (!signature || !signature.every((byte, index) => bytes[index] === byte)) {
    throw new AttachmentError('文件内容与扩展名不符，请上传有效的 PDF 或图片');
  }
}

export async function readAttachmentForm(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data;')) {
    throw new AttachmentError('请使用文件上传表单', 415);
  }
  const limit = MAX_ATTACHMENT_BYTES + 64 * 1024;
  if (Number(request.headers.get('content-length') ?? 0) > limit) {
    throw new AttachmentError('单个附件不能超过 10 MB', 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new AttachmentError('请选择要上传的文件');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new AttachmentError('单个附件不能超过 10 MB', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return await new Response(body, {
      headers: { 'content-type': contentType },
    }).formData();
  } catch {
    throw new AttachmentError('上传内容无法读取，请重新选择文件');
  }
}

export function attachmentResponseHeaders(
  attachment: ContractAttachment,
  download: boolean,
) {
  return {
    'content-type': attachment.content_type,
    'content-length': String(attachment.size_bytes),
    'content-disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(attachment.file_name).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)}`,
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "sandbox; default-src 'none'",
  };
}
