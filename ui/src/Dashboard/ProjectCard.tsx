import type { Project } from "../types";

export function ProjectCard({ project, onOpen }: { project: Project; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      style={{
        textAlign: "left",
        background: "#13131a",
        border: "1px solid #222",
        borderRadius: 8,
        padding: 16,
        color: "#eaeaea",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        transition: "border-color 120ms",
        minWidth: 0,
        overflow: "hidden",
        fontFamily: "inherit",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#444")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#222")}
    >
      <strong
        style={{
          fontSize: 16,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: "100%",
        }}
      >
        {project.name}
      </strong>
      <span
        style={{
          opacity: 0.6,
          fontSize: 12,
          fontFamily: "ui-monospace, monospace",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          direction: "rtl",
          maxWidth: "100%",
          textAlign: "left",
        }}
        title={project.path}
      >
        {project.path}
      </span>
      {project.git_remote && (
        <span
          style={{
            opacity: 0.5,
            fontSize: 11,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "100%",
          }}
          title={project.git_remote}
        >
          {project.git_remote}
        </span>
      )}
      <span style={{ opacity: 0.4, fontSize: 11, marginTop: 4 }}>
        {project.last_opened_at
          ? `opened ${relativeTime(project.last_opened_at)}`
          : "never opened"}
      </span>
    </button>
  );
}

function relativeTime(unixSec: number): string {
  const diff = Date.now() / 1000 - unixSec;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
