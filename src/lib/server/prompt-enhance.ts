/**
 * RISCRIVE IL BRIEF NELLA FORMA CHE QUEL MODELLO VUOLE.
 *
 * I registri `image-craft` e `video-craft` mettono le note ACCANTO al prompt: istruzioni che il
 * modello deve applicare da solo mentre disegna. Questo fa l'altra metà — restituisce il brief
 * GIÀ riscritto: segmenti etichettati per GPT Image, un paragrafo di frasi connesse per Nano
 * Banana, un comando invece di una descrizione quando Seedream modifica.
 *
 * IL REGISTRO È LA FONTE, QUESTO È UN SUO CONSUMATORE. Il prompt di sistema si compone da
 * `imageCraftFor` / `videoCraftFor`: tenere qui una seconda copia delle regole per modello
 * significherebbe vederle divergere al primo modello nuovo, che è precisamente il difetto che il
 * registro esiste per evitare.
 *
 * LA RISCRITTURA SI VERIFICA, NON SI SPERA. Un riscrittore che cambia anche il CONTENUTO è il modo
 * normale in cui questi strumenti falliscono: il brief dice «un barattolo di miele» e torna con un
 * cane sotto il tavolo. Quindi ogni output passa da `checkRewrite` prima di essere accettato, e un
 * output che non passa non viene corretto — si scarta e torna l'originale. Un prompt che l'utente
 * ha scritto lui non si sostituisce con qualcosa di peggio.
 *
 * I CONTROLLI SONO DETERMINISTICI, NON UN SECONDO GIUDIZIO. Un LLM che giudica l'output di un LLM
 * costa un'altra chiamata e sbaglia in modo correlato al primo. Qui: ogni cosa che il brief nomina
 * deve essere ancora nella riscrittura (`tokenize`, lo stesso dei link interni), e le tre regole
 * che si vedono con una regex — testo leggibile chiesto, inquadratura dichiarata, lunghezza fuori
 * scala — si controllano così.
 *
 * SI MISURA CIÒ CHE È SPARITO, NON CIÒ CHE È COMPARSO. La prima versione contava anche il
 * vocabolario nuovo, e sul modello vero rifiutava TUTTO: una riscrittura buona porta 86 token dove
 * il brief ne aveva 5, perché nominare luce, materiale e ottica è esattamente il mestiere che le
 * abbiamo chiesto. Quel controllo misurava il craft e lo chiamava invenzione — e per giunta in una
 * lingua sola, perché un brief italiano ha ogni parola «nuova».
 *
 * MAI UN RIFIUTO SU UN MODELLO SCONOSCIUTO. Torna il prompt invariato con `changed: false` e il
 * motivo nelle note, come `imageCraftFor` torna '' invece di inventare.
 */
import { generateText } from 'ai';
import { env } from '$env/dynamic/private';
import { craftAgentModel } from '$lib/server/craft-model';
import { imageCraftFor } from '$lib/design/image-craft';
import { videoCraftFor } from '$lib/design/video-craft';
import { PHOTO_CRAFT_SPECS } from '$lib/design/photo-craft';
import { photoModeSpec, type PhotoModeId } from '$lib/design/photo-modes';
import { tokenize } from '$lib/server/backlink-network';

export type EnhanceInput = {
  prompt: string;
  model: string;
  shotMode?: PhotoModeId;
};

export type EnhanceResult = {
  prompt: string;
  model: string;
  changed: boolean;
  /** Cosa è stato fatto, o perché non si è fatto niente. Un riscrittore muto è una scatola nera. */
  notes: string[];
};

export type EnhanceRunner = (opts: { system: string; prompt: string }) => Promise<string>;

