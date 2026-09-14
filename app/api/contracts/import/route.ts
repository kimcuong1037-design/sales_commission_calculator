import { createContracts } from '@/db/storage';
import {
  apiRequestErrorResponse,
  readJsonRequest,
} from '@/lib/api-request';
import { contractSchema } from '@/lib/contracts';
import { requireAuthenticatedSiteUser } from '@/lib/site-auth';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const importSchema = z.object({
  contracts: z.array(contractSchema).min(1, '没有可导入的合同').max(100, '单次最多导入 100 份合同'),
});

export async function POST(request: Request) {
  const unauthorized = requireAuthenticatedSiteUser(request);
  if (unauthorized) return unauthorized;
  try {
    const parsed = importSchema.safeParse(await readJsonRequest(request));
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? '导入数据不完整' },
        { status: 400 },
      );
    }
    const result = await createContracts(parsed.data.contracts);
    return Response.json(result, { status: 201 });
  } catch (error) {
    console.error('Failed to import contracts', error);
    const requestError = apiRequestErrorResponse(error);
    if (requestError) return requestError;
    return Response.json({ error: '批量导入失败，请稍后重试' }, { status: 500 });
  }
}
