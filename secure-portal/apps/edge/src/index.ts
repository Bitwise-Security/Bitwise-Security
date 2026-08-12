import { Container, ContainerProxy } from "@cloudflare/containers";
import { DurableObject } from "cloudflare:workers";
import { nextRateState, ratePolicyFor } from "./rate-limit.js";
import type { RateState } from "./rate-limit.js";

export { ContainerProxy };

const CONTAINER_NAME = "bitwise-secure-portal-staging-api-v2";
const R2_VIRTUAL_HOST = "portal-files.internal";
const D1_VIRTUAL_HOST = "portal-db.internal";
const RESEND_VIRTUAL_HOST = "portal-resend.internal";
const STORAGE_KEY = /^[a-zA-Z0-9_-]{16,100}$/u;

interface D1QueryInput {
  sql: string;
  params: unknown[];
}

interface EncodedBinary {
  __portalBinary: string;
}

function json(value: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(value), { status, headers });
}

function securityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  if (!headers.has("Content-Security-Policy")) {
    headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests",
    );
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function requiredHeader(request: Request, name: string): string {
  const value = request.headers.get(name);
  if (!value) throw new Error(`Missing internal ${name} header`);
  return value;
}

function checkedStorageKey(value: string): string {
  if (!STORAGE_KEY.test(value)) throw new Error("Invalid internal storage key");
  return value;
}

function isUploadedPart(value: unknown): value is { partNumber: number; etag: string } {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return Number.isInteger(candidate.partNumber) && typeof candidate.etag === "string";
}

async function r2BindingHandler(request: Request, bindings: Cloudflare.Env): Promise<Response> {
  const url = new URL(request.url);
  try {
    if (request.method === "POST" && url.pathname === "/multipart/create") {
      const key = checkedStorageKey(requiredHeader(request, "x-storage-key"));
      const upload = await bindings.PORTAL_FILES.createMultipartUpload(key, {
        httpMetadata: { contentType: "application/octet-stream", cacheControl: "no-store" },
        customMetadata: { encrypted: "aes-256-gcm-chunks", version: "1" },
      });
      return json({ uploadId: upload.uploadId });
    }

    if (request.method === "PUT" && url.pathname === "/multipart/part") {
      const key = checkedStorageKey(requiredHeader(request, "x-storage-key"));
      const uploadId = requiredHeader(request, "x-upload-id");
      const partNumber = Number(requiredHeader(request, "x-part-number"));
      if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000 || !request.body) {
        return json({ error: "Invalid multipart request" }, 400);
      }
      const part = await bindings.PORTAL_FILES
        .resumeMultipartUpload(key, uploadId)
        .uploadPart(partNumber, request.body);
      return json({ etag: part.etag });
    }

    if (request.method === "POST" && url.pathname === "/multipart/complete") {
      const key = checkedStorageKey(requiredHeader(request, "x-storage-key"));
      const uploadId = requiredHeader(request, "x-upload-id");
      const parsed: unknown = await request.json();
      if (!Array.isArray(parsed)) return json({ error: "Invalid multipart parts" }, 400);
      if (!parsed.every(isUploadedPart)) throw new Error("Invalid multipart part descriptor");
      const parts = parsed.map((part) => ({ partNumber: part.partNumber, etag: part.etag }));
      await bindings.PORTAL_FILES.resumeMultipartUpload(key, uploadId).complete(parts);
      return new Response(null, { status: 204 });
    }

    if (request.method === "DELETE" && url.pathname === "/multipart") {
      const key = checkedStorageKey(requiredHeader(request, "x-storage-key"));
      const uploadId = requiredHeader(request, "x-upload-id");
      await bindings.PORTAL_FILES.resumeMultipartUpload(key, uploadId).abort();
      return new Response(null, { status: 204 });
    }

    if (request.method === "GET" && url.pathname === "/object") {
      const key = checkedStorageKey(requiredHeader(request, "x-storage-key"));
      const offset = Number(requiredHeader(request, "x-range-offset"));
      const length = Number(requiredHeader(request, "x-range-length"));
      if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 1) {
        return json({ error: "Invalid object range" }, 400);
      }
      const object = await bindings.PORTAL_FILES.get(key, { range: { offset, length } });
      if (!object) return new Response(null, { status: 404 });
      return new Response(object.body, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(length),
          "Cache-Control": "no-store",
        },
      });
    }

    if (request.method === "DELETE" && url.pathname === "/object") {
      const key = checkedStorageKey(requiredHeader(request, "x-storage-key"));
      await bindings.PORTAL_FILES.delete(key);
      return new Response(null, { status: 204 });
    }
  } catch (error) {
    console.error(JSON.stringify({ event: "r2_binding_error", error: error instanceof Error ? error.message : "unknown" }));
    return json({ error: "Storage operation failed" }, 502);
  }
  return new Response(null, { status: 404 });
}

