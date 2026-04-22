import type { NodeProps } from "reactflow";

export function TaskListNodePlaceholder({ data }: NodeProps) {
  const title = (data as { title?: string })?.title ?? "task list";
  return (
    <div
      style={{
        width: 220,
        minHeight: 120,
        background: "#1a1a28",
        border: "1px solid #6d6d96",
        borderRadius: 8,
        color: "#ddd",
        fontSize: 12,
        fontFamily: "ui-monospace, monospace",
        padding: 10,
        boxSizing: "border-box",
      }}
    >
      <strong style={{ color: "#fff" }}>&#9745; {title}</strong>
      <div style={{ opacity: 0.5, marginTop: 8, fontSize: 11 }}>
        Task-list placeholder
        <br />
        (wired in Task 18)
      </div>
    </div>
  );
}
