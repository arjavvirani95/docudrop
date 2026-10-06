export interface Drop {
  dropId: string;
  createdAt: string;
  expiresAt: number; // epoch seconds
}

export interface StoredFile {
  dropId: string;
  fileId: string;
  key: string;
  filename: string;
  size: number;
  contentType: string;
  uploadedAt: string;
}

export interface DropStore {
  createDrop(drop: Drop): Promise<void>;
  getDrop(dropId: string): Promise<Drop | undefined>;
  addFile(file: StoredFile, expiresAt: number): Promise<void>;
  listFiles(dropId: string): Promise<StoredFile[]>;
}

export interface PresignedPost {
  url: string;
  fields: Record<string, string>;
}

export interface ObjectStorage {
  presignUpload(key: string, contentType: string, size: number): Promise<PresignedPost>;
  presignDownload(key: string, filename: string): Promise<string>;
  head(key: string): Promise<{ size: number; contentType: string }>;
}
