const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isOriginAllowed(
  method: string,
  origin: string | undefined,
  expectedOrigin: string,
  production: boolean,
): boolean {
  if (!UNSAFE_METHODS.has(method.toUpperCase())) return true;
  if (!origin) return !production;
  try {
    return new URL(origin).origin === new URL(expectedOrigin).origin;
  } catch {
    return false;
  }
}

