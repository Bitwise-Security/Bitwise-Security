export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  role: "ADMIN" | "CLIENT";
}

export interface SessionResponse {
  csrfToken: string;
  user: SessionUser;
}

let csrfToken: string | null = null;

export class ApiError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
  }
}

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export async function uploadBinary(path: string, body: ArrayBuffer, directToStorage: boolean): Promise<string> {
  const headers = new Headers({ "Content-Type": "application/octet-stream" });
  if (!directToStorage && csrfToken) headers.set("X-CSRF-Token", csrfToken);
  const response = await fetch(path, {
    method: "PUT",
    body,
    headers,
    credentials: directToStorage ? "omit" : "include",
  });
  if (!response.ok) throw new ApiError("Encrypted upload part failed", response.status);
  return response.headers.get("ETag") ?? response.headers.get("etag") ?? "proxy-confirmed";
}

export async function api<T>(
  path: string,
  options: RequestInit & { body?: string } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  if (csrfToken && options.method && options.method !== "GET") {
    headers.set("X-CSRF-Token", csrfToken);
  }
  const response = await fetch(path, {
    ...options,
    headers,
    credentials: "include",
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
    };
    throw new ApiError(payload.error ?? "Request failed", response.status, payload.code);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function loadSession(): Promise<SessionResponse | null> {
  try {
    const session = await api<SessionResponse>("/api/v1/auth/session");
    setCsrfToken(session.csrfToken);
    return session;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      setCsrfToken(null);
      return null;
    }
    throw error;
  }
}
