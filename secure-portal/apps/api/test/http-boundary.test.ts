import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("HTTP security boundary", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("serves security headers on API responses", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("rejects a state-changing request from a hostile origin", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin: "https://attacker.example", "content-type": "application/json" },
      payload: { email: "person@example.test", password: "not-used" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "Untrusted request origin" });
  });

  it("does not reveal details for a malformed public transfer credential", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/public/secure-transfers/unlock",
      headers: { origin: "http://localhost:4100", "content-type": "application/json" },
      payload: { token: "short", password: "short" },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "This secure transfer is invalid, locked, or expired",
      code: "TRANSFER_UNAVAILABLE",
    });
  });
});
