import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { AGENT_PRESETS, type AgentPreset } from "./agentPresets";

export function Toolbar({
  onAddAgent,
  onAddTaskList,
}: {
  onAddAgent: (preset: AgentPreset) => void;
  onAddTaskList: () => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        zIndex: 4,
        display: "flex",
        gap: 8,
        alignItems: "center",
        background: "rgba(15,15,20,0.85)",
        backdropFilter: "blur(8px)",
        padding: "8px 10px",
        borderRadius: 8,
        border: "1px solid #2a2a36",
        fontFamily: "ui-monospace, monospace",
        fontSize: 12,
        flexWrap: "wrap",
      }}
    >
      <Link to="/" style={{ color: "#8af", textDecoration: "none" }}>
        &larr; Dashboard
      </Link>
      <span style={{ width: 1, height: 16, background: "#333" }} />
      {AGENT_PRESETS.map((p) => (
        <button
          key={p.key}
          onClick={() => onAddAgent(p)}
          style={{ ...btn, borderColor: p.accent + "88" }}
        >
          + {p.label}
        </button>
      ))}
      <span style={{ width: 1, height: 16, background: "#333" }} />
      <button onClick={onAddTaskList} style={btn}>
        + Task list
      </button>
    </div>
  );
}

const btn: CSSProperties = {
  padding: "4px 10px",
  background: "#2a2a3a",
  border: "1px solid #3a3a4a",
  borderRadius: 4,
  color: "#eaeaea",
  cursor: "pointer",
  fontSize: 12,
  fontFamily: "inherit",
};
