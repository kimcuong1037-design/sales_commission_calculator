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
  return apiErrorMessage(response.status, body?.error, fallback);
}

function apiErrorMessage(
  status: number,
  serverMessage: string | undefined,
  fallback: string,
) {
  if (serverMessage) return serverMessage;
  if (status === 401 || status === 403) {
    return '当前登录状态已失效或账号暂无写入权限，请刷新页面并重新登录后再试';
  }
  if (status === 405) {
    return '保存请求被当前访问环境拦截，请刷新页面后重试';
  }
  return fallback;
}

export async function readApiResponse<T>(
  response: Response,
  fallback: string,
): Promise<T> {
  const body = await readApiJson<T & ApiErrorBody>(response);
  if (!response.ok) {
    throw new Error(apiErrorMessage(response.status, body?.error, fallback));
  }
  if (!body) throw new Error(fallback);
  return body;
}
