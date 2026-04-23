import { useState, useRef, useEffect } from "react";
import type { NodeProps } from "reactflow";
import { NodeResizer } from "reactflow";
import { api, ApiHttpError } from "../../lib/api";
import type { Task } from "../../types";
import { useCanvasStore } from "../../store/canvasStore";

type TaskListData = {
  title?: string;
  task_list_id?: string;
  tasks?: Task[];
};

export function TaskListNode({ id, data, selected }: NodeProps) {
  const d = data as TaskListData;
  const [title, setTitle] = useState(d.title ?? "todo");
  const [editingTitle, setEditingTitle] = useState(false);
  const [tasks, setTasks] = useState<Task[]>(d.tasks ?? []);
  const [adding, setAdding] = useState(false);
  const [newDesc, setNewDesc] = useState("");
  const newDescRef = useRef<HTMLInputElement | null>(null);
  const removeNode = useCanvasStore((s) => s.removeNodeFromCanvas);

  const tlId = d.task_list_id;

  useEffect(() => {
    if (adding) newDescRef.current?.focus();
  }, [adding]);

  const addTask = async () => {
    if (!tlId || !newDesc.trim()) {
      setAdding(false);
      setNewDesc("");
      return;
    }
    try {
      const t = await api.tasks.create(tlId, newDesc.trim());
      setTasks((cur) => [...cur, t]);
    } catch (e) {
      alert(e instanceof ApiHttpError ? e.message : String(e));
    } finally {
      setNewDesc("");
      setAdding(false);
    }
  };

  const toggleTask = async (task: Task) => {
    const nextStatus = task.status === "pending" ? "done" : "pending";
    setTasks((cur) =>
      cur.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t))
    );
    try {
      await api.tasks.update(task.id, { status: nextStatus });
    } catch {
      /* rollback could be added; skip for M2 */
    }
  };

  const editTaskDescription = async (task: Task, desc: string) => {
    if (desc.trim() === task.description) return;
    setTasks((cur) =>
      cur.map((t) => (t.id === task.id ? { ...t, description: desc } : t))
    );
    try {
      await api.tasks.update(task.id, { description: desc.trim() });
    } catch {
      /* skip rollback */
    }
  };

  const deleteTask = async (task: Task) => {
    setTasks((cur) => cur.filter((t) => t.id !== task.id));
    try {
      await api.tasks.delete(task.id);
    } catch {
      /* skip */
    }
  };

  const onClose = async () => {
    if (removeNode) await removeNode(id);
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minWidth: 240,
        minHeight: 180,
        background: "#15151c",
        border: `1px solid ${selected ? "#7a7acc" : "#3a3a52"}`,
        borderRadius: 8,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        fontFamily: "ui-monospace, monospace",
        fontSize: 12,
        color: "#ddd",
        overflow: "hidden",
      }}
    >
      <NodeResizer
        minWidth={240}
        minHeight={180}
        handleStyle={{ width: 8, height: 8 }}
        onResizeEnd={(_, { width, height }) => {
          api.canvas.updateNode(id, { width, height }).catch(() => {});
        }}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "4px 8px",
          background: "#1a1a28",
          borderBottom: "1px solid #2a2a3e",
        }}
      >
        {editingTitle ? (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={async () => {
              setEditingTitle(false);
              await api.canvas
                .updateNode(id, { data: { ...d, title } })
                .catch(() => {});
            }}
            style={titleInputStyle}
          />
        ) : (
          <span
            onDoubleClick={() => setEditingTitle(true)}
            style={{ cursor: "text" }}
          >
            &#9745; {title}
          </span>
        )}
        <button onClick={onClose} title="close" style={closeBtnStyle}>
          ×
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 6 }}>
        {tasks.length === 0 && !adding && (
          <div style={{ opacity: 0.4, padding: 8, fontSize: 11 }}>
            Empty. Click + to add.
          </div>
        )}
        {tasks.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            onToggle={() => toggleTask(t)}
            onEdit={(desc) => editTaskDescription(t, desc)}
            onDelete={() => deleteTask(t)}
          />
        ))}
      </div>

      <div
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          padding: 6,
          borderTop: "1px solid #2a2a3e",
          background: "#121220",
        }}
      >
        {adding ? (
          <input
            ref={newDescRef}
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addTask();
              if (e.key === "Escape") {
                setAdding(false);
                setNewDesc("");
              }
            }}
            onBlur={addTask}
            placeholder="describe a task…"
            style={addInputStyle}
          />
        ) : (
          <button onClick={() => setAdding(true)} style={addBtnStyle}>
            + Add task
          </button>
        )}
      </div>
    </div>
  );
}

function TaskRow({
  task,
  onToggle,
  onEdit,
  onDelete,
}: {
  task: Task;
  onToggle: () => void;
  onEdit: (d: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [desc, setDesc] = useState(task.description);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 6px",
        borderRadius: 4,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#1e1e2a")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <input
        type="checkbox"
        checked={task.status === "done"}
        onChange={onToggle}
        style={{ cursor: "pointer" }}
      />
      {editing ? (
        <input
          autoFocus
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setEditing(false);
              onEdit(desc);
            }
            if (e.key === "Escape") {
              setEditing(false);
              setDesc(task.description);
            }
          }}
          onBlur={() => {
            setEditing(false);
            onEdit(desc);
          }}
          style={{ flex: 1, ...addInputStyle }}
        />
      ) : (
        <span
          onDoubleClick={() => setEditing(true)}
          style={{
            flex: 1,
            cursor: "text",
            textDecoration: task.status === "done" ? "line-through" : "none",
            opacity: task.status === "done" ? 0.5 : 1,
          }}
        >
          {task.description}
        </span>
      )}
      <button onClick={onDelete} title="delete" style={xBtnStyle}>
        ×
      </button>
    </div>
  );
}

const titleInputStyle: React.CSSProperties = {
  flex: 1,
  background: "transparent",
  border: "none",
  color: "inherit",
  fontFamily: "inherit",
  fontSize: "inherit",
  outline: "none",
};
const addInputStyle: React.CSSProperties = {
  flex: 1,
  padding: "4px 6px",
  background: "#0b0b0f",
  border: "1px solid #2a2a36",
  borderRadius: 4,
  color: "inherit",
  fontFamily: "inherit",
  fontSize: "inherit",
};
const addBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: "4px 8px",
  background: "transparent",
  border: "1px dashed #3a3a52",
  borderRadius: 4,
  color: "#888",
  fontFamily: "inherit",
  fontSize: 11,
  cursor: "pointer",
};
const closeBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#aaa",
  cursor: "pointer",
  fontSize: 14,
  padding: "0 4px",
};
const xBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#666",
  cursor: "pointer",
  fontSize: 12,
  padding: 0,
};

// Compat alias so existing nodeTypes registration keeps working
export { TaskListNode as TaskListNodePlaceholder };
