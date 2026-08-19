import { describe, expect, it } from "vitest";
import { getConfig, resetConfigForTests } from "../src/config.js";
import { passwordSchema } from "../src/security/password-policy.js";
import { isOriginAllowed } from "../src/security/origin.js";

describe("request security policy", () => {
  it("requires the exact production origin for state-changing requests", () => {
    const expected = "https://portal.bitwise-security.nl";
    expect(isOriginAllowed("POST", expected, expected, true)).toBe(true);
    expect(isOriginAllowed("POST", "https://evil.example", expected, true)).toBe(false);
    expect(isOriginAllowed("POST", undefined, expected, true)).toBe(false);
    expect(isOriginAllowed("GET", "https://evil.example", expected, true)).toBe(true);
  });

  it("allows CLI-style missing Origin only outside production", () => {
    expect(isOriginAllowed("POST", undefined, "http://localhost:4100", false)).toBe(true);
  });

  it("enforces password length and rejects control characters", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("long enough passphrase").success).toBe(true);
    expect(passwordSchema.safeParse("long enough\u0000passphrase").success).toBe(false);
    expect(passwordSchema.safeParse("x".repeat(129)).success).toBe(false);
  });

  it("refuses development-only storage, key, and scanner modes in production", () => {
    const previousNodeEnvironment = process.env.NODE_ENV;
    const previousEmailProvider = process.env.EMAIL_PROVIDER;
    const previousResendKey = process.env.RESEND_API_KEY;
    try {
      process.env.NODE_ENV = "production";
      process.env.EMAIL_PROVIDER = "resend";
      process.env.RESEND_API_KEY = "test-resend-key-not-a-real-credential";
      resetConfigForTests();
      expect(() => getConfig()).toThrow("Production requires private object storage");
    } finally {
      if (previousNodeEnvironment === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnvironment;
      if (previousEmailProvider === undefined) delete process.env.EMAIL_PROVIDER;
      else process.env.EMAIL_PROVIDER = previousEmailProvider;
      if (previousResendKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = previousResendKey;
      resetConfigForTests();
    }
  });
});
