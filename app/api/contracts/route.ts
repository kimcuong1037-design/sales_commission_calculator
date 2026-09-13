import { createContract, listContracts } from '@/db/storage';
import { contractSchema } from '@/lib/contracts';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json({ contracts: await listContracts() });
  } catch (error) {
    console.error('Failed to list contracts', error);
    return Response.json({ error: '暂时无法读取合同台账' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const parsed = contractSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? '合同信息不完整' },
        { status: 400 },
      );
    }
    const id = await createContract(parsed.data);
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    console.error('Failed to create contract', error);
    const message = error instanceof Error && error.message.includes('UNIQUE')
      ? '合同编号已存在，请核对后重试'
      : '合同保存失败，请稍后重试';
    return Response.json({ error: message }, { status: message.includes('已存在') ? 409 : 500 });
  }
}
