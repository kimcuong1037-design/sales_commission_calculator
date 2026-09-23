import { env } from 'cloudflare:workers';
import { ensureDatabase } from '@/db/storage';
import {
  AttachmentError,
  validateAttachmentFile,
  validateAttachmentSignature,
  type ContractAttachment,
} from '@/lib/contract-attachments';

function bucket() {
  if (!env.CONTRACT_FILES)
    throw new AttachmentError('合同附件存储尚未配置，请联系管理员', 503);
  return env.CONTRACT_FILES;
}

async function requireContract(contractId: string) {
  await ensureDatabase();
  if (!contractId) throw new AttachmentError('缺少合同编号');
  const exists = await env.DB.prepare('SELECT id FROM contracts WHERE id = ?')
    .bind(contractId)
    .first();
  if (!exists) throw new AttachmentError('没有找到这份合同，请先保存合同', 404);
}

export async function listContractAttachments(
  contractId: string,
): Promise<ContractAttachment[]> {
  await requireContract(contractId);
  const query =
    await env.DB.prepare(`SELECT id, contract_id, file_name, content_type, size_bytes, uploaded_at
    FROM contract_attachments WHERE contract_id = ? ORDER BY uploaded_at DESC, id`)
      .bind(contractId)
      .all<ContractAttachment>();
  return query.results ?? [];
}

export async function uploadContractAttachment(
  contractId: string,
  file: File,
): Promise<ContractAttachment> {
  const { name, contentType } = validateAttachmentFile(file);
  await requireContract(contractId);
  const store = bucket();
  const bytes = await file.arrayBuffer();
  validateAttachmentSignature(new Uint8Array(bytes), contentType);
  const id = crypto.randomUUID();
  const objectKey = `contracts/${contractId}/${id}`;
  const attachment: ContractAttachment = {
    id,
    contract_id: contractId,
    file_name: name,
    content_type: contentType,
    size_bytes: bytes.byteLength,
    uploaded_at: new Date().toISOString(),
  };
  await store.put(objectKey, bytes, { httpMetadata: { contentType } });
  try {
    await env.DB.prepare(`INSERT INTO contract_attachments
      (id, contract_id, object_key, file_name, content_type, size_bytes, uploaded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        id,
        contractId,
        objectKey,
        name,
        contentType,
        bytes.byteLength,
        attachment.uploaded_at,
      )
      .run();
  } catch (error) {
    await store.delete(objectKey);
    throw error;
  }
  return attachment;
}

export async function getContractAttachment(id: string) {
  await ensureDatabase();
  if (!id) throw new AttachmentError('缺少附件编号');
  const attachment =
    await env.DB.prepare(`SELECT a.* FROM contract_attachments a
    JOIN contracts c ON c.id = a.contract_id WHERE a.id = ?`)
      .bind(id)
      .first<ContractAttachment & { object_key: string }>();
  if (!attachment) throw new AttachmentError('附件不存在', 404);
  const object = await bucket().get(attachment.object_key);
  if (!object)
    throw new AttachmentError('附件文件暂时无法读取，请联系管理员', 404);
  return { attachment, body: object.body };
}
