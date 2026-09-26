import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enhancePrompt, buildEnhanceSystem, type EnhanceRunner } from './prompt-enhance';
import { GPT_IMAGE_2_MODEL, SEEDREAM_5_PRO_MODEL } from '$lib/image-models';
import { SEEDANCE_25_MODEL } from '$lib/video-models';

const PROMPT = 'a jar of honey on a linen cloth';

/** Il runner non chiama mai il modello: questi test fissano il contratto, non la resa. */
const runnerReturning = (text: string): EnhanceRunner => vi.fn(async () => text);

describe('enhancePrompt', () => {
  it('restituisce il testo riscritto e dice che è cambiato', async () => {
    const out = await enhancePrompt(
      { prompt: PROMPT, model: GPT_IMAGE_2_MODEL },
      {
        run: runnerReturning(
          'Scene: a linen cloth on a counter\nSubject: a sealed jar of honey, lit from the left'
        )
      }
    );

    expect(out.changed).toBe(true);
    expect(out.prompt).toContain('Scene:');
    expect(out.model).toBe(GPT_IMAGE_2_MODEL);
  });

  // Il craft AGGIUNGE vocabolario — luce, materiale, ottica — ed è il suo lavoro. Misurato sul
  // modello vero: 5 token nel brief, 86 nella riscrittura buona. Un controllo che contasse le
  // parole nuove rifiuterebbe proprio le riscritture riuscite.
  it('accetta una riscrittura molto più lunga, se il brief è tutto ancora lì', async () => {
    const out = await enhancePrompt({ prompt: PROMPT, model: GPT_IMAGE_2_MODEL }, {
      run: runnerReturning(
        'Scene: a still-life photograph. A jar of honey on a linen cloth, lit by low morning sun through a window off frame left, warm near 3500K, raking across at a shallow angle.\nSubject: a closed glass jar filled thick with amber honey, lid fastened, standing on softly rumpled undyed linen.\nImportant details: a soft contact shadow seams the jar to the cloth, falling right, short, soft-edged. The linen is matte with visible weave under the raking light.'
      )
    });

    expect(out.changed).toBe(true);
  });

  it('un modello che non conosciamo lascia il prompt com era, senza rifiutare', async () => {
    const run = vi.fn();

    const out = await enhancePrompt({ prompt: PROMPT, model: 'mai-visto' }, { run });

    expect(run).not.toHaveBeenCalled();
    expect(out.prompt).toBe(PROMPT);
    expect(out.changed).toBe(false);
    expect(out.notes.join(' ')).toMatch(/mai-visto/);
  });

  it('il sistema porta il craft DI QUEL modello, non uno generico', async () => {
    const gpt = buildEnhanceSystem(GPT_IMAGE_2_MODEL);
    const seedream = buildEnhanceSystem(SEEDREAM_5_PRO_MODEL);

    expect(gpt).toMatch(/transparent/i);
    expect(seedream).toMatch(/image 1|figure/i);
    expect(gpt).not.toBe(seedream);
  });

  it('un modello video prende il craft video', async () => {
    expect(buildEnhanceSystem(SEEDANCE_25_MODEL)).toMatch(/reflection|mirror/i);
  });

  // Il modo in cui questi strumenti falliscono di solito: riscrivono la forma E il contenuto.
  it('una riscrittura che inventa un soggetto viene rifiutata, e torna l originale', async () => {
    const out = await enhancePrompt(
      { prompt: PROMPT, model: GPT_IMAGE_2_MODEL },
      { run: runnerReturning('Scene: a kitchen counter with a golden retriever asleep under it') }
    );

    expect(out.prompt).toBe(PROMPT);
    expect(out.changed).toBe(false);
    expect(out.notes.join(' ')).toMatch(/linen|cloth/i);
  });

  it('una riscrittura che tiene i nomi del brief passa', async () => {
    const out = await enhancePrompt(
      { prompt: PROMPT, model: GPT_IMAGE_2_MODEL },
      { run: runnerReturning('Scene: a linen cloth on a counter\nSubject: a sealed jar of honey, lit from the left') }
    );

    expect(out.changed).toBe(true);
  });

  it('una riscrittura che chiede testo leggibile viene rifiutata', async () => {
    const out = await enhancePrompt(
      { prompt: PROMPT, model: GPT_IMAGE_2_MODEL },
      { run: runnerReturning('Subject: a jar of honey with the words "PURE HONEY" on the label') }
    );

    expect(out.changed).toBe(false);
    expect(out.notes.join(' ')).toMatch(/testo|text/i);
  });

  it('una riscrittura che dichiara un aspect ratio viene rifiutata', async () => {
    const out = await enhancePrompt(
      { prompt: PROMPT, model: GPT_IMAGE_2_MODEL },
      { run: runnerReturning('Scene: a counter, 9:16 vertical poster format') }
    );

    expect(out.changed).toBe(false);
  });

  it('un output vuoto non cancella il prompt', async () => {
    const out = await enhancePrompt(
      { prompt: PROMPT, model: GPT_IMAGE_2_MODEL },
      { run: runnerReturning('   ') }
    );

    expect(out.prompt).toBe(PROMPT);
    expect(out.changed).toBe(false);
  });

  it('un modello che esplode non rompe il giro: torna l originale', async () => {
    const out = await enhancePrompt(
      { prompt: PROMPT, model: GPT_IMAGE_2_MODEL },
      { run: vi.fn(async () => { throw new Error('gateway giù'); }) }
    );

    expect(out.prompt).toBe(PROMPT);
    expect(out.changed).toBe(false);
    expect(out.notes.join(' ')).toContain('gateway giù');
  });

  // Il controllo va misurato su riscritture VERE, o si scopre troppo severo solo in produzione:
  // queste quattro hanno tutte fatto fallire una versione del controllo mentre lo scrivevo.
  it('accetta una riscrittura realistica, anche in una lingua che non è inglese', async () => {
    const run = runnerReturning(
      'Scene: cemento grezzo\nSubject: un paio di scarpe da ginnastica bianche\nImportant details: luce radente, ombra di contatto netta'
    );

    const out = await enhancePrompt(
      { prompt: 'un paio di scarpe da ginnastica bianche su cemento', model: GPT_IMAGE_2_MODEL },
      { run }
    );

    expect(out.changed).toBe(true);
  });

  it('accetta i dettagli di scena che dare forma comporta', async () => {
    const out = await enhancePrompt({ prompt: PROMPT, model: GPT_IMAGE_2_MODEL }, {
      run: runnerReturning(
        'Scene: a linen cloth on a wooden counter\nSubject: a sealed jar of honey\nImportant details: soft morning light from the left, visible contact shadow\nUse case: a product photograph'
      )
    });

    expect(out.changed).toBe(true);
  });

  // Misurato sul modello vero: «morning light» torna come «morning lighting», e un confronto
  // letterale lo chiamava soggetto perso. Una forma flessa della stessa parola è la stessa cosa.
  it('una parola che torna flessa conta come presente', async () => {
    const out = await enhancePrompt(
      { prompt: 'a jar of honey on a linen cloth, morning light', model: GPT_IMAGE_2_MODEL },
      {
        run: runnerReturning(
          'Soft morning lighting rakes the linen cloth; the honey glows, backlit through the glass jar.'
        )
      }
    );

    expect(out.changed).toBe(true);
  });

  // Misurato sul modello vero: «morning light» torna come «Low morning sun rakes in at 3800K» —
  // la luce c'è, descritta meglio, ma la PAROLA «light» no. Pretendere ogni parola boccia una
  // riscrittura giusta, e un dizionario di sinonimi sarebbe una taratura a occhio senza fine.
  it('una parola resa con un sinonimo non affonda la riscrittura', async () => {
    const out = await enhancePrompt(
      { prompt: 'a jar of honey on a linen cloth, morning light', model: GPT_IMAGE_2_MODEL },
      {
        run: runnerReturning(
          'A glass jar of honey on a linen cloth. Low morning sun rakes in from the left at a warm 3800K, glowing through the honey and catching the linen weave thread by thread.'
        )
      }
    );

    expect(out.changed).toBe(true);
  });

  it('ma un soggetto davvero sparito resta un rifiuto', async () => {
    const out = await enhancePrompt(
      { prompt: 'a jar of honey on a linen cloth, morning light', model: GPT_IMAGE_2_MODEL },
      { run: runnerReturning('Soft morning lighting on a marble slab; the honey glows in the jar.') }
    );

    expect(out.changed).toBe(false);
    expect(out.notes.join(' ')).toMatch(/linen|cloth/i);
  });

  it('rifiuta una scena intera al posto del brief', async () => {
    const out = await enhancePrompt({ prompt: PROMPT, model: GPT_IMAGE_2_MODEL }, {
      run: runnerReturning(
        'Scene: a bustling farmers market with vendors, crates of apples and a barking dog'
      )
    });

    expect(out.changed).toBe(false);
  });

  it('non gonfia: un prompt gia riscritto non raddoppia al secondo giro', async () => {
    const once = 'Scene: a linen cloth\nSubject: a sealed jar of honey';
    const out = await enhancePrompt({ prompt: once, model: GPT_IMAGE_2_MODEL }, {
      run: runnerReturning(`${once}\nImportant details: soft morning light`)
    });

    expect(out.prompt.length).toBeLessThan(once.length * 2);
  });
});

