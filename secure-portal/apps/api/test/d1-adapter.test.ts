import { afterEach, describe, expect, it, vi } from "vitest";
import { closePool, getPool } from "../src/db.js";
import { resetConfigForTests } from "../src/config.js";

afterEach(async () => {
  vi.restoreAllMocks();
  await closePool();
  resetConfigForTests();
});

describe("D1 binding adapter", () => {
  it("normalizes legacy placeholders and preserves binary, timestamps, and JSON", async () => {
    const encrypted = Buffer.from("encrypted-value");
    const timestamp = Date.now();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      results: [{
        rows: [{
          wrapped_dek: { __portalBinary: encrypted.toString("base64") },
          created_at: timestamp,
          metadata: '{"tenantBound":true}',
          uploaded_by_me: 1,
        }],
        changes: 0,
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await getPool().query<{
      wrapped_dek: Buffer;
      created_at: Date;
      metadata: { tenantBound: boolean };
      uploaded_by_me: boolean;
    }>(
      "SELECT $1::text, now(), LEAST($2::integer, $3::integer)",
      [encrypted, new Date(timestamp), true],
    );

    expect(result.rows[0]).toEqual({
      wrapped_dek: encrypted,
      created_at: new Date(timestamp),
      metadata: { tenantBound: true },
      uploaded_by_me: true,
    });
    const request = fetchMock.mock.calls[0];
    expect(request?.[0]).toBe("http://portal-db.internal/batch");
    const rawBody = (request?.[1] as RequestInit).body;
    if (typeof rawBody !== "string") throw new Error("Expected a serialized D1 request body");
    const body = JSON.parse(rawBody) as Array<{ sql: string; params: unknown[] }>;
    expect(body[0]?.sql).toBe("SELECT ?1, (unixepoch() * 1000), min(?2, ?3)");
    expect(body[0]?.params).toEqual([
      { __portalBinary: encrypted.toString("base64") },
      timestamp,
      1,
    ]);
  });

  it("fails closed when the Worker binding rejects a database operation", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 502 }));
    await expect(getPool().query("SELECT 1")).rejects.toThrow("HTTP 502");
  });
});
