export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function apiEnvelope<T>(
  path: string,
  options: RequestInit = {},
): Promise<{ data: T; pagination?: { totalPages: number } }> {
  let response: Response;
  try {
    response = await fetch(`/api/store/${path}`, {
      ...options,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError(
      'NETWORK_ERROR',
      'We couldn’t connect. Check your connection and try again.',
      0,
    );
  }
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new ApiError(
      body?.error?.code ?? 'REQUEST_FAILED',
      body?.error?.message ?? 'Something went wrong. Please try again.',
      response.status,
    );
    if (response.status === 401 && !path.startsWith('auth/'))
      window.dispatchEvent(new Event('session-expired'));
    throw error;
  }
  return body ?? { data: undefined as T };
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  return (await apiEnvelope<T>(path, options)).data;
}
