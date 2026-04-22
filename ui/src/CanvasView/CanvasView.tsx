import { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node as RfNode,
  type Viewport,
} from "reactflow";
import "reactflow/dist/style.css";
import { api, ApiHttpError } from "../lib/api";
import type { CanvasNode } from "../types";
import { TerminalNodePlaceholder } from "./nodes/TerminalNode";
import { TaskListNodePlaceholder } from "./nodes/TaskListNode";
import { Toolbar } from "./Toolbar";

const nodeTypes = {
  terminal: TerminalNodePlaceholder,
  task_list: TaskListNodePlaceholder,
};

function apiNodeToRf(n: CanvasNode): RfNode {
  return {
    id: n.id,
    type: n.kind,
    position: { x: n.position_x, y: n.position_y },
    data: n.data,
    style:
      n.width && n.height
        ? { width: n.width, height: n.height }
        : undefined,
  };
}

export function CanvasView() {
  const { id: projectId } = useParams<{ id: string }>();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, , onEdgesChange] = useEdgesState([]);
  const canvasIdRef = useRef<string | null>(null);
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 });
  const patchTimer = useRef<number | null>(null);

  // Load project + canvas on mount
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void (async () => {
      try {
        const proj = await api.projects.get(projectId);
        if (cancelled) return;
        canvasIdRef.current = proj.canvas_id;
        const canvas = await api.canvas.get(proj.canvas_id);
        if (cancelled) return;
        setNodes(canvas.nodes.map(apiNodeToRf));
        viewportRef.current = canvas.viewport;
      } catch (e) {
        console.error("failed to load canvas", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, setNodes]);

  const onMove = (_: MouseEvent | TouchEvent, v: Viewport) => {
    viewportRef.current = v;
    if (patchTimer.current) window.clearTimeout(patchTimer.current);
    patchTimer.current = window.setTimeout(() => {
      if (canvasIdRef.current) {
        api.canvas
          .patchViewport(canvasIdRef.current, v)
          .catch(() => {
            /* ignore */
          });
      }
    }, 500);
  };

  const addNode = async (kind: "terminal" | "task_list") => {
    if (!canvasIdRef.current) return;
    const center = { x: 120, y: 120 };
    try {
      const created = await api.canvas.createNode(canvasIdRef.current, {
        kind,
        position_x: center.x,
        position_y: center.y,
        data: { title: kind === "terminal" ? "shell" : "todo" },
      });
      setNodes((cur) => [...cur, apiNodeToRf(created)]);
    } catch (e) {
      alert(
        `create node failed: ${e instanceof ApiHttpError ? e.message : String(e)}`
      );
    }
  };

  return (
    <div style={{ height: "100vh", width: "100vw", background: "#0b0b0f" }}>
      <Toolbar
        onAddTerminal={() => void addNode("terminal")}
        onAddTaskList={() => void addNode("task_list")}
      />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onMove={onMove}
        defaultViewport={viewportRef.current}
        proOptions={{ hideAttribution: true }}
        style={{ background: "#0b0b0f" }}
      >
        <Background color="#222" gap={16} />
        <Controls style={{ background: "#13131a", borderRadius: 6 }} />
        <MiniMap
          nodeColor={() => "#3a5cff"}
          maskColor="rgba(0,0,0,0.5)"
          style={{ background: "#13131a" }}
        />
      </ReactFlow>
    </div>
  );
}
