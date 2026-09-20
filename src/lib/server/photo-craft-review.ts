/**
 * IL GIUDICE DEL MESTIERE: guarda l'immagine resa e dice quali FATTI mancano.
 *
 * Esiste perché il craft fotografico (`$lib/design/photo-craft`) è entrato nei prompt senza un modo
 * per sapere se serve a qualcosa. Una regola nel prompt che nessuno verifica è una regola che il
 * modello ignora — è già successo col ricettario delle transizioni del motion, ed è la ragione per
 * cui ogni skill di `default-skills.ts` dichiara il suo `gate`.
 *
 * NON È UN CANCELLO, ED È LA DIFFERENZA CHE CONTA. `reviewImageConstraints` rifiuta un render:
 * un logo inventato su una maglietta è una violazione, e l'immagine non si spedisce. Qui no.
 * Un'ombra di contatto assente è un'immagine PEGGIORE, non una da buttare, e un cancello che
 * scarta su un giudizio estetico brucia crediti veri su un parere. Per questo il verdetto non ha
 * un `pass`: non c'è niente da cui far dipendere un rifiuto, e un test lo fissa.
 *
 * SOLO FATTI, MAI GUSTI. Ogni controllo chiede una cosa che si vede o non si vede: c'è la cucitura
 * scura sotto l'oggetto? c'è uno stativo in scena? il prodotto è stato aperto? Nessuno chiede se
 * l'immagine è bella. Un controllo che non si può decidere guardando è un controllo che il modello
 * risponde a caso, e un giudizio a caso è peggio di nessun giudizio.
 *
 * UN GIRO NON ESEGUITO NON È VERDE. Se il gateway cade, il verdetto esce con `checked: 0` e
 * `unrun` valorizzato, e `photoCraftFindings` lo stampa. La regola è quella degli eval: un report
 * che confonde «nessun difetto» con «non ho guardato» è peggio di nessun report.
 */
import { llmConfigured, llmImagesFromInline, llmStructured } from '$lib/server/llm';

type ImagePart = { inlineData: { mimeType: string; data: string } };

/**
 * Un controllo è un difetto con un modo di vederlo. `looksFor` finisce nel prompt del giudice: è
 * la frase che gli dice cosa cercare, quindi descrive il pixel, mai la qualità.
 */
export type PhotoCraftCheck = {
  id: string;
  looksFor: string;
};

/**
 * I controlli. Uno per ciascuna promessa del craft che si può verificare guardando: se una regola
 * del prompt non ha il suo controllo qui, è una riga che paghiamo a ogni render senza sapere se
 * viene applicata.
 */
export const PHOTO_CRAFT_CHECKS: readonly PhotoCraftCheck[] = [
  {
    id: 'contact-shadow',
    looksFor:
      'Where the subject rests on a surface, is there a darker seam of contact shadow right at the meeting line? Answer false when the subject appears to float or looks pasted onto the background with no shadow joining it to what it sits on.'
  },
  {
    id: 'no-lighting-gear',
    looksFor:
      'Is the frame free of photographic equipment? Answer false when a softbox, strip light, beauty dish, reflector, light stand, tripod or studio flash is visible in the picture. A lamp, window, candle, screen or fire that belongs to the scene is fine.'
  },
  {
    id: 'product-state',
    looksFor:
      'Is the product in the closed, sealed, assembled state it would arrive in? Answer false when it has been opened, uncapped, unwrapped, unfastened, taken apart or emptied without the brief asking for it — a cap set down beside a bottle, a lid off, an open box.'
  },
  {
    id: 'no-unasked-text',
    looksFor:
      'Is the image free of readable text that the brief did not ask for? Answer false when there are invented words, a headline, a caption, a label, a price, a watermark or garbled letterforms that no instruction requested.'
  },
  {
    id: 'material-texture',
    looksFor:
      'Do the surfaces show their real texture — weave, grain, pores, tool marks, scratches? Answer false when everything wears the same uniform plastic sheen, or skin is smoothed until it has no pores.'
  },
  {
    id: 'shadow-direction',
    looksFor:
      'Do all the shadows fall away from a single light direction? Answer false when shadows point in conflicting directions, or an object casts none while its neighbour does.'
  }
] as const;

const CHECK_IDS = new Set(PHOTO_CRAFT_CHECKS.map((c) => c.id));

export type PhotoCraftVerdict = {
  /** Quanti controlli hanno davvero ricevuto una risposta. Zero significa: non ho guardato. */
  checked: number;
  /** Gli id caduti. Mai una frase libera: un id si conta, una frase si legge e basta. */
  failed: string[];
  /** Il motivo per cui il giro non è avvenuto, o null. */
  unrun: string | null;
};

export type PhotoCraftJudge = (input: {
  instructions: string;
  image: ImagePart;
}) => Promise<{ checks: Array<{ id: string; ok: boolean; detail?: string }> }>;

type ReviewInput = {
  image: string;
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
          ok: { type: 'boolean' as const, description: 'True when the image satisfies the check' },
          detail: { type: 'string' as const, description: 'One short clause naming what you saw. Empty when ok.' }
        },
        required: ['id', 'ok']
      }
    }
  },
  required: ['checks']
};

function imagePart(dataUrl: string): ImagePart | null {
  const match = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i);
  return match ? { inlineData: { mimeType: match[1].toLowerCase(), data: match[2] } } : null;
}

export function buildCraftInstructions(brief: string): string {
  const list = PHOTO_CRAFT_CHECKS.map((c) => `- ${c.id}: ${c.looksFor}`).join('\n');
  return `You inspect one generated image and answer a fixed list of factual questions about it.

Answer ONLY from what is visible in the picture. Never judge whether the image is good, on-brand or attractive — every question below is about something that is either present or absent, and a question you cannot decide by looking is one you answer true.

Return one entry per check, using the exact id given.

CHECKS:
${list}

THE BRIEF THE IMAGE WAS MADE FROM (it decides what was asked for):
${brief.trim() || '(none)'}`;
}

const judgeWithLlm: PhotoCraftJudge = async ({ instructions, image }) => {
  if (!llmConfigured()) {
    throw new Error('nessun modello configurato');
  }
  return await llmStructured<{ checks: Array<{ id: string; ok: boolean; detail?: string }> }>({
    prompt: instructions,
    schema: SCHEMA,
    images: llmImagesFromInline([image]),
    label: 'image.craft',
    reasoningEffort: 'low'
  });
};

export async function reviewPhotoCraft(
  input: ReviewInput,
  deps: { judge?: PhotoCraftJudge } = {}
): Promise<PhotoCraftVerdict> {
  const image = imagePart(input.image);
  if (!image) {
    return { checked: 0, failed: [], unrun: 'immagine non valida' };
  }
  try {
    const result = await (deps.judge ?? judgeWithLlm)({
      instructions: buildCraftInstructions(input.brief),
      image
    });
    // Solo gli id che conosciamo: un modello che inventa un controllo altrimenti sposta il conto,
    // e un conto che si muove da solo non misura più niente.
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

/** La riga che un report stampa: cosa è caduto, o perché non si è guardato. */
export function photoCraftFindings(verdict: PhotoCraftVerdict): string {
  if (verdict.unrun) {
    return `mestiere: non eseguito — ${verdict.unrun}`;
  }
  if (!verdict.failed.length) {
    return `mestiere: ${verdict.checked}/${verdict.checked} passati`;
  }
  return `mestiere: ${verdict.failed.length} su ${verdict.checked} caduti — ${verdict.failed.join(', ')}`;
}
