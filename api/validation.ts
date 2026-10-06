import { randomBytes } from "node:crypto";
import { ALLOWED_TYPES, MAX_FILE_BYTES } from "./config.js";

/** URL-safe 16-character id with 96 bits of entropy, so drop links are unguessable. */
export const newDropId = () => randomBytes(12).toString("base64url");

export const isDropId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{16}$/.test(id);

/** Strips path components and unsafe characters, keeping the extension. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "_")
    .replace(/^\.+/, "")
    .slice(-120);
  return cleaned || "file";
}

export interface UploadRequest {
  filename: string;
  contentType: string;
  size: number;
}

export function validateUpload(body: Record<string, unknown>): UploadRequest | { error: string } {
  const { filename, contentType, size } = body;
  if (typeof filename !== "string" || !filename.trim()) return { error: "filename is required" };
  if (typeof contentType !== "string" || !ALLOWED_TYPES.includes(contentType)) {
    return { error: `contentType must be one of: ${ALLOWED_TYPES.join(", ")}` };
  }
  if (typeof size !== "number" || !Number.isInteger(size) || size <= 0) return { error: "size must be a positive integer" };
  if (size > MAX_FILE_BYTES) return { error: `File exceeds ${MAX_FILE_BYTES / 1024 / 1024} MB limit` };
  return { filename: sanitizeFilename(filename), contentType, size };
}

/** Object keys look like drops/<dropId>/<uuid>/<filename>. */
export function parseObjectKey(key: string): { dropId: string; fileId: string; filename: string } | null {
  const m = decodeURIComponent(key.replace(/\+/g, " ")).match(/^drops\/([A-Za-z0-9_-]{16})\/([0-9a-f-]{36})\/(.+)$/);
  return m ? { dropId: m[1], fileId: m[2], filename: m[3] } : null;
}
