import { Readable } from "node:stream";
import type { FastifyReply } from "fastify";
import type { AuthorizedFile } from "./authorization.js";
import { decryptChunk } from "./file-crypto.js";
import { getFileKeyProvider } from "./key-provider.js";
import { getStorage } from "./storage.js";

function partLengths(file: AuthorizedFile, partNumber: number): { plaintext: number; ciphertext: number } {
  const total = Number(file.plaintext_size);
  const plaintext = Math.min(file.chunk_size, total - (partNumber - 1) * file.chunk_size);
  if (partNumber < 1 || partNumber > file.chunk_count || plaintext < 1) {
    throw new Error("Invalid encrypted file part");
  }
  return { plaintext, ciphertext: plaintext + 16 };
}

export function createDecryptedFileStream(file: AuthorizedFile): Readable {
  const storage = getStorage();
  const keyProvider = getFileKeyProvider();
  return Readable.from((async function* () {
    const key = await keyProvider.unwrap(file.wrapped_dek, file.key_version);
    let absoluteOffset = 0;
    try {
      for (let partNumber = 1; partNumber <= file.chunk_count; partNumber += 1) {
        const lengths = partLengths(file, partNumber);
        const encrypted = await storage.readPart(
          file.storage_key,
          partNumber,
          storage.mode === "local" ? 0 : absoluteOffset,
          lengths.ciphertext,
        );
        yield decryptChunk(
          encrypted,
          key,
          file.nonce_prefix,
          file.id,
          partNumber,
          lengths.plaintext,
        );
        absoluteOffset += lengths.ciphertext;
      }
    } finally {
      key.fill(0);
    }
  })());
}

export function setAttachmentHeaders(reply: FastifyReply, file: AuthorizedFile): void {
  const asciiName = file.display_name.replace(/[^a-zA-Z0-9._ -]/gu, "_").replaceAll('"', "_");
  const encodedName = encodeURIComponent(file.display_name).replace(/[!'()*]/gu, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  reply.header("Content-Type", "application/octet-stream");
  reply.header("Content-Length", file.plaintext_size);
  reply.header("Content-Disposition", `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`);
  reply.header("Cache-Control", "no-store, private");
  reply.header("X-Content-Type-Options", "nosniff");
}
