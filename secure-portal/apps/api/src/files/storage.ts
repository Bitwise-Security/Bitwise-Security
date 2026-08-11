import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getConfig } from "../config.js";

export interface UploadPartDescriptor {
  partNumber: number;
  etag: string;
}

export interface StorageAdapter {
  createUpload(storageKey: string): Promise<string>;
  createPartUrl(storageKey: string, uploadId: string, partNumber: number, contentLength: number): Promise<string | null>;
  writeProxyPart(storageKey: string, uploadId: string, partNumber: number, body: Buffer): Promise<string>;
  completeUpload(storageKey: string, uploadId: string, parts: UploadPartDescriptor[]): Promise<void>;
  abortUpload(storageKey: string, uploadId: string): Promise<void>;
  readPart(storageKey: string, partNumber: number, offset: number, length: number): Promise<Buffer>;
  deleteObject(storageKey: string): Promise<void>;
  mode: "local" | "s3" | "r2-binding";
}

function assertIdentifier(value: string): void {
  if (!/^[a-zA-Z0-9_-]{16,100}$/u.test(value)) throw new Error("Invalid storage identifier");
}

class LocalStorageAdapter implements StorageAdapter {
  public readonly mode = "local" as const;
  private readonly root = path.resolve(getConfig().LOCAL_STORAGE_PATH);

  private uploadPath(uploadId: string): string {
    assertIdentifier(uploadId);
    return path.join(this.root, ".uploads", uploadId);
  }

  private objectPath(storageKey: string): string {
    assertIdentifier(storageKey);
    return path.join(this.root, "objects", storageKey);
  }

  public async createUpload(storageKey: string): Promise<string> {
    void storageKey;
    const uploadId = randomUUID().replaceAll("-", "");
    await mkdir(this.uploadPath(uploadId), { recursive: true, mode: 0o700 });
    return uploadId;
  }

  public createPartUrl(): Promise<null> {
    return Promise.resolve(null);
  }

  public async writeProxyPart(_storageKey: string, uploadId: string, partNumber: number, body: Buffer): Promise<string> {
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000) throw new Error("Invalid part number");
    const filename = `part-${String(partNumber).padStart(5, "0")}.bin`;
    await writeFile(path.join(this.uploadPath(uploadId), filename), body, { mode: 0o600 });
    return createHash("sha256").update(body).digest("hex");
  }

  public async completeUpload(
    storageKey: string,
    uploadId: string,
    parts: UploadPartDescriptor[],
  ): Promise<void> {
    if (parts.length === 0) throw new Error("No upload parts");
    const destination = this.objectPath(storageKey);
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    await rename(this.uploadPath(uploadId), destination);
  }

  public async abortUpload(_storageKey: string, uploadId: string): Promise<void> {
    await rm(this.uploadPath(uploadId), { recursive: true, force: true });
  }

  public async readPart(storageKey: string, partNumber: number, offset: number, length: number): Promise<Buffer> {
    const filename = `part-${String(partNumber).padStart(5, "0")}.bin`;
    const content = await readFile(path.join(this.objectPath(storageKey), filename));
    return content.subarray(offset, offset + length);
  }

  public async deleteObject(storageKey: string): Promise<void> {
    await rm(this.objectPath(storageKey), { recursive: true, force: true });
  }
}

class S3StorageAdapter implements StorageAdapter {
  public readonly mode = "s3" as const;
  private readonly config = getConfig();
  private readonly client = new S3Client({
    endpoint: this.config.S3_ENDPOINT!,
    region: this.config.S3_REGION,
    credentials: {
      accessKeyId: this.config.S3_ACCESS_KEY_ID!,
      secretAccessKey: this.config.S3_SECRET_ACCESS_KEY!,
    },
  });
  private readonly bucket = this.config.S3_BUCKET!;