function isEncodedBinary(value: unknown): value is EncodedBinary {
  return typeof value === "object" && value !== null &&
    "__portalBinary" in value && typeof value.__portalBinary === "string";
}

function decodeD1Parameter(value: unknown): string | number | null | ArrayBuffer {
  if (!isEncodedBinary(value)) {
    if (value === null || typeof value === "string" || typeof value === "number") return value;
    throw new Error("Invalid D1 parameter type");
  }
  const binary = Uint8Array.from(atob(value.__portalBinary), (character) => character.charCodeAt(0));
  return binary.buffer;
}

function encodeD1Value(value: unknown): unknown {
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    const bytes = value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return { __portalBinary: btoa(binary) } satisfies EncodedBinary;
  }
  // D1 may surface BLOB columns as byte arrays depending on the runtime path.
  if (Array.isArray(value) && value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
    let binary = "";
    for (const byte of value) binary += String.fromCharCode(byte as number);
    return { __portalBinary: btoa(binary) } satisfies EncodedBinary;
  }
  return value;
}

function isD1QueryInput(value: unknown): value is D1QueryInput {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.sql === "string" && candidate.sql.length > 0 && candidate.sql.length <= 50_000 &&
    Array.isArray(candidate.params) && candidate.params.length <= 200;
}

async function d1BindingHandler(request: Request, bindings: Cloudflare.Env): Promise<Response> {
  if (request.method !== "POST" || new URL(request.url).pathname !== "/batch") {
    return json({ error: "Database operation denied" }, 403);
  }
  try {
    const body: unknown = await request.json();
    if (!Array.isArray(body) || body.length < 1 || body.length > 100 || !body.every(isD1QueryInput)) {
      return json({ error: "Invalid database batch" }, 400);
    }
    const statements = body.map((query) => bindings.PORTAL_DB
      .prepare(query.sql)
      .bind(...query.params.map(decodeD1Parameter)));
    const results = statements.length === 1
      ? [await statements[0]!.all()]
      : await bindings.PORTAL_DB.batch(statements);
    return json({
      results: results.map((result) => ({
        rows: result.results.map((row) => Object.fromEntries(
          Object.entries(row as Record<string, unknown>).map(([key, value]) => [key, encodeD1Value(value)]),
        )),
        changes: result.meta.changes ?? 0,
      })),
    });
  } catch (error) {
    console.error(JSON.stringify({ event: "d1_binding_error", error: error instanceof Error ? error.message : "unknown" }));
    return json({ error: "Database operation failed" }, 502);
  }
}

async function resendEgressHandler(request: Request, bindings: Cloudflare.Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== "/emails") {
    return json({ error: "Outbound operation denied" }, 403);
  }
  const body = await request.arrayBuffer();
  if (body.byteLength > 64 * 1024) return json({ error: "Outbound payload too large" }, 413);
  const headers = new Headers(request.headers);
  headers.delete("Host");
  headers.delete("Content-Length");
  headers.set("Authorization", `Bearer ${bindings.RESEND_API_KEY}`);
  const authenticatedRequest = new Request("https://api.resend.com/emails", {
    method: "POST",
    headers,
    body,
  });
  return fetch(authenticatedRequest);
}

export class PortalContainer extends Container<Cloudflare.Env> {
  override defaultPort = 4100;
  override requiredPorts = [4100];
  override sleepAfter = "10m";
  override enableInternet = true;
  override interceptHttps = true;
  override allowedHosts = [
    R2_VIRTUAL_HOST,
    D1_VIRTUAL_HOST,
    RESEND_VIRTUAL_HOST,
    "database.clamav.net",
    "*.clamav.net",
  ];
  override envVars = {
    NODE_ENV: "production",
    PORT: "4100",
    PUBLIC_ORIGIN: this.env.PUBLIC_ORIGIN,
    D1_BINDING_ORIGIN: `http://${D1_VIRTUAL_HOST}`,
    REDIS_URL: "redis://127.0.0.1:6379",
    RATE_LIMIT_BACKEND: "memory",
    TRUSTED_EDGE_GATEWAY: "true",
    MFA_ENCRYPTION_KEY: this.env.MFA_ENCRYPTION_KEY,
    SESSION_PEPPER: this.env.SESSION_PEPPER,
    SMTP_HOST: "127.0.0.1",
    EMAIL_FROM: this.env.EMAIL_FROM,
    EMAIL_PROVIDER: "resend",
    RESEND_API_KEY: "injected-by-cloudflare-egress",
    RESEND_API_ORIGIN: `http://${RESEND_VIRTUAL_HOST}`,
    STORAGE_MODE: "r2-binding",
    R2_BINDING_ORIGIN: `http://${R2_VIRTUAL_HOST}`,
    FILE_KEY_PROVIDER: "cloudflare-secret",
    FILE_KEY_RING: this.env.FILE_KEY_RING,
    SCANNER_MODE: "clamav",
    CLAMAV_HOST: "127.0.0.1",
    CLAMAV_PORT: "3310",
    ...(this.env.BOOTSTRAP_ADMIN_EMAIL && this.env.BOOTSTRAP_ADMIN_PASSWORD
      ? {
          BOOTSTRAP_ADMIN_EMAIL: this.env.BOOTSTRAP_ADMIN_EMAIL,
          BOOTSTRAP_ADMIN_PASSWORD: this.env.BOOTSTRAP_ADMIN_PASSWORD,
        }
      : {}),
  };
}

