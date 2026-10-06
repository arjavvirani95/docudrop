import { useEffect, useState } from "react";
import { getDrop, type Drop } from "../api";
import { formatBytes, timeLeft } from "../format";

export function DropPage({ dropId }: { dropId: string }) {
  const [drop, setDrop] = useState<Drop | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDrop(dropId).then(setDrop, (e: Error) => setError(e.message));
  }, [dropId]);

  return (
    <main>
      <h1>Shared files</h1>
      {error && <p className="error">{error}</p>}
      {!drop && !error && <p className="muted">Loading…</p>}
      {drop && (
        <>
          <p className="muted">
            {drop.files.length} file{drop.files.length === 1 ? "" : "s"} · {timeLeft(drop.expiresAt)}
          </p>
          <section className="card">
            {drop.files.length === 0 ? (
              <p className="muted">No files yet. Uploads may take a few seconds to appear.</p>
            ) : (
              <ul className="files">
                {drop.files.map((f) => (
                  <li key={f.fileId}>
                    <span className="name">{f.filename}</span>
                    <span className="muted">{formatBytes(f.size)}</span>
                    <a href={f.downloadUrl}>Download</a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      <p style={{ marginTop: 24 }}>
        <a href="/">Create your own drop →</a>
      </p>
    </main>
  );
}
