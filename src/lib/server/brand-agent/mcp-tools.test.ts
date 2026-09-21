import { describe, it, expect, vi } from 'vitest';
import type { Tool } from 'ai';
import { toAiTools, MCP_TOOL_LIMIT } from './mcp-tools';

/** `execute` è opzionale nel tipo dell'SDK; qui è sempre definito perché lo costruiamo noi. */
const run = (t: Tool, args: unknown) =>
  (t.execute as (a: unknown, o: unknown) => Promise<unknown>)(args, { toolCallId: 't1', messages: [] });

/**
 * Il contratto di questo modulo è uno solo: quello che il server MCP dichiara a runtime diventa
 * quello che il modello può chiamare, senza un elenco scritto a mano da nessuna parte. Un tool
 * aggiunto su mcp.dazero.co deve comparire qui senza toccare questo repo — per questo il
 * modulo non conosce NESSUN nome di tool.
 */
describe('toAiTools — i tool del brand vengono dal server, non da una lista qui', () => {
  const listed = [
    { name: 'query', description: 'Read any table', inputSchema: { type: 'object', properties: { sql: { type: 'string' } } } },
    { name: 'create_post', description: 'Create a post', inputSchema: { type: 'object', properties: { caption: { type: 'string' } } } }
  ];

  it('traduce ogni tool dichiarato, qualunque sia il suo nome', () => {
    const tools = toAiTools(listed, vi.fn());
    expect(Object.keys(tools).sort()).toEqual(['create_post', 'query']);
    expect(tools.query.description).toBe('Read any table');
  });

  it('esegue il tool chiamando il server, non una copia locale', async () => {
    const call = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
    const tools = toAiTools(listed, call);
    const out = await run(tools.query, { sql: 'select 1' });
    expect(call).toHaveBeenCalledWith('query', { sql: 'select 1' });
    expect(out).toBe('ok');
  });

  /**
   * Un tool senza schema non è un tool senza argomenti: è un tool di cui non sappiamo gli
   * argomenti. Passarlo come `{}` farebbe chiamare il modello sempre a vuoto, e il guasto
   * sembrerebbe del modello invece che della traduzione.
   */
  it('senza inputSchema dichiara un oggetto aperto invece di uno vuoto', () => {
    const tools = toAiTools([{ name: 'ping' }], vi.fn());
    expect(tools.ping.inputSchema).toBeDefined();
  });

  /**
   * IL COSTO. Ogni tool dichiarato viaggia nel prompt di OGNI turno. Il server ne espone a
   * decine: mandarli tutti significa pagare un prompt gonfio su ogni messaggio, per sempre.
   */
  it('si ferma al tetto invece di mandare tutto il catalogo nel prompt', () => {
    const many = Array.from({ length: MCP_TOOL_LIMIT + 10 }, (_, i) => ({ name: `t${i}` }));
    expect(Object.keys(toAiTools(many, vi.fn()))).toHaveLength(MCP_TOOL_LIMIT);
  });

  it('un errore del tool torna al modello come testo, non fa cadere il turno', async () => {
    const call = vi.fn().mockRejectedValue(new Error('brand not found'));
    const tools = toAiTools(listed, call);
    const out = await run(tools.query, { sql: 'x' });
    expect(String(out)).toContain('brand not found');
  });

  it('unisce più blocchi di testo invece di tenere solo il primo', async () => {
    const call = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] });
    const tools = toAiTools(listed, call);
    expect(await run(tools.query, {})).toBe('a\nb');
  });
});

describe('il tetto non decide per caso quali tool spariscono', () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ name: `tool_${i}`, description: 'x' }));

  it('tiene i tre che leggono e scrivono, anche se il server li elenca per ultimi', () => {
    // Il taglio era posizionale: con 77 tool sul server e un tetto di 40, quali sopravvivono lo
    // decideva l'ordine di `tools/list`. `query`, `insert_row` e `update_row` cadevano fuori —
    // e con loro OGNI tabella che non ha un tool suo, cioè la tela intera. Un agente che non
    // sa leggere il database non può correggere niente di ciò che non ha un verbo dedicato.
    const listed = [...many(60), { name: 'query' }, { name: 'insert_row' }, { name: 'update_row' }];

    const names = Object.keys(toAiTools(listed as never, async () => null));

    expect(names).toContain('query');
    expect(names).toContain('insert_row');
    expect(names).toContain('update_row');
  });

  it('resta comunque entro il tetto: il conto del prompt si paga a ogni turno', () => {
    const listed = [...many(60), { name: 'query' }, { name: 'insert_row' }];

    expect(Object.keys(toAiTools(listed as never, async () => null)).length).toBeLessThanOrEqual(
      MCP_TOOL_LIMIT
    );
  });
});
