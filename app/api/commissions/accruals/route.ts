import { listCommissionAccruals, markCommissionAccrued } from '@/db/storage';
import { commissionAccrualInputSchema } from '@/lib/commission-accruals';

export const dynamic = 'force-dynamic';

export async function GET() {
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
  try {
    const parsed = commissionAccrualInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? '计提信息不完整' },
        { status: 400 },
      );
    }
    const accrual = await markCommissionAccrued(parsed.data);
    return Response.json({ accrual });
  } catch (error) {
    console.error('Failed to mark commission accrued', error);
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return Response.json(
        { error: '没有找到对应的合同或分期记录，请刷新后重试' },
        { status: 404 },
      );
    }
    if (error instanceof Error && error.message === 'INVALID_RECORD') {
      return Response.json({ error: '提成记录编号无效' }, { status: 400 });
    }
    return Response.json(
      { error: '计提状态保存失败，请稍后重试' },
      { status: 500 },
    );
  }
}
