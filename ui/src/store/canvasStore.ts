import { create } from "zustand";
import type { Node as RfNode } from "reactflow";

type State = {
  canvasId: string | null;
  projectId: string | null;
  nodes: RfNode[];
  setContext: (canvasId: string, projectId: string) => void;
  setNodes: (nodes: RfNode[]) => void;
  addNode: (node: RfNode) => void;
  updateNode: (id: string, patch: Partial<RfNode>) => void;
  deleteNode: (id: string) => void;
  reset: () => void;
};

export const useCanvasStore = create<State>((set) => ({
  canvasId: null,
  projectId: null,
  nodes: [],
  setContext: (canvasId, projectId) => set({ canvasId, projectId }),
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
  reset: () => set({ canvasId: null, projectId: null, nodes: [] }),
}));
