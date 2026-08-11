import { describe, expect, it } from "vitest";
import { encodeBase32, totpAtStep, verifyTotp } from "../src/security/totp.js";

describe("TOTP", () => {
  const rfcSecret = encodeBase32(Buffer.from("12345678901234567890"));

  it("matches the RFC 6238 SHA-1 vector", () => {
    expect(totpAtStep(rfcSecret, Math.floor(59 / 30), 8)).toBe("94287082");
  });

  it("accepts a current code only once when last-used step is recorded", () => {
    const now = 1_700_000_000_000;
    const step = Math.floor(now / 30_000);
    const code = totpAtStep(rfcSecret, step);
    expect(verifyTotp(rfcSecret, code, { now, window: 0 })).toEqual({ valid: true, step });
    expect(verifyTotp(rfcSecret, code, { now, window: 0, lastUsedStep: step })).toEqual({ valid: false });
  });

  it("rejects malformed and stale codes", () => {
    expect(verifyTotp(rfcSecret, "12345")).toEqual({ valid: false });
    expect(verifyTotp(rfcSecret, totpAtStep(rfcSecret, 10), { now: 20 * 30_000, window: 1 })).toEqual({ valid: false });
  });
});

