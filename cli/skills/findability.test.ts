import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { handleMcpFetch } from '../mcp/http-app.ts';
import { MCP_INSTRUCTIONS } from '../mcp/server.ts';

/**
 * Un tool si trova con le parole di chi lo cerca, non con le nostre.
 *
 * Ogni riga è una richiesta che potrebbe arrivare in chat e il tool che dovrebbe risponderle. Se la
 * descrizione non contiene quelle parole il modello scorre `tools/list` e non lo riconosce.
 *
 * IL CONTROLLO VALE SU DUE SUPERFICI, non una. La skill si legge PRIMA della descrizione del tool
 * (arriva col caricamento della skill, non col handshake MCP), quindi non sono «il lavoro e il suo
 * allineamento»: sono due prompt in concorrenza, e un agente che non ha ancora aperto il tool può
 * incontrare solo la prima.
 *
 * Le descrizioni si leggono dal SERVER VERO (`tools/list`), non da un registro dichiarativo: la
 * superficie MCP di dazero è cablata a mano in `cli/mcp/tools/*.ts`, e un contratto REST separato
 * (`cli/lib/contracts/`) descrive le rotte brand-scoped che il CLI chiama — leggere quello per
 * `tools/list` mentirebbe sul tool che un agente vede davvero.
 */
const ASKED_FOR: ReadonlyArray<{ tool: string; question: string; words: readonly string[] }> = [
  { tool: 'query', question: 'how is this brand supposed to sound', words: ['brand', 'read'] },
  { tool: 'query', question: 'how many posts went out last month', words: ['table', 'read'] },
  { tool: 'query', question: 'what does this brand sell', words: ['products', 'read'] },
  { tool: 'run_node_generation', question: 'generate an image in this node', words: ['generate', 'image', 'node'] },
  { tool: 'run_node_generation', question: 'animate this into a video', words: ['generate', 'video', 'node'] },
  { tool: 'create_post', question: 'turn this into a post', words: ['post', 'brand', 'caption'] },
  { tool: 'list_posts', question: 'what posts are pending for this brand', words: ['posts', 'brand'] },
  { tool: 'create_ad_campaign', question: 'draft an ad campaign for this brand', words: ['campaign', 'draft'] },
  { tool: 'approve_ad_campaign', question: 'approve this ad campaign so it can spend', words: ['approve', 'campaign', 'spend'] },
  { tool: 'insert_row', question: 'add a row to a table', words: ['add', 'row', 'table'] },
  { tool: 'delete_row', question: 'delete rows from a table', words: ['remove', 'org'] },
  { tool: 'describe_node_types', question: 'what shape does a node need', words: ['data', 'type', 'node'] }
];

const HAND_WRITTEN_TARIFF = /\b\d+\s*credits?\b/i;

/**
 * `SKILL.md` E BASTA, e non concatenata a `references/tools.md`.
 *
 * Le due non sono la stessa superficie: SKILL.md si carica sempre, tools.md è sotto «References
 * (load on demand)» e un agente può non aprirla mai. Concatenandole, una parola presente solo nel
 * riferimento farebbe passare la riga mentre la superficie che si legge davvero tace.
 */
const SKILL = readFileSync(
  fileURLToPath(new URL('./dazero/SKILL.md', import.meta.url)),
  'utf8'
).toLowerCase();

async function listedTools(): Promise<Map<string, string>> {
  const post = (body: unknown) =>
    handleMcpFetch(
      new Request('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify(body)
      })
    );

  await post({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'findability', version: '0' } }
  });

  const body = await (await post({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })).json();
  const tools = body.result.tools as { name: string; description?: string }[];

  return new Map(tools.map((t) => [t.name, (t.description ?? '').toLowerCase()]));
}

/**
 * LA TERZA SUPERFICIE, e si legge PRIMA delle altre due. `instructions` arriva col handshake di
 * `initialize`: il client la mostra da sola, una volta per sessione, prima di qualunque descrizione
 * e prima della skill. Se una riga qui contraddice una descrizione, vince questa — quindi è la
 * superficie dove un errore costa di più.
 *
 * Serve corta: si paga a ogni sessione, come `tools/list`.
 */
const INSTRUCTIONS_MAX_CHARS = 1_900;

describe('le istruzioni del server sono una mappa, non un ordine', () => {
  test('dicono di non scegliere brand/org da soli, che è il danno vero', () => {
    expect(MCP_INSTRUCTIONS).toMatch(/never guess|nullable, and that is the normal case/i);
  });

  test('dicono che una lettura non costa', () => {
    expect(MCP_INSTRUCTIONS).toMatch(/reads cost nothing/i);
  });

  test('nessuna tariffa scritta a mano, come sulle altre due superfici', () => {
    expect(HAND_WRITTEN_TARIFF.test(MCP_INSTRUCTIONS)).toBe(false);
  });

  test('restano corte: si pagano a ogni sessione', () => {
    expect(MCP_INSTRUCTIONS.length).toBeLessThanOrEqual(INSTRUCTIONS_MAX_CHARS);
  });
});

describe('una descrizione si legge cercando il proprio problema', () => {
  test('tutti i tool di ASKED_FOR esistono davvero', async () => {
    const tools = await listedTools();
    for (const { tool } of ASKED_FOR) {
      expect(tools.has(tool), tool).toBe(true);
    }
  });

  for (const { tool, question, words } of ASKED_FOR) {
    test(`«${question}» trova ${tool} nella lista dei tool`, async () => {
      const tools = await listedTools();
      const description = tools.get(tool) ?? '';

      for (const word of words) {
        expect(description, `${tool} ← ${word}`).toContain(word);
      }
    });

    test(`«${question}» trova ${tool} anche nella skill, che si legge prima`, () => {
      expect(SKILL, `skill ← ${tool}`).toContain(tool);

      for (const word of words) {
        expect(SKILL, `skill ← ${tool} ← ${word}`).toContain(word);
      }
    });
  }

  test('nessuna descrizione scrive una tariffa a mano: il prezzo lo misura la risposta', async () => {
    const tools = await listedTools();
    for (const [name, description] of tools) {
      expect(HAND_WRITTEN_TARIFF.test(description), name).toBe(false);
    }
  });

  test('ogni tool che può restare senza crediti dice che spende', async () => {
    const tools = await listedTools();
    const description = tools.get('run_node_generation') ?? '';
    expect(description).toMatch(/spends? credits/i);
  });

  test('nemmeno la skill la scrive: le due superfici dicono la stessa cosa', () => {
    expect(HAND_WRITTEN_TARIFF.test(SKILL)).toBe(false);
  });
});