/**
 * IL TETTO SULLA LUNGHEZZA, E PERCHÉ È COSÌ ALTO.
 *
 * Misurato sul modello vero: «a jar of honey on a linen cloth, morning light» — 46 caratteri —
 * torna in 1.010, ventidue volte tanto, e la riscrittura è BUONA: nomina l'ombra di contatto, la
 * temperatura in Kelvin, la trama del lino. È il craft che fa il suo lavoro, non gonfiore.
 *
 * Quindi questo non è un limite proporzionale — misurarlo in multipli boccia proprio i brief corti,
 * che sono quelli che hanno più bisogno di essere riscritti. È solo il muro contro cui va a
 * sbattere un modello che ha perso il filo e continua a scrivere: un prompt immagine oltre questa
 * soglia non lo legge nessun renderer per intero.
 */
const MAX_REWRITE_CHARS = 4_000;

/**
 * QUANTE PAROLE DEL BRIEF POSSONO MANCARE PRIMA CHE SIA UN ALTRO BRIEF.
 *
 * `tokenize` tiene le parole oltre le tre lettere e fuori dalle stopword: quasi sempre i sostantivi
 * che nominano le cose — «honey», «linen», «keyboard». Se spariscono, è un altro soggetto.
 *
 * Ma non tutte quelle parole sono una cosa. Misurato sul modello vero: «morning light» torna come
 * «Low morning sun rakes in from the left at a warm 3800K» — la luce c'è, descritta meglio di
 * com'era, e la parola «light» no. Pretendere ogni parola bocciava due riscritture su cinque, tutte
 * giuste. Un elenco di sinonimi le salverebbe e sarebbe una taratura a occhio senza fine: «sun» per
 * «light», «dawn» per «morning», e via così in ogni lingua.
 *
 * Una sola parola può mancare, quindi, e non di più. Un brief di due o tre sostantivi resta
 * protetto — perderne uno su tre supera comunque la soglia — e il caso che conta davvero, la scena
 * sostituita da un'altra, ne perde molte insieme.
 *
 * L'altra metà del controllo — quanto vocabolario è COMPARSO — è stata misurata e buttata: una
 * riscrittura buona porta 86 parole dove il brief ne aveva 5, perché nominare luce, materiale e
 * ottica È il mestiere che le abbiamo chiesto.
 */
const MAX_LOST_TOKENS = 1;

const ASKS_FOR_TEXT =
  /\b(?:the (?:words?|text|caption|headline)|reading|that reads|labell?ed with|spelling out)\b|"[^"]{2,}"\s*(?:on|across|over|printed)/i;

const DECLARES_FRAME = /\b\d{1,2}\s*:\s*\d{1,2}\b|\b(?:portrait|landscape|square)\s+(?:format|orientation|crop)\b|\b\d{3,4}\s*[x×]\s*\d{3,4}\b/i;

const runWithModel: EnhanceRunner = async ({ system, prompt }) => {
  // Il tier pro come gli altri mestieri, con la sua scappatoia: riscrivere un brief è un lavoro di
  // forma, e un modello veloce restituisce una parafrasi. Bassa temperatura perché qui fantasia
  // significa inventare soggetti — esattamente ciò che `checkRewrite` scarta.
  const { model } = craftAgentModel({ envModel: env.ENHANCE_PROMPT_MODEL });
  const { text } = await generateText({ model, system, prompt, temperature: 0.3 });
  return text ?? '';
};

/** Il craft del modello, immagine o video: chi dei due lo conosce risponde. */
export function craftForModel(model: string): string {
  return imageCraftFor(model) || videoCraftFor(model);
}

export function buildEnhanceSystem(model: string, shotMode?: PhotoModeId): string {
  const craft = craftForModel(model);
  const mode = shotMode ? `\n\n${photoModeSpec(shotMode)}` : '';
  return `You rewrite a generation brief so it is in the shape the model rendering it actually wants. You are not writing a new brief: you are re-expressing the one you are given.

RULES YOU CANNOT BREAK — a rewrite that breaks one is thrown away and the original is used instead:
- Keep every subject, object, place and action the brief names. Add none. If the brief says a jar of honey on a cloth, the rewrite is about that jar and that cloth.
- Never ask for readable text, words, letters, labels or numbers in the picture.
- Never state an aspect ratio, a resolution, a crop or an orientation. The renderer sets the frame.
- Never describe a named person's face, body, age or ethnicity.
- Stay close in length. Re-expressing is not padding.

Output ONLY the rewritten brief. No preamble, no explanation, no markdown fences.

${craft}

THE CRAFT THE BRIEF MUST ALREADY RESPECT (do not restate it in the output — it reaches the model separately):
${PHOTO_CRAFT_SPECS}${mode}`;
}

