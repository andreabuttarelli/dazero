import type {
  Project, CanvasFull, CanvasNode, Task, Viewport, AgentRef, ApiError, NodeKind,
} from "../types";

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    let err: ApiError;
    try { err = await r.json() as ApiError; }
    catch { err = { error: `HTTP ${r.status}`, code: "internal_error" }; }
    throw new ApiHttpError(r.status, err);
  }
  if (r.status === 204) return undefined as T;
  return r.json() as Promise<T>;
}

export class ApiHttpError extends Error {
  status: number;
  code: ApiError["code"];
  constructor(status: number, body: ApiError) {
    super(body.error);
    this.status = status;
    this.code = body.code;
    this.name = "ApiHttpError";
  }
}

export const api = {
  projects: {
    list: () => req<Project[]>("GET", "/api/projects"),
    get: (id: string) => req<Project>("GET", `/api/projects/${encodeURIComponent(id)}`),
    createFolder: (path: string, name?: string) =>
      req<Project>("POST", "/api/projects", { mode: "folder", path, ...(name ? { name } : {}) }),
    createClone: (git_url: string, name?: string) =>
      req<Project>("POST", "/api/projects", { mode: "clone", git_url, ...(name ? { name } : {}) }),
    update: (id: string, body: { name?: string; last_opened_at?: number }) =>
      req<Project>("PATCH", `/api/projects/${encodeURIComponent(id)}`, body),
    delete: (id: string) => req<void>("DELETE", `/api/projects/${encodeURIComponent(id)}`),
  },
  canvas: {
    get: (id: string) => req<CanvasFull>("GET", `/api/canvases/${encodeURIComponent(id)}`),
    patchViewport: (id: string, v: Viewport) =>
      req<void>("PATCH", `/api/canvases/${encodeURIComponent(id)}/viewport`, v),
    createNode: (canvasId: string, body: {
      kind: NodeKind;
      position_x: number;
      position_y: number;
      width?: number;
      height?: number;
      data?: Record<string, unknown>;
    }) =>
      req<CanvasNode>("POST", `/api/canvases/${encodeURIComponent(canvasId)}/nodes`, body),
    updateNode: (id: string, body: Partial<Pick<CanvasNode,
      "position_x" | "position_y" | "width" | "height" | "data"
    >>) =>
      req<CanvasNode>("PATCH", `/api/nodes/${encodeURIComponent(id)}`, body),
    deleteNode: (id: string) => req<void>("DELETE", `/api/nodes/${encodeURIComponent(id)}`),
  },
  tasks: {
    create: (taskListId: string, description: string, position?: number) =>
      req<Task>("POST", `/api/task-lists/${encodeURIComponent(taskListId)}/tasks`,
        { description, ...(position !== undefined ? { position } : {}) }),
    update: (id: string, body: { description?: string; status?: "pending" | "done" }) =>
      req<Task>("PATCH", `/api/tasks/${encodeURIComponent(id)}`, body),
    delete: (id: string) => req<void>("DELETE", `/api/tasks/${encodeURIComponent(id)}`),
  },
  agents: {
    spawn: (project_id: string, node_id: string, cwd?: string) =>
      req<AgentRef>("POST", "/api/agents", { project_id, node_id, ...(cwd ? { cwd } : {}) }),
    delete: (id: string) => req<void>("DELETE", `/api/agents/${encodeURIComponent(id)}`),
  },
};
