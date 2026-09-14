import { deleteContract, updateContract } from '@/db/storage';
import {
  apiRequestErrorResponse,
  readJsonRequest,
} from '@/lib/api-request';
import { contractSchema } from '@/lib/contracts';
import { requireAuthenticatedSiteUser } from '@/lib/site-auth';

export async function handleUpdateContract(request: Request) {
  const unauthorized = requireAuthenticatedSiteUser(request);
  if (unauthorized) return unauthorized;
  try {
    const payload = (await readJsonRequest(request)) as { id?: unknown };
    if (typeof payload.id !== 'string' || !payload.id) {
      return Response.json({ error: '缺少要修正的合同编号' }, { status: 400 });
    }
    const parsed = contractSchema.safeParse(payload);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? '合同信息不完整' },
        { status: 400 },
      );
    }
    await updateContract(payload.id, parsed.data);
    return Response.json({ id: payload.id });
  } catch (error) {
    console.error('Failed to update contract', error);
    const requestError = apiRequestErrorResponse(error);
    if (requestError) return requestError;
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return Response.json(
        { error: '没有找到这份合同，请刷新后重试' },
        { status: 404 },
      );
    }
    if (
      error instanceof Error &&
      error.message.includes('ACCRUED_CONTRACT')
    ) {
      return Response.json(
        { error: '该合同已有已计提记录。为保留财务历史，不能直接修改。' },
        { status: 409 },
      );
    }
    const message =
      error instanceof Error && error.message.includes('UNIQUE')
        ? '合同编号已存在，请核对后重试'
        : '合同保存失败，请稍后重试';
    return Response.json(
      { error: message },
      { status: message.includes('已存在') ? 409 : 500 },
    );
  }
}

export async function handleDeleteContract(request: Request) {
  const unauthorized = requireAuthenticatedSiteUser(request);
  if (unauthorized) return unauthorized;
  try {
    const payload = (await readJsonRequest(request)) as { id?: unknown };
    if (typeof payload.id !== 'string' || !payload.id) {
      return Response.json({ error: '缺少要删除的合同编号' }, { status: 400 });
    }
    await deleteContract(payload.id);
    return Response.json({ id: payload.id });
  } catch (error) {
    console.error('Failed to delete contract', error);
    const requestError = apiRequestErrorResponse(error);
    if (requestError) return requestError;
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return Response.json(
        { error: '没有找到这份合同，可能已被删除' },
        { status: 404 },
      );
    }
    if (
      error instanceof Error &&
      error.message.includes('ACCRUED_CONTRACT')
    ) {
      return Response.json(
        { error: '该合同已有已计提记录。为保留财务历史，不能删除。' },
        { status: 409 },
      );
    }
    return Response.json(
      { error: '合同删除失败，请稍后重试' },
      { status: 500 },
    );
  }
}
