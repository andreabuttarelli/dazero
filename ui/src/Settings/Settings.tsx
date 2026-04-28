import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { usePresetsStore } from "../store/presetsStore";
import type { AgentPreset } from "../types";

const BUILTIN_KEYS = ["shell", "claude-code", "codex", "gemini", "opencode"];

export function Settings() {
  const presets = usePresetsStore((s) => s.presets);
  const maxAgents = usePresetsStore((s) => s.maxAgents);
  const load = usePresetsStore((s) => s.load);
  const upsert = usePresetsStore((s) => s.upsert);
  const remove = usePresetsStore((s) => s.remove);

  const [editing, setEditing] = useState<AgentPreset | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => { load().catch(console.error); }, [load]);

  return (
    <div style={{ padding: 32, maxWidth: 720, margin: "0 auto", color: "#eaeaea", fontFamily: "ui-monospace, monospace", height: "100vh", overflowY: "auto", boxSizing: "border-box" }}>
      <Link to="/" style={{ color: "#8af", textDecoration: "none" }}>← Dashboard</Link>
      <h1 style={{ marginTop: 16, fontSize: 22 }}>Settings</h1>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8, fontWeight: 600 }}>
          Agent presets{" "}
          <span style={{ opacity: 0.5, fontSize: 12, fontWeight: 400 }}>(max concurrent: {maxAgents})</span>
        </h2>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {presets.map((p) => (
            <li key={p.key} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: 12, background: "#13131a", border: `1px solid ${p.accent}`, borderRadius: 8,
            }}>
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: p.accent, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{p.label}</div>
                <div style={{ opacity: 0.6, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <code>{p.key}</code>
                  {p.initial_command && <> &middot; <code>{p.initial_command}</code></>}
                </div>
              </div>
              {BUILTIN_KEYS.includes(p.key) ? (
                <span style={{ opacity: 0.5, fontSize: 10, textTransform: "uppercase", flexShrink: 0 }}>built-in</span>
              ) : (
                <span style={{ fontSize: 10, textTransform: "uppercase", color: "#8af", flexShrink: 0 }}>custom</span>
              )}
              <button onClick={() => setEditing(p)} style={btnMinor}>Edit</button>
              <button onClick={async () => {
                try { await remove(p.key); }
                catch (e) { alert(`Can't delete: ${e}`); }
              }} style={btnMinor}>Delete</button>
            </li>
          ))}
        </ul>
        <button
          onClick={() => setAdding(true)}
          style={{ ...btnMinor, marginTop: 12, padding: "8px 14px" }}
        >
          + Add preset
        </button>
      </section>

      {(adding || editing) && (
        <PresetForm
          initial={editing ?? { key: "", label: "", initial_command: null, accent: "#6a8cff" }}
          onCancel={() => { setAdding(false); setEditing(null); }}
          onSave={async (p) => {
            await upsert(p);
            setAdding(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function PresetForm({ initial, onCancel, onSave }: {
  initial: AgentPreset;
  onCancel: () => void;
  onSave: (p: AgentPreset) => Promise<void>;
}) {
  const [p, setP] = useState<AgentPreset>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try { await onSave(p); }
    catch (err) { setError(String(err)); }
    finally { setBusy(false); }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "grid", placeItems: "center", zIndex: 10 }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <form onSubmit={(e) => void submit(e)} style={{
        background: "#15151c", border: "1px solid #2a2a36", borderRadius: 12, padding: 24, width: 420, maxWidth: "90vw",
        display: "flex", flexDirection: "column", gap: 12, color: "#eaeaea", fontFamily: "ui-monospace, monospace",
      }}>
        <strong>{initial.key ? "Edit" : "New"} preset</strong>

        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          key
          <input
            value={p.key}
            onChange={(e) => setP({ ...p, key: e.target.value })}
            placeholder="my-agent"
            disabled={!!initial.key}
            style={inp}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          label
          <input
            value={p.label}
            onChange={(e) => setP({ ...p, label: e.target.value })}
            placeholder="My Agent"
            style={inp}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          initial_command
          <input
            value={p.initial_command ?? ""}
            onChange={(e) => setP({ ...p, initial_command: e.target.value || null })}
            placeholder="leave empty for plain shell"
            style={inp}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          accent color
          <input
            value={p.accent}
            onChange={(e) => setP({ ...p, accent: e.target.value })}
            type="color"
            style={{ width: 64, height: 32, cursor: "pointer" }}
          />
        </label>

        {error && <div style={{ color: "#f77", fontSize: 11 }}>{error}</div>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel} disabled={busy} style={btnSecondary}>Cancel</button>
          <button type="submit" disabled={busy} style={btnPrimary}>Save</button>
        </div>
      </form>
    </div>
  );
}

const inp: React.CSSProperties = {
  padding: "6px 8px",
  background: "#0b0b0f",
  border: "1px solid #2a2a36",
  borderRadius: 4,
  color: "#eaeaea",
  fontFamily: "inherit",
  fontSize: 12,
  width: "100%",
  boxSizing: "border-box",
};

const btnMinor: React.CSSProperties = {
  padding: "4px 10px",
  background: "#2a2a3a",
  border: "1px solid #3a3a4a",
  borderRadius: 4,
  color: "#eaeaea",
  cursor: "pointer",
  fontSize: 12,
  flexShrink: 0,
};

const btnSecondary: React.CSSProperties = {
  padding: "6px 14px",
  background: "transparent",
  border: "1px solid #3a3a48",
  borderRadius: 4,
  color: "#ccc",
  cursor: "pointer",
};

const btnPrimary: React.CSSProperties = {
  padding: "6px 14px",
  background: "#3a5cff",
  border: "none",
  borderRadius: 4,
  color: "#fff",
  cursor: "pointer",
  fontWeight: 600,
};
