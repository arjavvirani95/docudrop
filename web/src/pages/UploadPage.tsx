import { useState } from "react";
import { createDrop, uploadFile } from "../api";
import { Dropzone } from "../components/Dropzone";
import { formatBytes } from "../format";

interface Item {
  id: string;
  file: File;
  progress: number;
  error?: string;
}

export function UploadPage() {
  const [dropId, setDropId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const patch = (id: string, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));

  async function handleFiles(files: File[]) {
    setError(null);
    let id = dropId;
    try {
      if (!id) {
        id = (await createDrop()).dropId;
        setDropId(id);
      }
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    const added = files.map((file) => ({ id: crypto.randomUUID(), file, progress: 0 }));
    setItems((xs) => [...xs, ...added]);
    // Upload a few at a time to keep the browser responsive on big batches.
    const queue = [...added];
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        try {
          await uploadFile(id!, item.file, (p) => patch(item!.id, { progress: p }));
          patch(item.id, { progress: 1 });
        } catch (e) {
          patch(item.id, { error: (e as Error).message });
        }
      }
    };
    await Promise.all(Array.from({ length: 3 }, worker));
  }

  const shareUrl = dropId ? `${location.origin}/d/${dropId}` : "";

  return (
    <main>
      <h1>Docudrop</h1>
      <p className="muted">Share files with a private link that expires after 7 days. No account needed.</p>

      <Dropzone onFiles={handleFiles} />
      {error && <p className="error">{error}</p>}

      {items.length > 0 && (
        <section className="card">
          <ul className="files">
            {items.map((it) => (
              <li key={it.id}>
                <div className="name">
                  {it.file.name} <span className="muted">· {formatBytes(it.file.size)}</span>
                  {it.error ? (
                    <div className="error">{it.error}</div>
                  ) : (
                    <div className="progress" aria-label={`${Math.round(it.progress * 100)}% uploaded`}>
                      <div style={{ width: `${it.progress * 100}%` }} />
                    </div>
                  )}
                </div>
                <span className="muted">{it.error ? "failed" : it.progress >= 1 ? "✓" : `${Math.round(it.progress * 100)}%`}</span>
              </li>
            ))}
          </ul>

          {dropId && (
            <div className="share">
              <input readOnly value={shareUrl} onFocus={(e) => e.target.select()} aria-label="Share link" />
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(shareUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
