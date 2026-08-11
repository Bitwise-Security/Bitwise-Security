import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { DecryptCommand, GenerateDataKeyCommand, KMSClient } from "@aws-sdk/client-kms";
import { getConfig } from "../config.js";

export interface GeneratedFileKey {
  plaintextKey: Buffer;
  wrappedKey: Buffer;
  provider: "local" | "aws-kms" | "cloudflare-secret";
  version: string;
}

export interface FileKeyProvider {
  generate(): Promise<GeneratedFileKey>;
  unwrap(wrappedKey: Buffer, keyVersion?: string): Promise<Buffer>;
}

class LocalFileKeyProvider implements FileKeyProvider {
  private readonly masterKey = Buffer.from(getConfig().FILE_KEY_ENCRYPTION_KEY!, "base64");

  public generate(): Promise<GeneratedFileKey> {
    const plaintextKey = randomBytes(32);
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.masterKey, nonce);
    cipher.setAAD(Buffer.from("bitwise-file-dek-v1"));
    const ciphertext = Buffer.concat([cipher.update(plaintextKey), cipher.final()]);
    const wrappedKey = Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]);
    return Promise.resolve({ plaintextKey, wrappedKey, provider: "local", version: "v1" });
  }

  public unwrap(wrappedKey: Buffer): Promise<Buffer> {
    if (wrappedKey.length !== 60) throw new Error("Invalid wrapped file key");
    const decipher = createDecipheriv("aes-256-gcm", this.masterKey, wrappedKey.subarray(0, 12));
    decipher.setAAD(Buffer.from("bitwise-file-dek-v1"));
    decipher.setAuthTag(wrappedKey.subarray(12, 28));
    return Promise.resolve(
      Buffer.concat([decipher.update(wrappedKey.subarray(28)), decipher.final()]),
    );
  }
}

class AwsKmsFileKeyProvider implements FileKeyProvider {
  private readonly client = new KMSClient({});
  private readonly keyId = getConfig().AWS_KMS_KEY_ID!;

  public async generate(): Promise<GeneratedFileKey> {
    const response = await this.client.send(
      new GenerateDataKeyCommand({
        KeyId: this.keyId,
        KeySpec: "AES_256",
        EncryptionContext: { application: "bitwise-secure-portal", purpose: "file-content" },
      }),
    );
    if (!response.Plaintext || !response.CiphertextBlob) throw new Error("KMS did not return a data key");
    return {
      plaintextKey: Buffer.from(response.Plaintext),
      wrappedKey: Buffer.from(response.CiphertextBlob),
      provider: "aws-kms",
      version: response.KeyId ?? this.keyId,
    };
  }

  public async unwrap(wrappedKey: Buffer, keyVersion?: string): Promise<Buffer> {
    const response = await this.client.send(
      new DecryptCommand({
        CiphertextBlob: wrappedKey,
        KeyId: keyVersion ?? this.keyId,
        EncryptionContext: { application: "bitwise-secure-portal", purpose: "file-content" },
      }),
    );
    if (!response.Plaintext) throw new Error("KMS did not decrypt the data key");
    return Buffer.from(response.Plaintext);
  }
}

class CloudflareSecretFileKeyProvider implements FileKeyProvider {
  private readonly currentVersion: string;
  private readonly keys: Map<string, Buffer>;

  public constructor() {
    const parsed = JSON.parse(getConfig().FILE_KEY_RING!) as {
      current: string;
      keys: Record<string, string>;
    };
    this.currentVersion = parsed.current;
    this.keys = new Map(
      Object.entries(parsed.keys).map(([version, encodedKey]) => [version, Buffer.from(encodedKey, "base64")]),
    );
  }

  public generate(): Promise<GeneratedFileKey> {
    const wrappingKey = this.keys.get(this.currentVersion);
    if (!wrappingKey) throw new Error("Current Cloudflare file wrapping key is unavailable");
    const plaintextKey = randomBytes(32);
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", wrappingKey, nonce);
    cipher.setAAD(Buffer.from(`bitwise-file-dek:${this.currentVersion}`));
    const ciphertext = Buffer.concat([cipher.update(plaintextKey), cipher.final()]);
    const wrappedKey = Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]);
    return Promise.resolve({
      plaintextKey,
      wrappedKey,
      provider: "cloudflare-secret",
      version: this.currentVersion,
    });
  }

  public unwrap(wrappedKey: Buffer, keyVersion?: string): Promise<Buffer> {
    if (!keyVersion || wrappedKey.length !== 60) throw new Error("Invalid wrapped file key");
    const wrappingKey = this.keys.get(keyVersion);
    if (!wrappingKey) throw new Error("The required file wrapping key version is unavailable");
    const decipher = createDecipheriv("aes-256-gcm", wrappingKey, wrappedKey.subarray(0, 12));
    decipher.setAAD(Buffer.from(`bitwise-file-dek:${keyVersion}`));
    decipher.setAuthTag(wrappedKey.subarray(12, 28));
    return Promise.resolve(
      Buffer.concat([decipher.update(wrappedKey.subarray(28)), decipher.final()]),
    );
  }
}

let provider: FileKeyProvider | undefined;

export function getFileKeyProvider(): FileKeyProvider {
  provider ??= getConfig().FILE_KEY_PROVIDER === "aws-kms"
    ? new AwsKmsFileKeyProvider()
    : getConfig().FILE_KEY_PROVIDER === "cloudflare-secret"
      ? new CloudflareSecretFileKeyProvider()
      : new LocalFileKeyProvider();
  return provider;
}

export function resetFileKeyProviderForTests(): void {
  if (getConfig().NODE_ENV !== "test") throw new Error("File key provider reset is test-only");
  provider = undefined;
}
