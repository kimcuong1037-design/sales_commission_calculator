interface ApiErrorBody {
  error?: string;
}

export async function readApiJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function getApiErrorMessage(response: Response, fallback: string) {
  const body = await readApiJson<ApiErrorBody>(response);
  if (body?.error) return body.error;
  if (response.status === 401 || response.status === 403) {
    return '当前登录状态已失效或账号暂无写入权限，请刷新页面并重新登录后再试';
  }
  if (response.status === 405) {
    return '保存请求被当前访问环境拦截，请刷新页面后重试';
  }
  return fallback;
}
