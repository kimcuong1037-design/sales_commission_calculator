const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function requireAuthenticatedSiteUser(request: Request) {
  const hostname = new URL(request.url).hostname;
  if (LOCAL_HOSTS.has(hostname)) return null;

  const userId = request.headers.get('oai-authenticated-user-id')?.trim();
  const email = request.headers
    .get('oai-authenticated-user-email')
    ?.trim();
  if (userId || email) return null;

  return Response.json(
    { error: '登录状态已失效，请刷新页面并重新登录' },
    { status: 401 },
  );
}
