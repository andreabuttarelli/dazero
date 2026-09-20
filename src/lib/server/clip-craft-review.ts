/**
 * IL GIUDICE DELLA CLIP: guarda il video reso e dice quali FATTI mancano.
 *
 * Gemello di `photo-craft-review.ts`, un medium più in là. Esiste perché il mestiere della resa UGC
 * è entrato nei brief senza un modo di sapere se serve: la terza mano che compare quando la battuta
 * descrive tre compiti, il teletrasporto di un oggetto che cambia posto senza un movimento, il
 * labiale sbavato dal parlato continuo. Regole scritte bene che nessuno verifica sono regole che il
 * modello salta.
 *
 * NON È UN CANCELLO. Una clip con un difetto di resa è una clip peggiore, non una da buttare — e
 * una clip costa molto più di un'immagine, quindi scartarla su un giudizio brucerebbe il budget
 * video di un brand in un pomeriggio. Il verdetto non ha un `pass`: non c'è niente da cui far
 * dipendere un rifiuto, e un test lo fissa.
 *
 * SOLO COSE CHE SI VEDONO GUARDANDO. Quante mani sono in campo, se un oggetto è saltato da un posto
 * all'altro, se la bocca si muove quando esce voce. Mai «la clip è bella»: una domanda che il
 * modello non può decidere guardando è una a cui risponde a caso, e un giudizio a caso è peggio di
 * nessun giudizio.
 *
 * IL VIDEO INTERO, NON I FRAME. `llmStructured` prende un `file` con `mediaType: 'video/mp4'` — è
 * la stessa strada di `motion-references.ts`, che studia le clip di mercato così. Metà di questi
 * difetti esiste solo nel TEMPO: un teletrasporto non si vede in un fotogramma, si vede fra due.
 */
import { llmConfigured, llmStructured } from '$lib/server/llm';

export type ClipCraftCheck = {
  id: string;
  looksFor: string;
};

/** Uno per ogni difetto di resa che `UGC_CRAFT_SPECS` promette di evitare. */
export const CLIP_CRAFT_CHECKS: readonly ClipCraftCheck[] = [
  {
    id: 'hand-count',
    looksFor:
      'Does every person keep exactly two hands throughout? Answer false when a third hand, a duplicated arm or a hand with the wrong number of fingers appears in any frame, even briefly.'
  },
  {
    id: 'no-teleport',
    looksFor:
      'Do objects and people move only by visible motion? Answer false when something jumps to a new place, changes how it is held, or appears and disappears between one moment and the next without a movement that carries it there.'
  },
  {
    id: 'lip-sync',
    looksFor:
      'When a voice is heard, does the mouth move with it? Answer false when lips move with no speech, keep moving after the line ends, or smear into a blur while the person talks. Answer true when nobody speaks on camera.'
  },
  {
    id: 'no-burned-text',
    looksFor:
      'Is the picture free of text? Answer false when subtitles, captions, a watermark, a logo, a title card or any readable lettering is burned into the frame.'
  },
  {
    id: 'product-identity',
    looksFor:
      'Does the product keep the same shape, colour, label and proportions for the whole clip? Answer false when it morphs, changes colour, or its label redraws itself between shots.'
  },
  {
    id: 'no-frozen-beat',
    looksFor:
      'Is something actually moving throughout? Answer false when a stretch of the clip is a held pose with nothing changing — no weight shift, no breath, no gesture — as if a still had been stretched in time.'
  }
] as const;

const CHECK_IDS = new Set(CLIP_CRAFT_CHECKS.map((c) => c.id));

export type ClipCraftVerdict = {
  /** Quanti controlli hanno davvero ricevuto una risposta. Zero significa: non ho guardato. */
  checked: number;
  failed: string[];
  unrun: string | null;
};

export type ClipCraftJudge = (input: {
  instructions: string;
  clip: { mediaType: string; data: string };
}) => Promise<{ checks: Array<{ id: string; ok: boolean; detail?: string }> }>;

type ReviewInput = {
  clip: string;
  brief: string;
};

const SCHEMA = {
  type: 'object' as const,
  properties: {
    checks: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          id: { type: 'string' as const, description: 'The exact id of the check you are answering' },
          ok: { type: 'boolean' as const, description: 'True when the clip satisfies the check' },
          detail: { type: 'string' as const, description: 'One short clause naming what you saw, and when. Empty when ok.' }
        },
        required: ['id', 'ok']
      }
    }
  },
  required: ['checks']
};

