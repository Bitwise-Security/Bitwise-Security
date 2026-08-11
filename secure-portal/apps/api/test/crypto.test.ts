import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  hashPassword,
  tokenDigest,
  verifyPassword,
} from "../src/security/crypto.js";
import { resetConfigForTests } from "../src/config.js";
import { getFileKeyProvider, resetFileKeyProviderForTests } from "../src/files/key-provider.js";

describe("authentication cryptography", () => {
  it("hashes passwords with Argon2id and rejects a wrong password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).toMatch(/^\$argon2id\$/u);
    await expect(verifyPassword(hash, "correct horse battery staple")).resolves.toBe(true);
    await expect(verifyPassword(hash, "wrong horse battery staple")).resolves.toBe(false);
  });

  it("encrypts MFA secrets with authenticated AES-256-GCM", () => {
    const envelope = encryptSecret("JBSWY3DPEHPK3PXP");
    expect(envelope).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptSecret(envelope)).toBe("JBSWY3DPEHPK3PXP");
    const pieces = envelope.split(".");
    const ciphertext = Buffer.from(pieces[2]!, "base64url");
    ciphertext[0] = ciphertext[0]! ^ 1;
    pieces[2] = ciphertext.toString("base64url");
    expect(() => decryptSecret(pieces.join("."))).toThrow();
  });

  it("uses a keyed digest for session and recovery tokens", () => {
    expect(tokenDigest("same-token")).toHaveLength(64);
    expect(tokenDigest("same-token")).toBe(tokenDigest("same-token"));
    expect(tokenDigest("same-token")).not.toBe(tokenDigest("other-token"));
  });

  it("rotates Cloudflare wrapping keys without making existing files unreadable", async () => {
    const previousProvider = process.env.FILE_KEY_PROVIDER;
    const previousRing = process.env.FILE_KEY_RING;
    try {
      process.env.FILE_KEY_PROVIDER = "cloudflare-secret";
      process.env.FILE_KEY_RING = JSON.stringify({
        current: "v2",
        keys: {
          v1: Buffer.alloc(32, 1).toString("base64"),
          v2: Buffer.alloc(32, 2).toString("base64"),
        },
      });
      resetConfigForTests();
      resetFileKeyProviderForTests();
      const generated = await getFileKeyProvider().generate();
      expect(generated.version).toBe("v2");
      await expect(getFileKeyProvider().unwrap(generated.wrappedKey, "v2")).resolves.toEqual(generated.plaintextKey);
      expect(() => getFileKeyProvider().unwrap(generated.wrappedKey, "v1")).toThrow();
    } finally {
      if (previousProvider === undefined) delete process.env.FILE_KEY_PROVIDER;
      else process.env.FILE_KEY_PROVIDER = previousProvider;
      if (previousRing === undefined) delete process.env.FILE_KEY_RING;
      else process.env.FILE_KEY_RING = previousRing;
      resetConfigForTests();
      resetFileKeyProviderForTests();
    }
  });
});