  public async createUpload(storageKey: string): Promise<string> {
    const response = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: storageKey,
        ContentType: "application/octet-stream",
        CacheControl: "no-store",
        Metadata: { encrypted: "aes-256-gcm-chunks", version: "1" },
      }),
    );
    if (!response.UploadId) throw new Error("Object storage did not create a multipart upload");
    return response.UploadId;
  }

  public createPartUrl(
    storageKey: string,
    uploadId: string,
    partNumber: number,
    contentLength: number,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: storageKey,
        UploadId: uploadId,
        PartNumber: partNumber,
        ContentLength: contentLength,
      }),
      { expiresIn: 300 },
    );
  }

  public writeProxyPart(): Promise<string> {
    throw new Error("Proxy parts are disabled for S3 storage");
  }

  public async completeUpload(storageKey: string, uploadId: string, parts: UploadPartDescriptor[]): Promise<void> {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: storageKey,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((part) => ({ ETag: part.etag, PartNumber: part.partNumber })),
        },
      }),
    );
  }

  public async abortUpload(storageKey: string, uploadId: string): Promise<void> {
    await this.client.send(
      new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: storageKey, UploadId: uploadId }),
    );
  }

  public async readPart(storageKey: string, _partNumber: number, offset: number, length: number): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Range: `bytes=${offset}-${offset + length - 1}`,
      }),
    );
    if (!response.Body) throw new Error("Object storage returned an empty body");
    return Buffer.from(await response.Body.transformToByteArray());
  }

  public async deleteObject(storageKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }));
  }
}

class R2BindingStorageAdapter implements StorageAdapter {
  public readonly mode = "r2-binding" as const;
  private readonly origin = getConfig().R2_BINDING_ORIGIN;

  private async checkedFetch(pathname: string, init: RequestInit): Promise<Response> {
    const response = await fetch(new URL(pathname, this.origin), {
      ...init,
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`R2 binding operation failed with HTTP ${response.status}`);
    return response;
  }

  public async createUpload(storageKey: string): Promise<string> {
    const response = await this.checkedFetch("/multipart/create", {
      method: "POST",
      headers: { "x-storage-key": storageKey },
    });
    const body = await response.json() as { uploadId?: unknown };
    if (typeof body.uploadId !== "string" || body.uploadId.length < 1) {
      throw new Error("R2 binding did not return a multipart upload ID");
    }
    return body.uploadId;
  }

  public createPartUrl(): Promise<null> {
    return Promise.resolve(null);
  }

  public async writeProxyPart(
    storageKey: string,
    uploadId: string,
    partNumber: number,
    body: Buffer,
  ): Promise<string> {
    const response = await this.checkedFetch("/multipart/part", {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(body.length),
        "x-storage-key": storageKey,
        "x-upload-id": uploadId,
        "x-part-number": String(partNumber),
      },
      body: Uint8Array.from(body).buffer,
    });
    const result = await response.json() as { etag?: unknown };
    if (typeof result.etag !== "string" || result.etag.length < 1) {
      throw new Error("R2 binding did not return a part ETag");
    }
    return result.etag;
  }

  public async completeUpload(
    storageKey: string,
    uploadId: string,
    parts: UploadPartDescriptor[],
  ): Promise<void> {
    await this.checkedFetch("/multipart/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-storage-key": storageKey,
        "x-upload-id": uploadId,
      },
      body: JSON.stringify(parts),
    });
  }

  public async abortUpload(storageKey: string, uploadId: string): Promise<void> {
    await this.checkedFetch("/multipart", {
      method: "DELETE",
      headers: { "x-storage-key": storageKey, "x-upload-id": uploadId },
    });
  }

  public async readPart(
    storageKey: string,
    _partNumber: number,
    offset: number,
    length: number,
  ): Promise<Buffer> {
    const response = await this.checkedFetch("/object", {
      method: "GET",
      headers: {
        "x-storage-key": storageKey,
        "x-range-offset": String(offset),
        "x-range-length": String(length),
      },
    });
    const result = Buffer.from(await response.arrayBuffer());
    if (result.length !== length) throw new Error("R2 binding returned an invalid object range");
    return result;
  }

  public async deleteObject(storageKey: string): Promise<void> {
    await this.checkedFetch("/object", {
      method: "DELETE",
      headers: { "x-storage-key": storageKey },
    });
  }
}

let storage: StorageAdapter | undefined;

export function getStorage(): StorageAdapter {
  storage ??= getConfig().STORAGE_MODE === "s3"
    ? new S3StorageAdapter()
    : getConfig().STORAGE_MODE === "r2-binding"
      ? new R2BindingStorageAdapter()
      : new LocalStorageAdapter();
  return storage;
}
