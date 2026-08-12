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
      new URL("../../edge/migrations/0001_initial.sql", import.meta.url),
      "utf8",
    );
    expect(migration).toContain("audit_events_no_update BEFORE UPDATE ON audit_events");
    expect(migration).toContain("audit_events_no_delete BEFORE DELETE ON audit_events");
    expect(migration).toContain("RAISE(ABORT, 'audit_events are append-only')");
  });

  it("stores password-protected transfer credentials as digests and enforces expiry", async () => {
    const migration = await readFile(
      new URL("../../edge/migrations/0003_password_protected_transfers.sql", import.meta.url),
      "utf8",
    );
    expect(migration).toContain("token_digest TEXT NOT NULL UNIQUE");
    expect(migration).toContain("password_hash TEXT NOT NULL");
    expect(migration).toContain("expires_at INTEGER NOT NULL");
    expect(migration).not.toContain("password TEXT");
    expect(migration).not.toContain("token TEXT");
  });

  it("binds secure-transfer administration to the authenticated organization and uses one-time tickets", async () => {
    const source = await readFile(new URL("../src/routes/secure-transfers.ts", import.meta.url), "utf8");
    expect(source).toContain("f.organization_id = $1");
    expect(source).toContain("consumed_at IS NULL AND expires_at > $2");
    expect(source).toContain("SET consumed_at = $2");
    expect(source).toContain("status = 'REVOKED'");
    expect(source).toContain("status !== \"AVAILABLE\"");
  });
});
