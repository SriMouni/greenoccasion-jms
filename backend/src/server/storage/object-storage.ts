import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type UploadBufferInput = {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
  metadata?: Record<string, string>;
};

export type UploadBufferResult = {
  bucket: string;
  key: string;
  etag?: string;
};

export interface ObjectStorage {
  uploadBuffer(input: UploadBufferInput): Promise<UploadBufferResult>;
  createSignedReadUrl(key: string, expiresInSeconds?: number): Promise<string>;
  objectExists(key: string): Promise<boolean>;
  getObjectStream(key: string): Promise<Readable>;
}

export class S3ObjectStorage implements ObjectStorage {
  constructor(
    private readonly bucket: string,
    private readonly client: S3Client,
  ) {}

  async uploadBuffer(input: UploadBufferInput): Promise<UploadBufferResult> {
    const result = await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        Metadata: input.metadata,
      }),
    );

    return {
      bucket: this.bucket,
      key: input.key,
      etag: result.ETag,
    };
  }

  async createSignedReadUrl(
    key: string,
    expiresInSeconds = 300,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  async objectExists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

      return true;
    } catch (error) {
      if (isObjectNotFoundError(error)) return false;
      throw error;
    }
  }

  async getObjectStream(key: string): Promise<Readable> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return result.Body as Readable;
  }
}

/**
 * Filesystem-backed object storage for the minimal stack (no cloud bucket).
 *
 * Files are written under PDF_STORAGE_DIR (default ./uploads). The download route in
 * server.ts resolves these paths back to disk, so a stored `key` doubles as the paper's
 * file_path. createSignedReadUrl returns a relative `/uploads/<key>` URL since the app
 * streams files through its own download endpoint rather than a presigned bucket URL.
 */
export class LocalDiskObjectStorage implements ObjectStorage {
  constructor(private readonly baseDir: string) {}

  private resolveKey(key: string): string {
    const target = path.resolve(this.baseDir, key);
    const root = path.resolve(this.baseDir);

    // Guard against path traversal escaping the storage root.
    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new Error(`Refusing to write outside storage root: ${key}`);
    }

    return target;
  }

  async uploadBuffer(input: UploadBufferInput): Promise<UploadBufferResult> {
    const target = this.resolveKey(input.key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, input.body);

    return { bucket: this.baseDir, key: input.key };
  }

  async createSignedReadUrl(key: string): Promise<string> {
    return `/uploads/${key.split(path.sep).join("/")}`;
  }

  async objectExists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }

  async getObjectStream(key: string): Promise<Readable> {
    return createReadStream(this.resolveKey(key));
  }
}

/**
 * Select a storage driver from the environment.
 *   STORAGE_DRIVER=local (default) -> LocalDiskObjectStorage under PDF_STORAGE_DIR
 *   STORAGE_DRIVER=s3              -> S3ObjectStorage (requires STORAGE_BUCKET)
 * Local is the default so importing this module never requires cloud credentials.
 */
export function createObjectStorageFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ObjectStorage {
  const driver = (env.STORAGE_DRIVER ?? "local").toLowerCase();

  if (driver === "local") {
    const baseDir = path.resolve(env.PDF_STORAGE_DIR || "./uploads");
    return new LocalDiskObjectStorage(baseDir);
  }

  const bucket = requiredEnv(env.STORAGE_BUCKET, "STORAGE_BUCKET");

  const credentials =
    env.STORAGE_ACCESS_KEY_ID && env.STORAGE_SECRET_ACCESS_KEY
      ? {
          accessKeyId: env.STORAGE_ACCESS_KEY_ID,
          secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
        }
      : undefined;

  return new S3ObjectStorage(
    bucket,
    new S3Client({
      region: env.STORAGE_REGION ?? "us-east-1",
      endpoint: env.STORAGE_ENDPOINT,
      forcePathStyle: env.STORAGE_FORCE_PATH_STYLE === "true",
      credentials,
    }),
  );
}

export const objectStorage = createObjectStorageFromEnv();

function requiredEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function isObjectNotFoundError(error: unknown): boolean {
  const candidate = error as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };

  return (
    candidate.$metadata?.httpStatusCode === 404 ||
    candidate.name === "NotFound" ||
    candidate.name === "NoSuchKey"
  );
}