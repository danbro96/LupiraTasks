export async function customFetch<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const base =
    typeof window === "undefined"
      ? (process.env.API_BASE_URL ?? "http://localhost:5188")
      : "";
  const res = await fetch(base + url, { cache: "no-store", ...init });
  const contentType = res.headers.get("content-type");
  const body =
    res.status === 204
      ? undefined
      : contentType?.includes("application/json")
        ? await res.json()
        : await res.text();

  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} for ${url}`);
  }

  return {
    status: res.status,
    data: body,
    headers: res.headers,
  } as T;
}
