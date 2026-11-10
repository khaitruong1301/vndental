export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export type Params = Record<string, string | number | boolean | null | undefined>;

function buildUrl(path: string, params?: Params): string {
  const url = new URL('/api' + path, window.location.origin);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function request<T>(method: string, path: string, body?: unknown, params?: Params): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const res = await fetch(buildUrl(path, params), {
    method,
    credentials: 'same-origin',
    headers: body === undefined || isForm ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });

  if (res.status === 401 && !path.startsWith('/auth/')) {
    window.location.href = '/login';
    throw new ApiError(401, 'Phiên đăng nhập đã hết hạn');
  }
  const text = await res.text();
  let data: { error?: string; details?: { code?: string } } | null = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Proxy / máy chủ trả về không phải JSON (vd. 413, 502, 504)
    throw new ApiError(
      res.status,
      res.ok ? 'Phản hồi không hợp lệ từ máy chủ' : `Máy chủ không xử lý được yêu cầu (HTTP ${res.status})`,
    );
  }
  if (res.status === 403 && data?.details?.code === 'MUST_CHANGE_PASSWORD' && window.location.pathname !== '/account') {
    window.location.href = '/account';
  }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'Có lỗi xảy ra', data?.details);
  return data as T;
}

/** Gọi API backend qua proxy /api của Next.js. Dữ liệu trả về dùng snake_case như DB. */
export const api = {
  get: <T>(path: string, params?: Params) => request<T>('GET', path, undefined, params),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  del: <T>(path: string) => request<T>('DELETE', path),
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, form),
};
