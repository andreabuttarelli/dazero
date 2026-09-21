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
import type { GenMedium, GenNode, GenRun } from './gen-node';

export type { GenRun };

/**
 * I MEDIUM CHE GIRANO DAVVERO, e il testo non è fra loro.
 *
 * Non è una dimenticanza né una pigrizia: `ref_id` di un nodo punta a `brand_media`, e quella
 * tabella ammette `kind in ('image','video')` — verificato sul database, non supposto. Un testo
 * generato non è un file e non ha una riga in cui depositarsi; inventargliene una significherebbe
 * un asset di libreria il cui `url` non porta da nessuna parte, che poi comparirebbe fra le
 * immagini del brand e in tutto ciò che legge quella tabella.
 *
 * COSA È STATO SCARTATO. Mandare il testo al centralino (`$lib/server/llm`) e tenerlo in `body`
 * della riga sarebbe stato poche righe — ma `body` è il testo di una NOTA, e riusarlo qui darebbe
 * una colonna che significa due cose a seconda del vicino: è la stessa ragione per cui il nodo che
 * produce ha avuto colonne sue invece di un JSON dentro `body`. E la storia delle generazioni,
 * appena costruita attorno a `media_id`, non saprebbe dove mettere un testo.
 *
 * Quindi il bottone del nodo testo resta spento CON UN PERCHÉ VISIBILE, che è la cosa onesta: un
 * bottone che finge di lavorare è peggio di uno che dice di non poterlo ancora fare. Il giorno in
 * cui un testo avrà un posto dove atterrare, questa riga cambia e nient'altro.
 */
export const RUNNABLE_MEDIUMS = ['image', 'video'] as const satisfies readonly GenMedium[];

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
 * L'ORDINE CONTA: il medium viene per primo perché un nodo di testo non gira comunque, e dirgli
 * «scegli un modello» lo manderebbe a cercare una soluzione che non risolve niente.
 */
const BLOCKED: readonly { when: (node: GenNode) => boolean; say: string }[] = [
  { when: (n) => !runnable(n.medium), say: 'Il nodo testo non gira ancora' },
  { when: (n) => !n.prompt.trim(), say: 'Scrivi cosa vuoi' },
  { when: (n) => !n.model, say: 'Scegli un modello' }
];

export function blockedReason(node: GenNode): string | null {
  return BLOCKED.find((rule) => rule.when(node))?.say ?? null;
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
  if (node.runs.some((r) => r.id === run.id)) return node;

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
export function canStartRun(node: GenNode): boolean {
  return !node.running && !blockedReason(node);
}
