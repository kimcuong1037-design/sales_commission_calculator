export class ApiRequestError extends Error {
  readonly status: 400 | 415;

  constructor(message: string, status: 400 | 415) {
    super(message);
    this.status = status;
  }
}

export async function readJsonRequest(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new ApiRequestError('请求格式必须为 JSON', 415);
  }
  try {
    return await request.json();
  } catch {
    throw new ApiRequestError('请求内容不是有效的 JSON', 400);
  }
}

export function apiRequestErrorResponse(error: unknown) {
  return error instanceof ApiRequestError
    ? Response.json({ error: error.message }, { status: error.status })
    : null;
}
