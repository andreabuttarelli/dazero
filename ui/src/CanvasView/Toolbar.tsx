import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import type { AgentPreset } from "../types";

export function Toolbar({
  presets,
  onAddAgent,
  onAddTaskList,
  current,
  max,
}: {
  presets: AgentPreset[];
  onAddAgent: (preset: AgentPreset) => void;
  onAddTaskList: () => void;
  current: number;
  max: number;
}) {
  const full = current >= max;

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
        minWidth: 0,
      }}
    >
      <Link to="/" style={{ color: "#8af", textDecoration: "none" }}>
        &larr; Dashboard
      </Link>
      <span style={{ width: 1, height: 16, background: "#333" }} />
      {presets.map((p) => (
        <button
          key={p.key}
          onClick={() => onAddAgent(p)}
          disabled={full}
          title={full ? "Budget full — close a terminal first" : undefined}
          style={{
            ...btn,
            borderLeft: `2px solid ${p.accent}`,
            opacity: full ? 0.4 : 1,
            cursor: full ? "not-allowed" : "pointer",
          }}
        >
          + {p.label}
        </button>
      ))}
      <span style={{ width: 1, height: 16, background: "#333" }} />
      <button onClick={onAddTaskList} style={btn}>
        + Task list
      </button>
      <span style={{ flex: 1, minWidth: 8 }} />
      <span
        style={{
          fontSize: 11,
          color: full ? "#f77" : "#888",
          fontFamily: "ui-monospace, monospace",
          whiteSpace: "nowrap",
        }}
        title={`${current} of ${max} concurrent agents in use`}
      >
        agents {current}/{max}
      </span>
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
