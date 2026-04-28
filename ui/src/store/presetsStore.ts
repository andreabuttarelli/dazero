import { create } from "zustand";
import type { AgentPreset } from "../types";
import { api } from "../lib/api";

type State = {
  presets: AgentPreset[];
  maxAgents: number;
  loaded: boolean;
  load: () => Promise<void>;
  upsert: (p: AgentPreset) => Promise<void>;
  remove: (key: string) => Promise<void>;
};

export const usePresetsStore = create<State>((set, get) => ({
  presets: [],
  maxAgents: 5,
  loaded: false,
  load: async () => {
    const r = await api.presets.list();
    set({ presets: r.presets, maxAgents: r.max_concurrent_agents, loaded: true });
  },
  upsert: async (p) => {
    await api.presets.save(p);
    await get().load();
  },
  remove: async (key) => {
    await api.presets.delete(key);
    await get().load();
  },
}));
