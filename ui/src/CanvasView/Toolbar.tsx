import type { CSSProperties } from "react";
import { Link } from "react-router-dom";

export function Toolbar({
  onAddTerminal,
  onAddTaskList,
}: {
  onAddTerminal: () => void;
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
      }}
    >
      <Link to="/" style={{ color: "#8af", textDecoration: "none" }}>
        &larr; Dashboard
      </Link>
      <span style={{ width: 1, height: 16, background: "#333" }} />
      <button onClick={onAddTerminal} style={btn}>
        + Terminal
      </button>
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
