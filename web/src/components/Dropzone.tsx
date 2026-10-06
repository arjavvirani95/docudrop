import { useRef, useState } from "react";

export function Dropzone({ onFiles, disabled }: { onFiles: (files: File[]) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(false);

  return (
    <div
      className={`dropzone${active ? " active" : ""}`}
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      onClick={() => !disabled && input.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setActive(true);
      }}
      onDragLeave={() => setActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setActive(false);
        if (!disabled) onFiles([...e.dataTransfer.files]);
      }}
    >
      <strong>Drop files here</strong> or click to choose
      <div className="muted" style={{ marginTop: 6, fontSize: 14 }}>
        PDF, images, Office docs, ZIP, CSV · up to 100 MB each
      </div>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