/**
 * Il controllo sulla riscrittura. Torna il motivo del rifiuto, o null se va bene.
 *
 * Deterministico di proposito: i token del brief che devono sopravvivere, e le tre cose che si
 * vedono con una regex. Un secondo LLM costerebbe un'altra chiamata e sbaglierebbe in modo
 * correlato al primo.
 */
export function checkRewrite(original: string, rewritten: string): string | null {
  const text = rewritten.trim();
  if (!text) {
    return 'il modello non ha restituito niente';
  }
  if (text.length > MAX_REWRITE_CHARS) {
    return 'la riscrittura è più lunga di quanto un renderer legga';
  }
  if (ASKS_FOR_TEXT.test(text) && !ASKS_FOR_TEXT.test(original)) {
    return 'la riscrittura chiede testo leggibile, che il brief non chiedeva';
  }
  if (DECLARES_FRAME.test(text) && !DECLARES_FRAME.test(original)) {
    return "la riscrittura dichiara un'inquadratura, che decide il renderer";
  }

  const before = tokenize(original);
  const after = tokenize(text);

  // Ogni cosa che il brief nomina deve essere ancora lì. Una riscrittura che parla d'altro non è
  // una forma diversa, è un altro brief — e nominare la luce, il materiale e l'ottica, che è ciò
  // che il craft aggiunge, non toglie niente a questo conto.
  const lost = [...before].filter((token) => !isCovered(token, after));
  if (lost.length > MAX_LOST_TOKENS) {
    return `la riscrittura ha perso per strada ciò che il brief nomina: ${lost.slice(0, 4).join(', ')}`;
  }
  return null;
}

/**
 * Una parola del brief è ancora lì anche se torna flessa: «light» come «lighting», «shadow» come
 * «shadows». Misurato sul modello vero — un confronto letterale rifiutava una riscrittura buona
 * perché aveva scritto «morning lighting» invece di «morning light».
 *
 * Il prefisso basta e non allarga troppo: `tokenize` ha già tolto le parole sotto le quattro
 * lettere, quindi non ci sono frammenti corti che collidono con mezzo vocabolario.
 */
function isCovered(token: string, words: Set<string>): boolean {
  if (words.has(token)) {
    return true;
  }
  for (const word of words) {
    if (word.startsWith(token) || token.startsWith(word)) {
      return true;
    }
  }
  return false;
}

export async function enhancePrompt(
  input: EnhanceInput,
  deps: { run?: EnhanceRunner } = {}
): Promise<EnhanceResult> {
  const unchanged = (note: string): EnhanceResult => ({
    prompt: input.prompt,
    model: input.model,
    changed: false,
    notes: [note]
  });

  if (!craftForModel(input.model)) {
    return unchanged(`nessuna guida di mestiere per ${input.model}: il brief resta com'era`);
  }

  let rewritten: string;
  try {
    rewritten = await (deps.run ?? runWithModel)({
      system: buildEnhanceSystem(input.model, input.shotMode),
      prompt: input.prompt
    });
  } catch (error) {
    return unchanged(error instanceof Error ? error.message : String(error));
  }

  const refused = checkRewrite(input.prompt, rewritten);
  if (refused) {
    return unchanged(refused);
  }

  return {
    prompt: rewritten.trim(),
    model: input.model,
    changed: true,
    notes: [`riscritto nella forma che ${input.model} vuole`]
  };
}