function clipPart(dataUrl: string): { mediaType: string; data: string } | null {
  const match = dataUrl.match(/^data:(video\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i);
  return match ? { mediaType: match[1].toLowerCase(), data: match[2] } : null;
}

export function buildClipInstructions(brief: string): string {
  const list = CLIP_CRAFT_CHECKS.map((c) => `- ${c.id}: ${c.looksFor}`).join('\n');
  return `You inspect one generated video clip and answer a fixed list of factual questions about it.

Watch the whole clip before answering. Several of these faults exist only across time — something that jumps position, a hand that appears for a moment — so a single frame will not settle them.

Answer ONLY from what is visible and audible. Never judge whether the clip is good, on-brand or persuasive: every question below is about something that either happens or does not. A question you cannot decide by watching is one you answer true.

Return one entry per check, using the exact id given.

CHECKS:
${list}

THE BRIEF THE CLIP WAS MADE FROM (it decides what was asked for):
${brief.trim() || '(none)'}`;
}

const judgeWithLlm: ClipCraftJudge = async ({ instructions, clip }) => {
  if (!llmConfigured()) {
    throw new Error('nessun modello configurato');
  }
  return await llmStructured<{ checks: Array<{ id: string; ok: boolean; detail?: string }> }>({
    prompt: instructions,
    schema: SCHEMA,
    file: clip,
    label: 'clip.craft',
    reasoningEffort: 'low'
  });
};

export async function reviewClipCraft(
  input: ReviewInput,
  deps: { judge?: ClipCraftJudge } = {}
): Promise<ClipCraftVerdict> {
  const clip = clipPart(input.clip);
  if (!clip) {
    return { checked: 0, failed: [], unrun: 'non è un video' };
  }
  try {
    const result = await (deps.judge ?? judgeWithLlm)({
      instructions: buildClipInstructions(input.brief),
      clip
    });
    const answered = (result?.checks ?? []).filter((c) => CHECK_IDS.has(c.id));
    return {
      checked: answered.length,
      failed: answered.filter((c) => c.ok === false).map((c) => c.id),
      unrun: null
    };
  } catch (error) {
    return { checked: 0, failed: [], unrun: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Il tetto sulla clip da scaricare. Una clip UGC da 15s sta molto sotto; oltre questo si dichiara
 * e si passa, invece di tirarsi in memoria un file che nessuno ha misurato.
 */
const MAX_CLIP_BYTES = 40_000_000;

/**
 * Giudica una clip DA DOVE È STATA SALVATA. `renderVideo` restituisce una URL, non dei byte: senza
 * questa porta il giudice sarebbe inutilizzabile proprio da chi rende.
 *
 * `fetchImpl` è iniettabile per il test — la rete è l'unica cosa qui che non si può far fallire a
 * comando, ed è anche quella che fallisce più spesso.
 */
export async function reviewClipAt(
  url: string,
  brief: string,
  deps: { judge?: ClipCraftJudge; fetchImpl?: typeof fetch } = {}
): Promise<ClipCraftVerdict> {
  try {
    const res = await (deps.fetchImpl ?? fetch)(url);
    if (!res.ok) {
      return { checked: 0, failed: [], unrun: `la clip non si scarica (${res.status})` };
    }

    const mediaType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!mediaType.startsWith('video/')) {
      return { checked: 0, failed: [], unrun: `non è un video (${mediaType || 'tipo ignoto'})` };
    }

    // Il peso dichiarato si guarda PRIMA di leggere il corpo: dopo, il file è già in memoria e il
    // controllo non ha protetto niente.
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > MAX_CLIP_BYTES) {
      return { checked: 0, failed: [], unrun: `clip troppo grande da guardare (${declared} byte)` };
    }

    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.byteLength > MAX_CLIP_BYTES) {
      return { checked: 0, failed: [], unrun: `clip troppo grande da guardare (${bytes.byteLength} byte)` };
    }

    return await reviewClipCraft(
      { clip: `data:${mediaType};base64,${bytes.toString('base64')}`, brief },
      deps
    );
  } catch (error) {
    return { checked: 0, failed: [], unrun: error instanceof Error ? error.message : String(error) };
  }
}

/** La riga che un report stampa: cosa è caduto, o perché non si è guardato. */
export function clipCraftFindings(verdict: ClipCraftVerdict): string {
  if (verdict.unrun) {
    return `resa: non eseguito — ${verdict.unrun}`;
  }
  if (!verdict.failed.length) {
    return `resa: ${verdict.checked}/${verdict.checked} passati`;
  }
  return `resa: ${verdict.failed.length} su ${verdict.checked} caduti — ${verdict.failed.join(', ')}`;
}
