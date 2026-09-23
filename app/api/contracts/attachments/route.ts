import {
  listContractAttachments,
  uploadContractAttachment,
} from '@/db/attachments';
import {
  AttachmentError,
  readAttachmentForm,
} from '@/lib/contract-attachments';
import { requireAuthenticatedSiteUser } from '@/lib/site-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const unauthorized = requireAuthenticatedSiteUser(request);
  if (unauthorized) return unauthorized;
  try {
    const contractId =
      new URL(request.url).searchParams.get('contract_id') ?? '';
    return Response.json(
      { attachments: await listContractAttachments(contractId) },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    return attachmentErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: '请在本站页面上传附件' }, { status: 403 });
  }
  const unauthorized = requireAuthenticatedSiteUser(request);
  if (unauthorized) return unauthorized;
  try {
    const form = await readAttachmentForm(request);
    const contractId = form.get('contract_id');
    const files = form.getAll('file');
    if (
      typeof contractId !== 'string' ||
      files.length !== 1 ||
      !(files[0] instanceof File)
    ) {
      throw new AttachmentError('请选择一个文件并指定所属合同');
    }
    const attachment = await uploadContractAttachment(contractId, files[0]);
    return Response.json({ attachment }, { status: 201 });
  } catch (error) {
    return attachmentErrorResponse(error);
  }
}

function attachmentErrorResponse(error: unknown) {
  if (error instanceof AttachmentError)
    return Response.json({ error: error.message }, { status: error.status });
  console.error('Contract attachment request failed', error);
  return Response.json({ error: '附件操作失败，请稍后重试' }, { status: 500 });
}
