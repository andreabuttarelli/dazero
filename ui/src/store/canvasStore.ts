import { create } from "zustand";
import type { Node as RfNode } from "reactflow";

type State = {
  canvasId: string | null;
  projectId: string | null;
  projectPath: string | null;
  nodes: RfNode[];
  setContext: (ctx: { canvasId: string; projectId: string; projectPath: string }) => void;
  setNodes: (nodes: RfNode[]) => void;
  addNode: (node: RfNode) => void;
  updateNode: (id: string, patch: Partial<RfNode>) => void;
  deleteNode: (id: string) => void;

  // Used by child nodes to request deletion from server + canvas state
  removeNodeFromCanvas: null | ((nodeId: string, agentId?: string) => Promise<void>);
  setRemoveNodeFromCanvas: (fn: (nodeId: string, agentId?: string) => Promise<void>) => void;

  // Used by TaskListNode to spawn a new terminal node from a task row
  spawnAgentFromTask: null | ((args: { sourceNodeId: string; taskDescription: string; agentType: string }) => Promise<void>);
  setSpawnAgentFromTask: (fn: (args: { sourceNodeId: string; taskDescription: string; agentType: string }) => Promise<void>) => void;

  reset: () => void;
};

export const useCanvasStore = create<State>((set) => ({
  canvasId: null,
  projectId: null,
  projectPath: null,
  nodes: [],
  setContext: ({ canvasId, projectId, projectPath }) =>
    set({ canvasId, projectId, projectPath }),
  setNodes: (nodes) => set({ nodes }),
  addNode: (node) => set((s) => ({ nodes: [...s.nodes, node] })),
  updateNode: (id, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id
          ? { ...n, ...patch, data: { ...n.data, ...(patch.data ?? {}) } }
          : n
      ),
    })),
  deleteNode: (id) =>
    set((s) => ({ nodes: s.nodes.filter((n) => n.id !== id) })),

  removeNodeFromCanvas: null,
  setRemoveNodeFromCanvas: (fn) => set({ removeNodeFromCanvas: fn }),

  spawnAgentFromTask: null,
  setSpawnAgentFromTask: (fn) => set({ spawnAgentFromTask: fn }),

  reset: () =>
    set({
      canvasId: null,
      projectId: null,
      projectPath: null,
      nodes: [],
      removeNodeFromCanvas: null,
      spawnAgentFromTask: null,
    }),
}));
