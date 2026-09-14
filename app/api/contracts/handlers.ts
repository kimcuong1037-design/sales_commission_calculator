import { deleteContract, updateContract } from '@/db/storage';
import { contractSchema } from '@/lib/contracts';

export async function handleUpdateContract(request: Request) {
  try {
    const payload = (await request.json()) as { id?: unknown };
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
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return Response.json(
        { error: '没有找到这份合同，请刷新后重试' },
        { status: 404 },
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
  try {
    const payload = (await request.json()) as { id?: unknown };
    if (typeof payload.id !== 'string' || !payload.id) {
      return Response.json({ error: '缺少要删除的合同编号' }, { status: 400 });
    }
    await deleteContract(payload.id);
    return Response.json({ id: payload.id });
  } catch (error) {
    console.error('Failed to delete contract', error);
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return Response.json(
        { error: '没有找到这份合同，可能已被删除' },
        { status: 404 },
      );
    }
    return Response.json(
      { error: '合同删除失败，请稍后重试' },
      { status: 500 },
    );
  }
}
