/**
 * QUANDO UN TURNO DELLA CHAT DI BRAND SI FERMA.
 *
 * Due limiti, e solo uno è quello che morde davvero.
 *
 * I PASSI sono il tetto nominale. Erano 12, che è quanto basta a rispondere a una domanda e non a
 * fare un lavoro: ogni riga scritta con `insert_row` è UN passo, quindi disporre dieci post sulla
 * tela ne costa dieci — dopo l'analisi, le letture e le scritture che li hanno prodotti. A 12 il
 * turno finiva a metà dell'opera, e il modello non aveva modo di dirlo.
 *
 * IL TEMPO è il limite vero, perché è quello della piattaforma. `maxDuration` vale 300 secondi, e
 * oltre non si va senza emettere una funzione serverless in più (gli scaglioni sono 300 / 800 /
 * 1800). Superarlo non è un turno che finisce: è una risposta troncata a metà frase, senza
 * `onFinish`, quindi senza il turno salvato e senza il costo registrato. Fermarsi da soli col
 * margine è ciò che trasforma quel taglio in una chiusura pulita.
 *
 * Il margine sta qui e non in una costante generica perché dipende da cosa succede DOPO l'ultimo
 * passo: chiudere l'MCP, salvare il turno, scrivere `ai_calls`.
 */
import { stepCountIs } from 'ai';

function deadlineReached(startedAt: number, deadlineMs: number): boolean {
  return Date.now() - startedAt >= deadlineMs;
}

/** Lo scaglione Vercel di questa rotta. Vive qui per essere confrontabile col margine. */
export const AGENT_MAX_DURATION_S = 300;

/**
 * Quanti passi può fare un turno. Alto perché il lavoro è fatto di scritture da una riga
 * l'una; è il tempo a chiudere per primo un turno che lavora davvero.
 */
export const AGENT_MAX_STEPS = 80;

/** Il tempo dopo cui l'agente chiude da sé, col margine per salvare quello che ha fatto. */
export const AGENT_DEADLINE_MS = 270_000;

type StepsSoFar = { steps: unknown[] };

/**
 * La condizione di stop del turno: passi esauriti OPPURE tempo finito.
 *
 * Presa come funzione di `startedAt` invece che letta da un orologio interno perché il momento
 * d'inizio è quello della richiesta, non quello in cui questo modulo viene importato.
 */
export function agentStopWhen(startedAt: number): (input: StepsSoFar) => boolean {
  const byCount = stepCountIs(AGENT_MAX_STEPS);

  return (input: StepsSoFar) =>
    deadlineReached(startedAt, AGENT_DEADLINE_MS) || !!byCount(input as never);
}
