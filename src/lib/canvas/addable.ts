/**
 * COSA SI PUÒ METTERE SULLA TELA — che NON è «cosa un nodo produce».
 *
 * Due domande vicine e diverse, e tenerle separate è tutto il motivo per cui questo file esiste.
 *
 *   `GEN_MEDIUMS` risponde a «cosa produce questo nodo»: testo, immagine, video. Attorno a quella
 *   domanda girano il catalogo dei modelli, i formati, le durate, il tetto del prompt.
 *
 *   `CANVAS_ADDABLE` risponde a «cosa posso aggiungere»: quei tre, più la pagina incorporata e il
 *   documento. Che non producono niente — portano qualcosa che esiste già, come una nota porta un
 *   testo scritto.
 *
 * ALLARGARE `GEN_MEDIUMS` SAREBBE COSTATO UNA RIGA, e avrebbe detto una falsità che si propaga:
 * `defaultParamsFor` cercherebbe i formati di un iframe o di un doc, `promptTooLong` il suo tetto,
 * il catalogo un modello che lo generi. Nessuna di quelle domande ha risposta, e ognuna sarebbe un
 * caso particolare in più — il registro sparso che il CLAUDE.md chiede di non scrivere.
 */
import { GEN_MEDIUMS, type GenMedium } from './gen-node';

/** L'elenco che il menù e la barra mostrano, nell'ordine in cui si vedono. */
export const CANVAS_ADDABLE = [...GEN_MEDIUMS, 'iframe', 'doc'] as const;

export type Addable = (typeof CANVAS_ADDABLE)[number];

export function isAddable(x: string): x is Addable {
  return (CANVAS_ADDABLE as readonly string[]).includes(x);
}

/**
 * Fra le cose aggiungibili, quelle che sono nodi che producono. È la domanda che chi crea la tile
 * deve porsi per sapere quale costruttore chiamare — `newGenNodeAt` o un costruttore nato pieno —
 * e chiederla qui evita che la risposta venga riscritta in ogni punto che crea un nodo.
 */
export function isGenAddable(x: Addable): x is GenMedium {
  return (GEN_MEDIUMS as readonly string[]).includes(x);
}

/**
 * Come si chiamano, per chi guarda. In un posto solo perché sono due le superfici che le mostrano
 * — il menù del doppio clic e la barra in basso — e due elenchi scritti a mano divergono al primo
 * nome cambiato, in silenzio e solo su una delle due.
 */
export const ADDABLE_LABEL: Record<Addable, string> = {
  text: 'Testo',
  image: 'Immagine',
  video: 'Video',
  iframe: 'Pagina web',
  doc: 'Documento'
};
