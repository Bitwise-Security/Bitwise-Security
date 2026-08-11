import { createCipheriv, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { FILE_ACCESS_SQL } from "../src/files/authorization.js";
import { chunkAad, chunkNonce, decryptChunk } from "../src/files/file-crypto.js";
import { declaredFileAllowed, sanitizeDisplayName, verifyDetectedType } from "../src/files/policy.js";
import { expectedPartLengths } from "../src/routes/files.js";

function encryptChunk(
  plaintext: Buffer,
  key: Buffer,
  prefix: Buffer,
  fileId: string,
  partNumber: number,
): Buffer {
  const cipher = createCipheriv("aes-256-gcm", key, chunkNonce(prefix, partNumber));
  cipher.setAAD(chunkAad(fileId, partNumber, plaintext.length));
  return Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
}

describe("file security", () => {
  it("decrypts an authenticated chunk and rejects ciphertext or metadata tampering", () => {
    const key = randomBytes(32);
    const prefix = randomBytes(8);
    const plaintext = Buffer.from("confidential report contents");
    const encrypted = encryptChunk(plaintext, key, prefix, "11111111-1111-4111-8111-111111111111", 1);
    expect(
      decryptChunk(encrypted, key, prefix, "11111111-1111-4111-8111-111111111111", 1, plaintext.length),
    ).toEqual(plaintext);
    const tampered = Buffer.from(encrypted);
    tampered[0] = tampered[0]! ^ 1;
    expect(() => decryptChunk(tampered, key, prefix, "11111111-1111-4111-8111-111111111111", 1, plaintext.length)).toThrow();
    expect(() => decryptChunk(encrypted, key, prefix, "22222222-2222-4222-8222-222222222222", 1, plaintext.length)).toThrow();
  });

  it("sanitizes display names and blocks executable or archive declarations", () => {
    expect(sanitizeDisplayName("../../customer-report.pdf")).toBe("customer-report.pdf");
    expect(() => sanitizeDisplayName(".." )).toThrow();
    expect(declaredFileAllowed("report.pdf", "application/pdf")).toBe(true);
    expect(declaredFileAllowed("payload.exe", "application/octet-stream")).toBe(false);
    expect(declaredFileAllowed("documents.zip", "application/zip")).toBe(false);
    expect(declaredFileAllowed("report.pdf", "text/html")).toBe(false);
  });

  it("verifies magic bytes independently of the extension", async () => {
    await expect(verifyDetectedType("report.pdf", Buffer.from("%PDF-1.7\n%test"))).resolves.toMatchObject({
      allowed: true,
      detectedType: "application/pdf",
    });
    await expect(verifyDetectedType("report.pdf", Buffer.from("MZ executable"))).resolves.toMatchObject({
      allowed: false,
      reason: "CONTENT_TYPE_MISMATCH",
    });
  });

  it("calculates the authenticated final chunk without crossing the declared size", () => {
    const file = { plaintext_size: String(10_000_000), chunk_size: 8_388_608, chunk_count: 2 };
    expect(expectedPartLengths(file, 1)).toEqual({ plaintext: 8_388_608, ciphertext: 8_388_624 });
    expect(expectedPartLengths(file, 2)).toEqual({ plaintext: 1_611_392, ciphertext: 1_611_408 });
    expect(() => expectedPartLengths(file, 3)).toThrow();
  });

  it("keeps tenant and space membership in the canonical file lookup", () => {
    expect(FILE_ACCESS_SQL).toContain("f.organization_id = $1");
    expect(FILE_ACCESS_SQL).toContain("f.id = $2");
    expect(FILE_ACCESS_SQL).toContain("sm.space_id = f.space_id");
    expect(FILE_ACCESS_SQL).toContain("sm.user_id = $4");
    expect(FILE_ACCESS_SQL).not.toContain("storage_key =");
  });

  it("keeps audit events immutable at the database boundary", async () => {
    const migration = await readFile(
      new URL("../src/migrations/003_audit_hardening.sql", import.meta.url),
      "utf8",
    );
    expect(migration).toContain("BEFORE UPDATE OR DELETE ON audit_events");
    expect(migration).toContain("RAISE EXCEPTION 'audit_events are append-only'");
  });
});
