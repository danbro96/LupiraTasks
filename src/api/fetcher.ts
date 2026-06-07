/**
 * Custom fetch invoked by every Orval-generated request. Returns the envelope shape
 * Orval's react-query mode expects: `{ status, data, headers }`. Base URL comes from
 * Vite's `import.meta.env.VITE_API_BASE_URL` (empty = same-origin, e.g. behind a proxy).
 */
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

const rawBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
const BASE_URL = rawBase ? rawBase.replace(/\/$/, '') : '';

export async function customFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE_URL + url, init);

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, text || res.statusText);
  }

  const contentType = res.headers.get('content-type') ?? '';
  const body =
    res.status === 204
      ? undefined
      : contentType.includes('application/json')
        ? await res.json()
        : await res.text();

  return { status: res.status, data: body, headers: res.headers } as T;
}

export default customFetch;
