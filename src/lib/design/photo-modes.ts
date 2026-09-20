/**
 * LE MODALITÀ DI SCATTO: la stessa fotografia, inquadrata per il lavoro che deve fare.
 *
 * `PHOTO_CRAFT_SPECS` dice come si fa una fotografia — luce, ombra, materiale — e vale sempre.
 * Questo dice cosa cambia fra uno scatto in piano e uno indossato: quale campo si scrive per primo,
 * cosa entra in campo, e la cosa che quella modalità sbaglia sempre.
 *
 * UNA TABELLA, NON DIECI FILE. La fonte di ispirazione ha dieci documenti da 74 righe l'uno, e il
 * 40% è la stessa frase ricopiata: il blocco che chiede di non ridisegnare il prodotto sta,
 * identico, in tutti e dieci. Una regola scritta in dieci posti diverge al primo cambiamento, e
 * diverge in silenzio — è precisamente ciò che il CLAUDE.md vieta. Qui ogni modalità è una RIGA, e
 * ciò che hanno in comune non è ricopiato: sta nel pavimento, una volta sola.
 *
 * `fields` È L'ORDINE, E L'ORDINE È IL CONTENUTO. Un flat-lay comincia dall'angolo — perpendicolare,
 * o non è un flat-lay — e un hero dalla composizione. Scrivere gli stessi campi in un ordine
 * qualunque produce un prompt che descrive un'altra fotografia: un test verifica che nessuna
 * modalità condivida l'ordine di un'altra, perché due ordini uguali sono due righe dove ne basta
 * una.
 *
 * Client-safe come il resto di `$lib/design/`: la UI mostra le stesse modalità che il modello legge.
 *
 * FONTE. I dieci `mode-*.md` di SuperCMO Skills (Copyright (c) 2026 Kshitiz Kumar, Apache-2.0):
 * presi il taglio delle modalità, l'ordine dei campi e le trappole di ciascuna, riscritti in forma
 * di registro con il nostro vocabolario. Nessun testo trasportato.
 */

export type PhotoModeId =
  | 'hero'
  | 'flat-lay'
  | 'on-model'
  | 'close-up'
  | 'lifestyle'
  | 'studio';

export type PhotoMode = {
  id: PhotoModeId;
  /** Quando un brief finisce qui invece che in un'altra modalità. */
  useWhen: string;
  /** Cosa sta nell'inquadratura. Tutto il resto è di troppo. */
  inFrame: string;
  /** Il modo in cui QUESTA modalità si rompe — non i difetti generali, che stanno nel pavimento. */
  avoid: string;
  /** I campi da scrivere, in quest'ordine. L'ordine appartiene alla modalità. */
  fields: readonly string[];
};

export const PHOTO_MODES: readonly PhotoMode[] = [
  {
    id: 'hero',
    useWhen: 'one frame has to carry a campaign on its own — the lead image of an ad, a banner, an email header.',
    inFrame: 'the product, a controlled setting, at most a prop or two.',
    avoid: 'a setting that tells its own story, a person as the subject, props that pull the eye off the product.',
    fields: ['composition', 'set and background', 'lighting', 'props', 'depth', 'camera and lens', 'atmosphere']
  },
  {
    id: 'flat-lay',
    useWhen: 'the product and what belongs with it are arranged on one surface and shot straight down.',
    inFrame: 'the product and its supporting objects, all on a single plane.',
    avoid: 'any angle other than perpendicular, objects tall enough to break the plane, a prop crossing over the product.',
    fields: ['camera directly overhead, lens parallel to the surface', 'surface', 'composition', 'supporting objects', 'lighting', 'palette']
  },
  {
    id: 'on-model',
    useWhen: 'the product is worn, held or applied, and a person has to be in frame for it to read.',
    inFrame: 'a person and the product, with the product still the subject.',
    avoid: 'the person becoming the subject, wardrobe or hair that out-competes the product, a pose nobody holds.',
    fields: ['crop and pose', 'how the product is worn or held', 'wardrobe', 'setting', 'lighting', 'expression', 'camera and lens']
  },
  {
    id: 'close-up',
    useWhen: 'the subject is one aspect of the product — a seam, a clasp, a finish, a texture.',
    inFrame: 'one feature and the few centimetres around it.',
    avoid: 'the whole product, a setting, more than one property competing in the same frame.',
    fields: ['what the crop is on', 'scale', 'lighting for that surface', 'focus plane', 'macro lens and aperture']
  },
  {
    id: 'lifestyle',
    useWhen: 'the product sits in a real place — in use, or lived with in a room the buyer recognises.',
    inFrame: 'a real setting, objects belonging to whoever lives there, optionally a hand or part of a person.',
    avoid: 'a person as the subject, a set that reads as built for the camera, a room tidier than anyone lives in.',
    fields: ['the place', 'what is happening', 'where the product sits in it', 'natural light and time of day', 'camera and lens']
  },
  {
    id: 'studio',
    useWhen: 'the product has to be shown plainly and accurately — a catalogue, a listing, a spec page.',
    inFrame: 'the product and the ground it sits on. Nothing else.',
    avoid: 'styling, a story, an atmosphere, a prop. Anything that makes it a picture instead of a record.',
    fields: ['background', 'product placement and angle', 'lighting', 'shadow', 'camera and lens']
  }
] as const;

const BY_ID = new Map(PHOTO_MODES.map((m) => [m.id, m]));

/** Il blocco di prompt per una modalità, o '' se non la conosciamo. */
export function photoModeSpec(id: PhotoModeId): string {
  const mode = BY_ID.get(id);
  if (!mode) {
    return '';
  }
  return `SHOT MODE — ${mode.id}: ${mode.useWhen}
In frame: ${mode.inFrame}
This mode breaks on: ${mode.avoid}
Write the scene in this order: ${mode.fields.join(', ')}.`;
}
