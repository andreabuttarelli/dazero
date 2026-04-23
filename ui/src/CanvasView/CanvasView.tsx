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
import type { CanvasNode, TaskList } from "../types";
import { TerminalNodePlaceholder } from "./nodes/TerminalNode";
import { TaskListNodePlaceholder } from "./nodes/TaskListNode";
import { Toolbar } from "./Toolbar";
import { type AgentPreset } from "./agentPresets";
import { useCanvasStore } from "../store/canvasStore";

const nodeTypes = {
  terminal: TerminalNodePlaceholder,
  task_list: TaskListNodePlaceholder,
};

function apiNodeToRf(n: CanvasNode, taskLists: TaskList[] = []): RfNode {
  let data: Record<string, unknown> = n.data as Record<string, unknown>;
  if (n.kind === "task_list") {
    const tl = taskLists.find((t) => t.node_id === n.id);
    if (tl) {
      data = {
        ...data,
        task_list_id: tl.id,
        tasks: tl.tasks,
        title: tl.title ?? data.title,
      };
    }
  }
  return {
    id: n.id,
    type: n.kind,
    position: { x: n.position_x, y: n.position_y },
    data,
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

  const setContext = useCanvasStore((s) => s.setContext);
  const setRemove = useCanvasStore((s) => s.setRemoveNodeFromCanvas);

  // Load project + canvas on mount; set store context
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void (async () => {
      try {
        const proj = await api.projects.get(projectId);
        if (cancelled) return;
        canvasIdRef.current = proj.canvas_id;
        setContext({ canvasId: proj.canvas_id, projectId: proj.id, projectPath: proj.path });
        const canvas = await api.canvas.get(proj.canvas_id);
        if (cancelled) return;
        setNodes(canvas.nodes.map((n) => apiNodeToRf(n, canvas.task_lists)));
        viewportRef.current = canvas.viewport;
      } catch (e) {
        console.error("failed to load canvas", e);
      }
    })();
    return () => {
      cancelled = true;
      useCanvasStore.getState().reset();
    };
  }, [projectId, setNodes, setContext]);

  // Register the removeNode helper so child nodes can trigger deletion
  useEffect(() => {
    setRemove(async (nodeId, agentId) => {
      try {
        if (agentId) {
          try { await api.agents.delete(agentId); } catch { /* ignore */ }
        }
        await api.canvas.deleteNode(nodeId);
      } finally {
        setNodes((cur) => cur.filter((n) => n.id !== nodeId));
      }
    });
  }, [setNodes, setRemove]);

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

  const addAgent = async (preset: AgentPreset) => {
    if (!canvasIdRef.current) return;
    try {
      await api.canvas.createNode(canvasIdRef.current, {
        kind: "terminal",
        position_x: 120,
        position_y: 120,
        width: 460,
        height: 280,
        data: {
          title: preset.label,
          agent_type: preset.key,
          accent: preset.accent,
        },
      });
      const canvas = await api.canvas.get(canvasIdRef.current);
      setNodes(canvas.nodes.map((n) => apiNodeToRf(n, canvas.task_lists)));
    } catch (e) {
      alert(
        `create node failed: ${e instanceof ApiHttpError ? e.message : String(e)}`
      );
    }
  };

  const addTaskList = async () => {
    if (!canvasIdRef.current) return;
    try {
      await api.canvas.createNode(canvasIdRef.current, {
        kind: "task_list",
        position_x: 120,
        position_y: 120,
        width: 260,
        height: 220,
        data: { title: "todo" },
      });
      const canvas = await api.canvas.get(canvasIdRef.current);
      setNodes(canvas.nodes.map((n) => apiNodeToRf(n, canvas.task_lists)));
    } catch (e) {
      alert(
        `create node failed: ${e instanceof ApiHttpError ? e.message : String(e)}`
      );
    }
  };

  return (
    <div style={{ height: "100vh", width: "100vw", background: "#0b0b0f" }}>
      <Toolbar
        onAddAgent={(preset) => void addAgent(preset)}
        onAddTaskList={() => void addTaskList()}
      />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onMove={onMove}
        onNodeDragStop={(_, node) => {
          api.canvas.updateNode(node.id, {
            position_x: node.position.x,
            position_y: node.position.y,
          }).catch(() => { /* ignore */ });
        }}
        deleteKeyCode={["Backspace", "Delete"]}
        onNodesDelete={async (deleted) => {
          for (const n of deleted) {
            const agentId = (n.data as { agent_id?: string })?.agent_id;
            if (agentId) { try { await api.agents.delete(agentId); } catch { /* ignore */ } }
            try { await api.canvas.deleteNode(n.id); } catch { /* ignore */ }
            // React Flow already removed the node from visual state via onNodesChange.
          }
        }}
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
