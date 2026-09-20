/**
 * IL CRAFT VIDEO, PER MODELLO — perché i modelli non sbagliano le stesse cose.
 *
 * `buildVideoPrompt` scrive lo stesso prompt per Seedance, Grok e Kling. Ma Seedance vuole il
 * soggetto per primo e aggiunge sottotitoli da solo; Grok pesa le prime trenta parole e ignora
 * quasi sempre ciò che gli chiedi di NON fare; Kling vuole frasi corte e si confonde su tre
 * personaggi se non li etichetti. Un prompt solo per tutti e tre è un prompt scritto bene per
 * nessuno.
 *
 * QUI, E NON IN UN `if` DENTRO `buildVideoPrompt`. Il CLAUDE.md lo dice per le eccezioni: si
 * dichiarano in un posto solo, accanto al modello che le governa, in una tabella dove il caso
 * nuovo è una riga e tutti si vedono insieme. Un `if (model === 'seedance')` nel costruttore del
 * prompt è la prima di cinque condizioni sparse che al terzo modello nessuno sa più elencare.
 *
 * PER FAMIGLIA, NON PER ID ESATTO. `seedance-2-5`, `-2`, `-2-fast` e `-2-mini` condividono la
 * sintassi e i difetti: legarli uno per uno vorrebbe dire che il prossimo `-2-ultra` esce senza
 * craft e nessuno se ne accorge, che è esattamente come il pavimento delle immagini è caduto.
 *
 * SCADONO. Ogni voce vale per una generazione di modelli e non per sempre: quando un modello
 * cambia versione, questa riga va riletta prima di essere ereditata. È il prezzo di una guida che
 * dice cose vere invece di generalità che non scadono perché non dicono niente.
 *
 * FONTE. I sei `prompt-*.md` di SuperCMO Skills (Copyright (c) 2026 Kshitiz Kumar, Apache-2.0),
 * riscritti: presi i cataloghi dei difetti e le sintassi, non il testo.
 */

export type VideoCraftEntry = {
  /** I prefissi di famiglia a cui questa voce si applica. */
  models: readonly string[];
  text: string;
};

export const VIDEO_CRAFT: readonly VideoCraftEntry[] = [
  {
    models: ['bytedance/seedance', 'seedance'],
    text: `MODEL NOTES — Seedance. Lead with the subject, then the action, then the camera, then the setting.
- It adds subtitles, logos and platform watermarks on its own. Ban them in words: there is no negative field.
- Mirror-flat surfaces — mirrors, glass tabletops, still water, polished floors — come back as broken, mismatched duplicates of the scene. Keep them out of frame, or do not rely on the reflection reading correctly. Moving water (surf, rain, ripples) is fine.
- More than four reference people degrades into miscounts and duplicated "twin" characters. For one consistent face use a headshot plus a full-body shot, never a multi-view sheet, which it reads as separate people.
- Instability comes from over-slicing a clip into more shots than it can hold, not from stating when each one runs. Few, wide time spans beat many tight ones.
- Open with the subjects already in place rather than on an empty establishing shot, unless a reveal is the point.
- One clear action at a moderate speed. Several at once, or motion pushed fast, turns rubbery and objects drift.`
  },
  {
    models: ['grok-imagine', 'grok'],
    text: `MODEL NOTES — Grok Imagine. The first twenty to thirty words carry the most weight, and what you describe first is rendered first. Aim for 30–60 words overall.
- Instructions about what to leave out are unreliable here. Describe the scene you want; do not list what you do not want.
- Name one camera move and let it complete. Stacked actions are the commonest way a clip comes back wrong.
- State the audio line explicitly or it is left to inference.`
  },
  {
    models: ['kling'],
    text: `MODEL NOTES — Kling. Write like a director's script: two to five short, punchy sentences, one idea each. One long compound sentence performs worse.
- Motion comes from verbs. Say what moves, what holds still, and in what order.
- Bind every line of dialogue to its speaker with a label — [Character A: role, tone]: "line" — and keep the label identical every time that person speaks.
- With three or more distinct characters, tag the references (@Element1, @Element2) or faces and outfits blend into each other.
- Strings of aesthetic tags ("cinematic, 4K, dramatic lighting") do nothing. Describe the scene.
- Shorter clips hold motion tighter; long durations drift, so use them only for real narrative development.`
  }
] as const;

/** Il craft per il modello dato, o '' se non lo conosciamo. Mai un consiglio inventato. */
export function videoCraftFor(model: string | null | undefined): string {
  if (!model) {
    return '';
  }
  const id = model.toLowerCase();
  return VIDEO_CRAFT.find((entry) => entry.models.some((prefix) => id.includes(prefix)))?.text ?? '';
}
