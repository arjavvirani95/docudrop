export interface DropFile {
  fileId: string;
  filename: string;
  size: number;
  contentType: string;
  uploadedAt: string;
  downloadUrl: string;
}

export interface Drop {
  dropId: string;
  createdAt: string;
  expiresAt: number;
  files: DropFile[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const createDrop = () => request<{ dropId: string; expiresAt: number }>("/drops", { method: "POST" });

export const getDrop = (dropId: string) => request<Drop>(`/drops/${dropId}`);

/** Gets a presigned POST for the file, then uploads directly to S3 with progress events. */
export async function uploadFile(dropId: string, file: File, onProgress: (fraction: number) => void): Promise<void> {
  const { upload } = await request<{ upload: { url: string; fields: Record<string, string> } }>(
    `/drops/${dropId}/uploads`,
    {
      method: "POST",
      body: JSON.stringify({ filename: file.name, contentType: file.type || "application/octet-stream", size: file.size }),
    },
  );

  const form = new FormData();
  for (const [k, v] of Object.entries(upload.fields)) form.append(k, v);
  form.append("file", file); // must be the last field

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", upload.url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(form);
  });
}
