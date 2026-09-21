import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  APPROVABLE_STATUSES,
  POST_CONTENT_TYPES,
  approvePostContract,
  crossPostContract,
  rejectPostContract,
  reschedulePostContract,
  updatePostContract
} from './post-tools';

/**
 * Questo file È il pattern: quando aggiungi un tool a contratto, aggiungilo a
 * CONTRACTS qui sotto e (se tocca il DB in modo puro) dagli una sample call con il
 * testkit. I due controlli generici valgono per tutti senza scrivere altro:
 *
 * 1. ogni valore di enum DICHIARATO nel contratto compare davvero nel testo del tool
 *    (description + describe dei parametri) — se qualcuno riscrive la description a
 *    mano senza interpolare dalla costante, questo fallisce;
 * 2. ogni token "macchina" del vocabolario (pending_user, generated_video, …) citato
 *    nel testo DEVE essere dichiarato in `enums` — una description che insegna un
 *    valore che il contratto non possiede è esattamente la deriva dell'audit.
 */

const TZ = 'Europe/Rome';

const CONTRACTS = {
  update_post: updatePostContract,
  approve_post: approvePostContract(TZ),
  reject_post: rejectPostContract,
  reschedule_post: reschedulePostContract(TZ),
  cross_post: crossPostContract
};

/** Il testo che il modello legge: description + le describe dei parametri. */
function toolText(c: { description: string; inputSchema: z.ZodType }): string {
  return c.description + ' ' + JSON.stringify(z.toJSONSchema(c.inputSchema));
}

// I valori-macchina del vocabolario post (quelli con underscore: inconfondibili nel
// testo inglese, a differenza di "text" o "approved").
const MACHINE_VOCAB = [
  'pending_user',
  'generated_image',
  'generated_video',
  'generated_graphic',
  'uploaded_image'
];

describe('contracts: enum nelle description', () => {
  for (const [name, contract] of Object.entries(CONTRACTS)) {
    it(`${name}: ogni valore dichiarato compare nel testo del tool`, () => {
      const text = toolText(contract);
      for (const [param, values] of Object.entries(contract.enums ?? {})) {
        for (const v of values) {
          expect(text, `${name}.${param}: "${v}" dichiarato ma assente dal testo`).toContain(v);
        }
      }
    });

    it(`${name}: nessun valore-macchina citato senza essere dichiarato`, () => {
      const text = toolText(contract);
      const declared = new Set(Object.values(contract.enums ?? {}).flat());
      for (const v of MACHINE_VOCAB) {
        if (text.includes(v)) {
          expect(
            declared.has(v),
            `${name}: il testo cita "${v}" ma il contratto non lo dichiara in enums — interpola dalla costante`
          ).toBe(true);
        }
      }
    });
  }
});

describe('contracts: schema dagli stessi valori del codice', () => {
  it('update_post.content_type accetta tutti i POST_CONTENT_TYPES e rifiuta i format', () => {
    const schema = updatePostContract.inputSchema;
    for (const ct of POST_CONTENT_TYPES) {
      expect(schema.safeParse({ post_id: 'p1', content_type: ct }).success, ct).toBe(true);
    }
    // Il finding #11: "carousel" è un format, non un content_type — ora non passa la porta.
    for (const wrong of ['carousel', 'reel', 'story']) {
      expect(schema.safeParse({ post_id: 'p1', content_type: wrong }).success, wrong).toBe(false);
    }
  });
});
