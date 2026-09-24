import { describe, expect, test } from 'bun:test';
import { handleMcpFetch } from './http-app.ts';
import { MCP_INSTRUCTIONS } from './server.ts';

/**
 * IL LEDGER DEL RITIRO. La superficie MCP passa da decine di tool brand-scoped (piano editoriale,
 * studio, media, SEO/GEO, blog…) a quindici org-scoped: `query` legge tutto, tre generici
 * scrivono qualunque riga (nodi della tela compresi — disegnare non è un'azione sul mondo),
 * `describe_node_types` dà la forma di `nodes.data`, `run_node_generation` è il click Generare
 * della tela, `run_node_loop`/`preview_node_loop`/`cancel_node_loop` sono lo stesso click messo
 * in coda su ogni combinazione di un nodo, e due famiglie autonome esistono per le due cose che
 * LO sono davvero — post che si promuovono e campagne che spendono soldi.
 *
 * Ogni nome qui sotto esisteva su questa superficie ed è sparito. La rotta REST che lo serviva, se
 * esiste ancora, resta: la CLI e l'app la chiamano ancora. Quello che sparisce è SOLO la voce in
 * `tools/list` — un agente esterno via MCP non la vede più.
 */
type Tool = { name: string; description?: string; inputSchema?: { properties?: Record<string, unknown> } };

async function rpc(method: string, params: unknown, id = 1) {
  const res = await handleMcpFetch(
    new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    }),
  );
  return (await res.json()) as { result?: Record<string, unknown> };
}

async function tools(): Promise<Tool[]> {
  await rpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test', version: '0.0.1' },
  });
  const listed = await rpc('tools/list', {}, 2);
  return (listed.result?.tools ?? []) as Tool[];
}

/**
 * Le uniche undici che restano. `list_posts` e `list_ad_campaigns` non sono un secondo `query`:
 * leggono le due famiglie autonome con i loro filtri propri (brand + status), la stessa asimmetria
 * che i tool di scrittura hanno con `insert_row`. `describe_node_types` è la terza eccezione, e
 * per lo stesso motivo: la forma di `nodes.data` per `type` non è una riga a cui applicare
 * `where`, è un fatto del codice, non del database.
 */
const RESTANO = [
  'query',
  'insert_row',
  'update_row',
  'delete_row',
  'describe_node_types',
  'list_posts',
  'create_post',
  'set_post_status',
  'list_ad_campaigns',
  'create_ad_campaign',
  'approve_ad_campaign',
  'run_node_generation',
  'run_node_loop',
  'preview_node_loop',
  'cancel_node_loop'
];

describe('la superficie MCP è le quindici dichiarate', () => {
  test('tools/list è esattamente questi quindici nomi', async () => {
    const names = (await tools()).map((t) => t.name).sort();

    expect(names).toEqual([...RESTANO].sort());
  });

  test('nessuno è dichiarato due volte', async () => {
    const names = (await tools()).map((t) => t.name);

    expect(names).toEqual([...new Set(names)]);
  });

  test('le cinque letture sono annotate readOnlyHint', async () => {
    const all = await tools();
    const reads = ['query', 'describe_node_types', 'list_posts', 'list_ad_campaigns', 'preview_node_loop'];

    for (const name of reads) {
      const tool = all.find((t) => t.name === name) as { annotations?: { readOnlyHint?: boolean } } | undefined;
      expect(tool?.annotations?.readOnlyHint, name).toBe(true);
    }
  });

  test('le istruzioni del handshake mandano a `query`, e dicono la regola che la rende usabile', () => {
    expect(MCP_INSTRUCTIONS).toContain('query');
    expect(MCP_INSTRUCTIONS).toContain('columns');
    expect(MCP_INSTRUCTIONS).toMatch(/offset/i);
  });

  test('nominano describe_node_types, insert_row/update_row/delete_row e le due famiglie autonome', () => {
    for (const name of RESTANO) expect(MCP_INSTRUCTIONS, name).toContain(name);
  });
});
