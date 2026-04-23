import { useState } from "react";
import { api, ApiHttpError } from "../lib/api";
import type { Project } from "../types";

type Tab = "folder" | "clone";

export function NewProjectWizard({
  onClose, onCreated,
}: {
  onClose: () => void;
  onCreated: (p: Project) => void;
}) {
  const [tab, setTab] = useState<Tab>("folder");
  const [path, setPath] = useState("");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickFolder = async () => {
    try {
      const r = await fetch("/api/system/pick-directory", { method: "POST" });
      if (r.status === 204) return;
      if (r.status === 501) {
        setError("Folder picker not supported on your OS. Paste the path manually.");
        return;
      }
      if (!r.ok) { setError("Picker failed: " + await r.text()); return; }
      const j = await r.json() as { path: string };
      setPath(j.path);
    } catch (e) { setError(String(e)); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      let created: Project;
      if (tab === "folder") {
        if (!path.trim()) { setError("path is required"); setBusy(false); return; }
        created = await api.projects.createFolder(path.trim(), name.trim() || undefined);
      } else {
        if (!url.trim()) { setError("git URL is required"); setBusy(false); return; }
        created = await api.projects.createClone(url.trim(), name.trim() || undefined);
      }
      onCreated(created);
    } catch (e: unknown) {
      setError(e instanceof ApiHttpError ? `${e.code}: ${e.message}` : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "grid", placeItems: "center",
        zIndex: 10,
      }}
    >
      <form
        onSubmit={submit}
        style={{
          background: "#15151c",
          border: "1px solid #2a2a36",
          borderRadius: 12,
          padding: 24,
          width: 480,
          maxWidth: "90vw",
          display: "flex", flexDirection: "column", gap: 14,
          color: "#eaeaea",
          fontFamily: "ui-monospace, monospace",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>New project</h2>

        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #2a2a36", paddingBottom: 0 }}>
          <TabButton active={tab === "folder"} onClick={() => setTab("folder")}>Folder</TabButton>
          <TabButton active={tab === "clone"}  onClick={() => setTab("clone")}>Clone URL</TabButton>
        </div>

        {tab === "folder" ? (
          <label style={labelStyle}>
            Absolute path
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/Users/you/code/myproject"
                style={{ flex: 1, ...inputStyle }}
                autoFocus
              />
              <button
                type="button"
                onClick={() => void pickFolder()}
                title="Open native folder picker"
                style={{ ...buttonSecondary, padding: "8px 10px" }}
              >
                📁
              </button>
            </div>
          </label>
        ) : (
          <label style={labelStyle}>
            Git URL
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/user/repo.git"
              style={inputStyle}
              autoFocus
            />
          </label>
        )}

        <label style={labelStyle}>
          Display name <span style={{ opacity: 0.5 }}>(optional)</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={tab === "folder" ? "leave empty to use folder name" : "leave empty to use repo name"}
            style={inputStyle}
          />
        </label>

        {error && (
          <div style={{
            padding: 10, background: "#2a1414", border: "1px solid #a33",
            borderRadius: 6, fontSize: 12,
          }}>{error}</div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
          <button type="button" onClick={onClose} disabled={busy} style={buttonSecondary}>Cancel</button>
          <button type="submit" disabled={busy} style={buttonPrimary}>
            {busy ? (tab === "clone" ? "Cloning\u2026" : "Creating\u2026") : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}

function TabButton({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "transparent",
        color: active ? "#eaeaea" : "#888",
        border: "none",
        borderBottom: active ? "2px solid #6a8cff" : "2px solid transparent",
        padding: "8px 14px",
        cursor: "pointer",
        fontSize: 13,
        fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}

const labelStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 6, fontSize: 12, opacity: 0.85,
};

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  background: "#0b0b0f",
  border: "1px solid #2a2a36",
  borderRadius: 6,
  color: "#eaeaea",
  fontFamily: "inherit",
  fontSize: 13,
};

const buttonSecondary: React.CSSProperties = {
  padding: "8px 14px",
  background: "transparent",
  color: "#ccc",
  border: "1px solid #3a3a48",
  borderRadius: 6,
  cursor: "pointer",
};

const buttonPrimary: React.CSSProperties = {
  padding: "8px 14px",
  background: "#3a5cff",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 600,
};