PortalContainer.outboundByHost = {
  [R2_VIRTUAL_HOST]: r2BindingHandler,
  [D1_VIRTUAL_HOST]: d1BindingHandler,
  [RESEND_VIRTUAL_HOST]: resendEgressHandler,
};

export class AuthRateLimiter extends DurableObject<Cloudflare.Env> {
  override async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return new Response(null, { status: 405 });
    const input: unknown = await request.json();
    if (
      typeof input !== "object" ||
      input === null ||
      !("limit" in input) ||
      !("windowSeconds" in input) ||
      !Number.isInteger(input.limit) ||
      !Number.isInteger(input.windowSeconds)
    ) {
      return new Response(null, { status: 400 });
    }
    const now = Date.now();
    const current = await this.ctx.storage.get<RateState>("window");
    const { state, allowed } = nextRateState(
      current,
      { limit: input.limit as number, windowSeconds: input.windowSeconds as number },
      now,
    );
    await this.ctx.storage.put("window", state, { allowUnconfirmed: false });
    return json(
      { allowed },
      allowed ? 200 : 429,
      { "Retry-After": String(Math.max(1, Math.ceil((state.windowEndsAt - now) / 1000))) },
    );
  }
}

async function enforceEdgeRateLimit(request: Request, bindings: Cloudflare.Env): Promise<Response | null> {
  const url = new URL(request.url);
  const policyKey = `${request.method.toUpperCase()} ${url.pathname}`;
  const policy = ratePolicyFor(request.method, url.pathname);
  if (!policy) return null;
  const clientIp = request.headers.get("CF-Connecting-IP") ?? "local-development";
  const limiterId = bindings.AUTH_RATE_LIMITER.idFromName(`${policyKey}:${clientIp}`);
  const response = await bindings.AUTH_RATE_LIMITER.get(limiterId).fetch("https://limiter.internal/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(policy),
  });
  if (response.ok) return null;
  return json(
    { error: "Too many requests", code: "RATE_LIMITED" },
    429,
    { "Retry-After": response.headers.get("Retry-After") ?? "60" },
  );
}

async function proxyApi(request: Request, bindings: Cloudflare.Env): Promise<Response> {
  const limited = await enforceEdgeRateLimit(request, bindings);
  if (limited) return limited;
  const headers = new Headers(request.headers);
  headers.delete("x-forwarded-for");
  headers.delete("x-real-ip");
  headers.set("x-forwarded-for", request.headers.get("CF-Connecting-IP") ?? "127.0.0.1");
  const forwarded = new Request(request, { headers });
  const container = bindings.PORTAL_CONTAINER.getByName(CONTAINER_NAME);
  return container.fetch(forwarded);
}

export default {
  async fetch(request, bindings): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/internal/")) return securityHeaders(new Response(null, { status: 404 }));
    const response = url.pathname.startsWith("/api/")
      ? await proxyApi(request, bindings)
      : await bindings.ASSETS.fetch(request);
    return securityHeaders(response);
  },

  scheduled(_controller, bindings, ctx): void {
    const container = bindings.PORTAL_CONTAINER.getByName(CONTAINER_NAME);
    ctx.waitUntil(
      container
        .fetch("https://portal-container.internal/api/v1/health")
        .then((response) => response.body?.cancel())
        .catch((error: unknown) => {
          console.error(JSON.stringify({ event: "container_keepalive_failed", error: error instanceof Error ? error.message : "unknown" }));
        }),
    );
  },
} satisfies ExportedHandler<Cloudflare.Env>;
