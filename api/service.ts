import { randomUUID } from "node:crypto";
import { DROP_TTL_DAYS, MAX_FILES_PER_DROP } from "./config.js";
import type { DropStore, ObjectStorage } from "./ports.js";
import { newDropId, parseObjectKey, validateUpload } from "./validation.js";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export class DropService {
  constructor(private store: DropStore, private storage: ObjectStorage, private now = () => Date.now()) {}

  async createDrop() {
    const dropId = newDropId();
    const createdAt = new Date(this.now()).toISOString();
    const expiresAt = Math.floor(this.now() / 1000) + DROP_TTL_DAYS * 86_400;
    await this.store.createDrop({ dropId, createdAt, expiresAt });
    return { dropId, expiresAt };
  }

  async requestUpload(dropId: string, body: Record<string, unknown>) {
    await this.requireDrop(dropId);
    const req = validateUpload(body);
    if ("error" in req) throw new HttpError(400, req.error);
    if ((await this.store.listFiles(dropId)).length >= MAX_FILES_PER_DROP) {
      throw new HttpError(409, `A drop can hold at most ${MAX_FILES_PER_DROP} files`);
    }
    const key = `drops/${dropId}/${randomUUID()}/${req.filename}`;
    return { key, upload: await this.storage.presignUpload(key, req.contentType, req.size) };
  }

  async getDrop(dropId: string) {
    const drop = await this.requireDrop(dropId);
    const files = await this.store.listFiles(dropId);
    files.sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
    return {
      ...drop,
      files: await Promise.all(
        files.map(async (f) => ({
          fileId: f.fileId,
          filename: f.filename,
          size: f.size,
          contentType: f.contentType,
          uploadedAt: f.uploadedAt,
          downloadUrl: await this.storage.presignDownload(f.key, f.filename),
        })),
      ),
    };
  }

  /** Called from the S3 ObjectCreated event: records the file once the upload has actually landed. */
  async recordUpload(rawKey: string) {
    const parsed = parseObjectKey(rawKey);
    if (!parsed) return false;
    const drop = await this.store.getDrop(parsed.dropId);
    if (!drop) return false;
    const key = `drops/${parsed.dropId}/${parsed.fileId}/${parsed.filename}`;
    const meta = await this.storage.head(key);
    await this.store.addFile(
      { ...parsed, key, size: meta.size, contentType: meta.contentType, uploadedAt: new Date(this.now()).toISOString() },
      drop.expiresAt,
    );
    return true;
  }

  private async requireDrop(dropId: string) {
    const drop = await this.store.getDrop(dropId);
    if (!drop) throw new HttpError(404, "Drop not found or expired");
    return drop;
  }
}
