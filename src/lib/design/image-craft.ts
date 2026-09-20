/**
 * IL CRAFT IMMAGINE, PER MODELLO — gemello di `video-craft.ts`, stessa ragione.
 *
 * `PHOTO_CRAFT_SPECS` dice come si fa una fotografia e vale per tutti. Questo dice come si SCRIVE
 * a un modello preciso, e i quattro che serviamo vogliono cose opposte: GPT Image vuole segmenti
 * etichettati su righe separate, Nano Banana frasi connesse in un paragrafo, Seedream un comando
 * quando modifica e figure numerate quando compone. Scrivere a uno come si scrive a un altro non
 * produce un errore: produce un'immagine mediocre, che è il difetto che non si vede.
 *
 * L'INVERSIONE CHE VALE DA SOLA: su Nano Banana, per trasformare una foto in illustrazione
 * l'istruzione va accorciata, non allungata. È il contrario di quello che vale ovunque altrove, e
 * un modello a cui si accumulano vincoli su una trasformazione stilizzata torna verso la
 * fotografia. Nessuno lo indovina.
 *
 * ACCANTO AL MODELLO, NON DENTRO UN `if`. Stessa regola del CLAUDE.md sulle condizioni sparse, e
 * stessa forma del craft video: una tabella dove il caso nuovo è una riga. Un test verifica che
 * OGNI modello di `IMAGE_MODEL_CHOICES` abbia il suo craft — un modello aggiunto al registro senza
 * queste righe fa fallire il test invece di uscire in silenzio con un prompt generico.
 *
 * PER FAMIGLIA. `nano-banana-2`, `-2-lite`, `-pro` e gli id Gemini equivalenti condividono sintassi
 * e difetti: legarli uno per uno vorrebbe dire che la prossima variante esce senza craft.
 *
 * SCADONO CON I MODELLI. Ogni voce vale per la generazione che nomina; quando un modello cambia
 * versione questa riga va riletta, non ereditata.
 *
 * FONTE. `prompt-gpt-image-2.md`, `prompt-nano-banana.md` e `prompt-seedream.md` di SuperCMO Skills
 * (Copyright (c) 2026 Kshitiz Kumar, Apache-2.0), riscritti. Per Qwen non esiste una guida né lì né
 * altrove: quella voce dice solo ciò che il nostro registro sa per misura, e tace sul resto —
 * inventare un consiglio è peggio che non darne.
 */

export type ImageCraftEntry = {
  /** I frammenti di id a cui questa voce si applica. */
  models: readonly string[];
  text: string;
};

export const IMAGE_CRAFT: readonly ImageCraftEntry[] = [
  {
    models: ['nano-banana', 'gemini-3'],
    text: `MODEL NOTES — Nano Banana. Write connected sentences, never a keyword string, and say what the image is FOR and not only what is in it.
- Order inside the paragraph: subject, composition, action, location, style — then camera and lighting, then any on-image text.
- A named aesthetic is read holistically: it carries grain, palette and composition together, so naming the look is worth more than listing its parts.
- Category adjectives buy nothing. Optical behaviour, light hardness and one decided dominant tone are what land.
- Give every supplied reference a role — which is the subject, which is the style, which is the product to place — and address elements across them directly ("the jacket from image 1 on the person in image 2").
- A supplied face reads as a starting point, not a spec: say which features survive, clothing included, or the person gets reinvented.
- TURNING A PHOTO INTO AN ILLUSTRATION RUNS THE OTHER WAY: keep the instruction SHORT. Piling on constraints drags a stylized pass back toward a photograph, and so does camera vocabulary — leave it out. Name the making of the style (stroke weight, whether shading steps or blends, palette behaviour) rather than a studio or artist.`
  },
  {
    models: ['gpt-image'],
    text: `MODEL NOTES — GPT Image. Write labelled segments on separate lines, never one paragraph: Scene, Subject, Important details, Use case, Constraints.
- Name what the artifact IS — an ad, a UI screen, an infographic. Naming it buys layout discipline that a bare scene description does not.
- It spells accurately: put literal text in quotes, give its font feel, size, colour and placement, and spell a hard word letter by letter.
- If you want a photograph rather than an illustration, say so. It does not infer that from the subject.
- It cannot produce a transparent background. Ask for the ground you actually want.
- With several inputs, label each by index and role ("Image 1: the product, Image 2: the backdrop"), then say which element moves where. Repeat the preserve list on every iteration.
- When revising, one change per turn, written as Change / Preserve / Constraints.`
  },
  {
    models: ['seedream'],
    text: `MODEL NOTES — Seedream. Built to keep one thing recognisable — a face, a garment, a logo — while the rest of the frame changes.
- Address supplied images by figure number in the order they were sent (Image 1 upward) to move an element or a line of text between them.
- WHEN EDITING, WRITE A COMMAND, NOT A DESCRIPTION OF THE RESULT: name the exact target and state what must stay unchanged.
- Lead with what matters most — earlier concepts weigh more — and aim for 30 to 100 words of description, not keywords.
- Order: subject, action, setting, style, lighting, camera, on-image text in quotes, then the constraints that must hold.
- There is no negative field: phrase every exclusion as the thing you do want instead.`
  },
  {
    models: ['qwen'],
    text: `MODEL NOTES — Qwen. We have no prompting guide for this model, so treat the craft floor above as the whole instruction and keep the brief plain and concrete.
- It forwards at most three reference images; a fourth is dropped rather than refused, so decide which three carry the work.
- It takes the frame as a size rather than a ratio name, which the renderer already sets. Do not state an aspect ratio in the prompt.`
  }
] as const;

/** Il craft per il modello dato, o '' se non lo conosciamo. Mai un consiglio inventato. */
export function imageCraftFor(model: string | null | undefined): string {
  if (!model) {
    return '';
  }
  const id = model.toLowerCase();
  return IMAGE_CRAFT.find((entry) => entry.models.some((fragment) => id.includes(fragment)))?.text ?? '';
}
