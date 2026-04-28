export type Project = {
  id: string;
  name: string;
  path: string;
  git_remote: string | null;
  created_at: number;
  last_opened_at: number | null;
  canvas_id: string;
};

export type NodeKind = "terminal" | "task_list";

export type CanvasNode = {
  id: string;
  canvas_id: string;
  kind: NodeKind;
  position_x: number;
  position_y: number;
  width: number | null;
  height: number | null;
  data: Record<string, unknown>;
  created_at: number;
};

export type Task = {
  id: string;
  task_list_id: string;
  description: string;
  status: "pending" | "done";
  position: number;
};

export type TaskList = {
  id: string;
  node_id: string;
  title: string | null;
  tasks: Task[];
};

export type Viewport = { x: number; y: number; zoom: number };

export type Edge = {
  id: string;
  canvas_id: string;
  source_node_id: string;
  target_node_id: string;
  kind: string | null;
  label: string | null;
  data: unknown | null;
};

export type CanvasFull = {
  id: string;
  project_id: string;
  viewport: Viewport;
  nodes: CanvasNode[];
  task_lists: TaskList[];
  edges: Edge[];
};

export type AgentRef = { agent_id: string };

export type ApiError = { error: string; code: "not_found" | "bad_request" | "conflict" | "internal_error" | "budget_exceeded" };

export type AgentPreset = {
  key: string;
  label: string;
  initial_command: string | null;
  accent: string;
};

export type AgentPresetsResponse = {
  max_concurrent_agents: number;
  presets: AgentPreset[];
};
