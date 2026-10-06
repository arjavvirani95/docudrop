import type { Drop, DropStore, ObjectStorage, StoredFile } from "./ports.js";

export class MemoryDropStore implements DropStore {
  drops = new Map<string, Drop>();
  files: StoredFile[] = [];
  async createDrop(drop: Drop) { this.drops.set(drop.dropId, drop); }
  async getDrop(id: string) {
    const d = this.drops.get(id);
    return d && d.expiresAt * 1000 >= Date.now() ? d : undefined;
  }
  async addFile(file: StoredFile) { this.files.push(file); }
  async listFiles(id: string) { return this.files.filter((f) => f.dropId === id); }
}

export class FakeStorage implements ObjectStorage {
  objects = new Map<string, { size: number; contentType: string }>();
  async presignUpload(key: string, contentType: string) {
    return { url: "https://bucket.example/", fields: { key, "Content-Type": contentType } };
  }
  async presignDownload(key: string) { return `https://bucket.example/${key}?sig=1`; }
  async head(key: string) {
    const o = this.objects.get(key);
    if (!o) throw new Error("NoSuchKey");
    return o;
  }
}
