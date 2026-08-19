import { createDecipheriv } from "node:crypto";

export function chunkNonce(prefix: Buffer, partNumber: number): Buffer {
  if (prefix.length !== 8) throw new Error("File nonce prefix must be eight bytes");
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 0xffff_ffff) {
    throw new Error("Invalid encrypted part number");
  }
  const nonce = Buffer.alloc(12);
  prefix.copy(nonce, 0);
  nonce.writeUInt32BE(partNumber - 1, 8);
  return nonce;
}

export function chunkAad(fileId: string, partNumber: number, plaintextLength: number): Buffer {
  return Buffer.from(`bitwise-file-v1:${fileId}:${partNumber}:${plaintextLength}`, "utf8");
}

export function decryptChunk(
  ciphertextWithTag: Buffer,
  key: Buffer,
  noncePrefix: Buffer,
  fileId: string,
  partNumber: number,
  plaintextLength: number,
): Buffer {
  if (ciphertextWithTag.length !== plaintextLength + 16) {
    throw new Error("Encrypted chunk length does not match its authenticated metadata");
  }
  const ciphertext = ciphertextWithTag.subarray(0, -16);
  const tag = ciphertextWithTag.subarray(-16);
  const decipher = createDecipheriv("aes-256-gcm", key, chunkNonce(noncePrefix, partNumber));
  decipher.setAAD(chunkAad(fileId, partNumber, plaintextLength));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

