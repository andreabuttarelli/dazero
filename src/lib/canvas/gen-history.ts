/**
 * LE GENERAZIONI DI PRIMA, e come si torna a guardarne una.
 *
 * Qui non si genera e non si scrive niente — la stessa separazione di `gen-node.ts`, che dice se
 * un nodo può girare senza farlo girare. Questo file risponde a due domande che si pongono dopo:
 * cosa succede alla storia quando un giro atterra, e cosa si sta guardando adesso.
 *
 * IL DIFETTO CHE QUESTO FILE ESISTE PER CHIUDERE: `refId` era uno solo. Rigenerare lo
 * sovrascriveva, e l'immagine di prima restava in libreria ma il nodo non sapeva più che era sua —
 * un legame perso, che nessuna ricerca a mano in una libreria da centinaia di immagini simili
 * ricostruisce. Il file non è perso; il fatto che quel nodo l'avesse fatto, sì.
 *
 * `refId` NON VIENE SOSTITUITO DALLA STORIA, ci convive: è «quella che si vede adesso», l'unica
 * cosa che sopravvive a una ricarica e dice dove si era fermato lo sguardo. Dedurla dalla storia
 * — l'ultima? — significherebbe che tornare indietro su una vecchia generazione dura finché non
 * si chiude la scheda.
 */
import { hasPrompt, type GenMedium, type GenNode, type GenRun, type UpstreamTextAvailability } from './gen-node';
import { effectiveModel, type ModelChoiceLike } from './default-models';

export type { GenRun };

/**
 * I MEDIUM CHE GIRANO DAVVERO: tutti e tre quelli che producono.
 *
 * Il testo era escluso perché `ref_id` puntava a `brand_media`, che ammette solo image e video —
 * un testo non aveva una riga in cui depositarsi. Ora l'uscita atterra su `assets`, che ha una
 * colonna `content` e un tipo `text`: il posto c'è, e il bottone del nodo testo si accende.
 */
export const RUNNABLE_MEDIUMS = ['text', 'image', 'video'] as const satisfies readonly GenMedium[];

function runnable(medium: GenMedium): boolean {
  return (RUNNABLE_MEDIUMS as readonly string[]).includes(medium);
}

/**
 * Perché il bottone è spento, in UN POSTO SOLO e in ordine.
 *
 * Un elenco invece di tre `if` sparsi per la vista: al quarto motivo sarebbero quattro condizioni
 * da tenere d'accordo fra il bottone che si disabilita e la frase che lo spiega, e quei due
 * divergono in silenzio — un bottone spento senza spiegazione è esattamente il difetto segnalato
 * come «non funziona».
 *
 * L'ORDINE CONTA: il medium viene per primo perché un nodo che non gira comunque non deve essere
 * mandato a scegliere una soluzione che non risolve niente.
 *
 * IL MODELLO CHE CONTA È QUELLO RISOLTO (`effectiveModel`), non `node.model`: un nodo nato prima
 * del default del medium non ha mai scritto un modello in `nodes.data`, e bloccarlo su quello
 * spegnerebbe "Genera" su ogni nodo vecchio finché qualcuno non apre un menù che non c'è più.
 *
 * «SCRIVI COSA VUOI» conta un testo a monte collegato come prompt (`hasPrompt`, `gen-node.ts`):
 * un'immagine senza prompt proprio ma wired a un nodo testo con qualcosa scritto è già pronta a
 * girare — il testo a monte È il prompt, quando il nodo non ne ha uno suo.
 */
const BLOCKED: readonly { when: (node: GenNode, choices: readonly ModelChoiceLike[], upstream: UpstreamTextAvailability) => boolean; say: string }[] = [
  { when: (n) => !runnable(n.medium), say: 'Questo nodo non produce nulla' },
  { when: (n, _choices, upstream) => !hasPrompt(n, upstream), say: 'Scrivi cosa vuoi' },
  { when: (n, choices) => !effectiveModel(n.medium, n.model, choices), say: 'Scegli un modello' }
];

export function blockedReason(
  node: GenNode,
  choices: readonly ModelChoiceLike[] = [],
  upstream: UpstreamTextAvailability = { hasUpstreamText: false }
): string | null {
  return BLOCKED.find((rule) => rule.when(node, choices, upstream))?.say ?? null;
}

/**
 * Il giro atterrato entra in storia e prende il posto in vetrina.
 *
 * SENZA ASSET NON ENTRA: un clip parte e atterra minuti dopo, e una riga nella striscia che non si
 * può aprire è una miniatura vuota che invita a cliccarla. Quando arriva, arriva.
 *
 * E non entra DUE VOLTE: la stessa risposta può tornare da un ritentativo di rete, e due righe
 * identiche nella striscia sono due miniature della stessa immagine.
 */
export function withRun(node: GenNode, run: GenRun): GenNode {
  if (!run.mediaId) return node;
  if (node.runs.some((r) => r.id === run.id || r.mediaId === run.mediaId)) return node;

  return { ...node, runs: [...node.runs, run], refId: run.mediaId };
}

/**
 * Rimettere in vetrina un giro di prima. La storia NON si tocca: tornare indietro è uno sguardo,
 * non una cancellazione — e chi torna indietro deve poter tornare avanti.
 *
 * Un id sconosciuto lascia tutto com'è invece di svuotare: svuotare vorrebbe dire che un clic
 * sbagliato cancella dallo schermo quel che si stava guardando.
 */
export function showRun(node: GenNode, runId: string): GenNode {
  const run = node.runs.find((r) => r.id === runId);
  if (!run?.mediaId) return node;

  return { ...node, refId: run.mediaId };
}

/** Quale delle miniature è quella accesa. `-1` quando non si sta guardando niente. */
export function shownIndex(node: GenNode): number {
  return node.refId ? node.runs.findIndex((r) => r.mediaId === node.refId) : -1;
}

/**
 * Se premere adesso lancia davvero un giro.
 *
 * `running` È LA GUARDIA CONTRO IL DOPPIO CLIC, e vale crediti veri: due pressioni vicine
 * pagherebbero due render, e il secondo sovrascriverebbe il primo atterrando. Il bottone è già
 * disabilitato mentre gira, ma un bottone disabilitato è una decisione della vista — chi lancia
 * deve poterlo chiedere anche da qui, o la guardia vive in un posto solo e quello è il disegno.
 *
 * Un nodo che ha già prodotto PUÒ rifare: è la seconda generazione, quella che la storia esiste
 * per non perdere.
 */
export function canStartRun(
  node: GenNode,
  choices: readonly ModelChoiceLike[] = [],
  upstream: UpstreamTextAvailability = { hasUpstreamText: false }
): boolean {
  return !node.running && !blockedReason(node, choices, upstream);
}

export function producedRuns(runs: GenRun[]): GenRun[] {
  const seen = new Set<string>();
  return runs.filter((run) => {
    if (run.mediaId === null || seen.has(run.mediaId)) {
      return false;
    }
    seen.add(run.mediaId);
    return true;
  });
}
