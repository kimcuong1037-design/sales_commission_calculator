import {
  listCommissionAccruals,
  listContracts,
  markCommissionAccrued,
} from '@/db/storage';
import {
  apiRequestErrorResponse,
  readJsonRequest,
} from '@/lib/api-request';
import { resolveCommissionAccrual } from '@/lib/commission-accrual-resolution';
import { commissionAccrualRequestSchema } from '@/lib/commission-accruals';
import { requireAuthenticatedSiteUser } from '@/lib/site-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const unauthorized = requireAuthenticatedSiteUser(request);
  if (unauthorized) return unauthorized;
  try {
    return Response.json({ accruals: await listCommissionAccruals() });
  } catch (error) {
    console.error('Failed to list commission accruals', error);
    return Response.json(
      { error: '暂时无法读取财务计提状态' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const unauthorized = requireAuthenticatedSiteUser(request);
  if (unauthorized) return unauthorized;
  try {
    const parsed = commissionAccrualRequestSchema.safeParse(
      await readJsonRequest(request),
    );
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? '计提信息不完整' },
        { status: 400 },
      );
    }
    const authoritativeInput = resolveCommissionAccrual(
      await listContracts(),
      parsed.data,
    );
    const accrual = await markCommissionAccrued(authoritativeInput);
    return Response.json({ accrual });
  } catch (error) {
    console.error('Failed to mark commission accrued', error);
    const requestError = apiRequestErrorResponse(error);
    if (requestError) return requestError;
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return Response.json(
        { error: '没有找到对应的合同或分期记录，请刷新后重试' },
        { status: 404 },
      );
    }
    if (error instanceof Error && error.message === 'INVALID_RECORD') {
      return Response.json({ error: '提成记录编号无效' }, { status: 400 });
    }
    if (error instanceof Error && error.message === 'STALE_RECORD') {
      return Response.json(
        { error: '该记录与当前月份或合同数据不一致，请刷新后重试' },
        { status: 409 },
      );
    }
    if (error instanceof Error && error.message === 'NOT_ACCRUABLE') {
      return Response.json(
        { error: '该记录尚未达到可计发状态，不能标记为已计提' },
        { status: 409 },
      );
    }
    return Response.json(
      { error: '计提状态保存失败，请稍后重试' },
      { status: 500 },
    );
  }
}
