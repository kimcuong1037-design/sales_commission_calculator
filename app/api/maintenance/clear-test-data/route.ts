import { clearAllContracts } from '@/db/storage';

export const dynamic = 'force-dynamic';

const page = (body: string) => new Response(`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>清空测试数据</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 560px; margin: 80px auto; padding: 24px; color: #12221a; }
      button { padding: 12px 18px; border: 0; border-radius: 10px; background: #a33a2b; color: white; font-weight: 700; cursor: pointer; }
      p { line-height: 1.7; }
    </style>
  </head>
  <body>${body}</body>
</html>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });

function isAuthenticated(request: Request) {
  return Boolean(request.headers.get('oai-authenticated-user-id'));
}

export async function GET(request: Request) {
  if (!isAuthenticated(request)) return new Response('Unauthorized', { status: 401 });
  return page(`
    <h1>清空当前测试数据</h1>
    <p>将删除数据库中的全部合同及分期回款记录，数据库结构和计算规则不受影响。</p>
    <form method="post">
      <input type="hidden" name="confirmation" value="clear-current-test-data" />
      <button type="submit">确认清空 1 份合同与 1 条分期记录</button>
    </form>
  `);
}

export async function POST(request: Request) {
  if (!isAuthenticated(request)) return new Response('Unauthorized', { status: 401 });
  const form = await request.formData();
  if (form.get('confirmation') !== 'clear-current-test-data') {
    return new Response('Invalid confirmation', { status: 400 });
  }
  const deleted = await clearAllContracts();
  return page(`
    <h1>数据已清空</h1>
    <p>已删除 ${deleted.contracts} 份合同和 ${deleted.installments} 条分期回款记录。</p>
  `);
}
