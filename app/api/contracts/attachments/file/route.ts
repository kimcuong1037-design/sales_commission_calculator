import { getContractAttachment } from '@/db/attachments';
import {
  AttachmentError,
  attachmentResponseHeaders,
} from '@/lib/contract-attachments';
import { requireAuthenticatedSiteUser } from '@/lib/site-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const unauthorized = requireAuthenticatedSiteUser(request);
  if (unauthorized) return unauthorized;
  try {
    const url = new URL(request.url);
    const { attachment, body } = await getContractAttachment(
      url.searchParams.get('id') ?? '',
    );
    return new Response(body, {
      headers: attachmentResponseHeaders(
        attachment,
        url.searchParams.get('download') === '1',
      ),
    });
  } catch (error) {
    if (error instanceof AttachmentError)
      return Response.json({ error: error.message }, { status: error.status });
    console.error('Failed to read attachment', error);
    return Response.json(
      { error: '附件读取失败，请稍后重试' },
      { status: 500 },
    );
  }
}