/**
 * IL RISCRITTORE PASSA DAL TUBO CENTRALE, NON DA `generateText` NUDO.
 *
 * Chiamare l'SDK direttamente saltava `logAiCall`: si pagava il provider e nessuna riga in
 * `ai_calls` teneva il conto — un `ENHANCE_PROMPT_MODEL` mai fatturato a nessuno. `runWithModel`
 * deve passare da `llmText`, che scrive quella riga da sé.
 */
describe('enhancePrompt paga da dove tutto il resto paga', () => {
  const M = vi.hoisted(() => ({
    llmText: vi.fn(async (_opts: { label?: string; prompt: string }) => ({ text: '', citations: [] as Array<{ uri: string; title: string }> }))
  }));

  vi.mock('$lib/server/llm', async () => ({
    ...(await vi.importActual<typeof import('$lib/server/llm')>('$lib/server/llm')),
    llmText: M.llmText
  }));

  beforeEach(() => {
    M.llmText.mockReset();
  });

  it('chiama llmText con label prompt.enhance: una sola riga ai_calls per riscrittura', async () => {
    M.llmText.mockResolvedValue({
      text: 'Scene: a linen cloth on a counter\nSubject: a sealed jar of honey, lit from the left',
      citations: []
    });

    const out = await enhancePrompt({ prompt: PROMPT, model: GPT_IMAGE_2_MODEL });

    expect(M.llmText).toHaveBeenCalledTimes(1);
    expect(M.llmText.mock.calls[0][0]).toMatchObject({ label: 'prompt.enhance', prompt: PROMPT });
    expect(out.changed).toBe(true);
  });

  it('un rifiuto di checkRewrite chiama comunque llmText una volta: si paga lo stesso', async () => {
    M.llmText.mockResolvedValue({
      text: 'Scene: a kitchen counter with a golden retriever asleep under it',
      citations: []
    });

    const out = await enhancePrompt({ prompt: PROMPT, model: GPT_IMAGE_2_MODEL });

    expect(M.llmText).toHaveBeenCalledTimes(1);
    expect(out.changed).toBe(false);
    expect(out.prompt).toBe(PROMPT);
  });
});
