/** Thrown for every non-2xx response by whichever transport the app installed. Status 0 = no HTTP
 *  response at all (timeout, unreachable host). Consumers branch on `status`, so the shape is the
 *  contract — not the message. */
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

export function isNetworkError(e: unknown): boolean {
  return e instanceof ApiError && e.status === 0;
}
