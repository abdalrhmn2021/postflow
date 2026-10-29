// The one way the browser talks to the API. Every call goes to /api/... on this same site, and
// next.config.ts forwards it to NestJS - so the login cookie is first-party and sent automatically.
//
//   const brands = await api<Brand[]>("/brands");
//   await api("/brands", { method: "POST", body: { name } });
//
// A failed call throws ApiError with the API's error code (and per-field messages for VALIDATION_ERROR),
// which the page turns into text with errorText() / fieldText().

export class ApiError extends Error {
  constructor(
    readonly status: number, // 0 = the server couldn't be reached
    readonly code: string, // EMAIL_TAKEN, INVITE_INVALID ... or NETWORK_ERROR / UNKNOWN
    readonly fields: Record<string, string> = {}, // field -> the API's message, for VALIDATION_ERROR
  ) {
    super(code);
    this.name = "ApiError";
  }
}

type Options = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
};

export async function api<T = void>(path: string, { method = "GET", body, signal }: Options = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      signal,
      credentials: "same-origin",
      cache: "no-store", // answers depend on who is logged in
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err; // the page cancelled it
    throw new ApiError(0, "NETWORK_ERROR");
  }

  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const error = (data ?? {}) as { code?: unknown; fields?: unknown };
    throw new ApiError(
      res.status,
      typeof error.code === "string" ? error.code : "UNKNOWN",
      error.fields && typeof error.fields === "object" ? (error.fields as Record<string, string>) : {},
    );
  }
  return data as T;
}
