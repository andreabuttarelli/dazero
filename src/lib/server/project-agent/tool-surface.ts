import type { Tool } from 'ai';
import { openBrandMcp } from '$lib/server/brand-agent/mcp-client';

/**
 * LA SUPERFICIE VISTA DAL MODELLO: progetto sempre, brand solo se il progetto ne ha uno.
 *
 * Un tool di brand senza brand è un tool che fallisce: meglio assente che presente e rotto.
 * È la stessa ragione per cui il prompt dice «no brand» invece di tacere.
 */
export type BrandTools = Record<string, Tool>;

export function projectToolSurface(
  projectTools: Record<string, Tool>,
  brandTools: BrandTools | null
): Record<string, Tool> {
  if (!brandTools) {
    return { ...projectTools };
  }
  return { ...projectTools, ...brandTools };
}

export type AgentTools = {
  tools: Record<string, Tool>;
  close: () => Promise<void>;
};

const NOOP_CLOSE = async () => {};

/**
 * Apre i tool del brand solo quando un brand è attaccato al progetto. Il JWT resta sul server:
 * il browser parla solo con la nostra rotta, mai con mcp.dazero.co.
 */
export async function openAgentTools(input: {
  projectTools: Record<string, Tool>;
  brand: { id: string } | null;
  accessToken: string;
}): Promise<AgentTools> {
  if (!input.brand) {
    return { tools: projectToolSurface(input.projectTools, null), close: NOOP_CLOSE };
  }

  const mcp = await openBrandMcp(input.accessToken);
  return { tools: projectToolSurface(input.projectTools, mcp.tools), close: mcp.close };
}
