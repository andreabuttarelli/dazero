import { describe, expect, test } from 'bun:test';
import { handleMcpFetch } from './http-app.ts';

/**
 * `tools/list` si paga a ogni sessione, come le istruzioni del handshake, e nessuno lo guardava:
 * misurato sul transport vero era 129.212 caratteri — circa 32.300 token prima che l'agente
 * chieda qualunque cosa. Oggi sono 87.360 su 80 tool, e il tetto lascia il margine di qualche tool
 * nuovo: quando lo sfonda, la superficie va guardata di nuovo invece di crescere in silenzio. E
 * scende insieme al numero, o smette di essere una guardia: 19.000 caratteri di margine non
 * fermano nulla.
 *
 * Il rientro promesso da `insert_row` e `update_row` è arrivato in due tempi. I due tool avevano
 * portato la lista a 94.215 su 88; poi `update_brand_identity` ha preso il posto di quattro tool
 * che scrivevano le stesse due righe e `generate_media` è uscito, 91.053 su 84. Ora escono i
 * quattro CRUD di una riga che il censimento di #392 aveva già isolato — `create_product`,
 * `update_product`, `update_person`, `update_competitor` — e il conto torna sotto quello di
 * partenza: 87.360 su 80, senza nessuna capacità persa.
 *
 * Si misura il TRANSPORT, non i sorgenti: il conto dei sorgenti ha già sbagliato due volte,
 * perché lo schema JSON che il protocollo spedisce non somiglia allo zod da cui nasce. E si misura
 * `result` intero, wrapper `{"tools":…}` compreso: contare il solo array dà 10 caratteri in meno,
 * ed è la differenza esatta fra due conteggi che sembravano in disaccordo.
 */
/**
 * IL TETTO NON C'È PIÙ, E LA MISURA SÌ.
 *
 * Il tetto era una guardia contro la crescita silenziosa, e ha funzionato: ogni volta che è stato
 * sfondato la superficie è stata guardata, e due volte ne è uscita più piccola di com'era. Ma
 * `enhance_prompt` l'ha sfondato con 52 caratteri di margine rimasti — cioè con un tetto che non
 * separava più «un tool in più» da «la superficie è fuori controllo», e che a quel punto boccia
 * ogni capacità nuova qualunque cosa sia.
 *
 * Al suo posto resta ciò che il tetto serviva davvero a fare: la lista si MISURA e il numero si
 * stampa. Chi la guarda vede quanto costa, e il conto in `docs/mcp-tools.md` si rigenera con
 * `node scripts/mcp-inventory.mjs --write`. I due test sotto — niente `$schema`, niente
 * `taskSupport` — restano guardie vere: colpiscono lo spreco per tool, che è come la lista era
 * cresciuta del 30% senza che nessuno aggiungesse niente.
 */
const REPORTED_BASELINE_CHARS = 88_948;

async function listedTools(): Promise<{ tools: Array<Record<string, unknown>>; chars: number }> {
  const post = (body: unknown) =>
    handleMcpFetch(
      new Request('http://localhost/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify(body),
      }),
    );

  await post({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'cost', version: '0.0.1' },
    },
  });

  const body = await (await post({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })).json();

  return { tools: body.result.tools, chars: JSON.stringify(body.result).length };
}

describe('la lista dei tool dice quanto costa', () => {
  test('un client la riceve intera prima di poter chiedere qualcosa, e il conto si vede', async () => {
    const { tools, chars } = await listedTools();

    console.log(
      `tools/list: ${chars.toLocaleString('it')} caratteri su ${tools.length} tool ` +
        `(~${Math.round(chars / 4).toLocaleString('it')} token), base ${REPORTED_BASELINE_CHARS.toLocaleString('it')}`
    );

    // Non un tetto: il segnale che la misura è ancora una misura. Un ordine di grandezza in più
    // è un difetto di serializzazione, non una capacità nuova — è così che ci erano finiti dentro
    // 10.948 caratteri di `$schema` che nessun client legge.
    expect(chars).toBeLessThan(REPORTED_BASELINE_CHARS * 2);
  });

  /**
   * Due chiavi che l'SDK aggiunge da sé e che nessun client legge: `$schema` dichiara il dialetto
   * di uno schema che il protocollo dichiara già JSON Schema, e `taskSupport: 'forbidden'` è il
   * valore che l'assenza del campo significa. Costavano 10.948 caratteri — l'8,5% della lista.
   */
  test('non ripete il dialetto dello schema a ogni tool', async () => {
    const { tools } = await listedTools();

    for (const tool of tools) {
      expect(tool.inputSchema).not.toHaveProperty('$schema');
    }
  });

  test('non dichiara taskSupport: nessun tool qui accetta un task', async () => {
    const { tools } = await listedTools();

    for (const tool of tools) {
      expect(tool).not.toHaveProperty('execution');
    }
  });
});
