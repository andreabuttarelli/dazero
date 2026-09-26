// I crediti sono a consumo (NEW_DATABASE_STRUCTURE.md, sezione "Fatturazione"): non più tier a
// funzionalità, un saldo che si compra a rate o si carica con un abbonamento. Questo file tiene
// in UN posto solo le tre costanti che decidono il prezzo di un credito — il markup sul costo
// provider, il floor di margine che nessun gradino può attraversare, e la scala stessa — perché
// nessuna delle tre appartiene allo schema (una policy commerciale, non un fatto del database) e
// nessuna deve avere una seconda copia altrove.
//
// `ai-log.ts` ha un commento che nomina "il markup": parla del prezzo del gateway LLM (il
// provider a monte), un concetto diverso da questo. `plan-budget.ts` ha `PRODUCTION_MARGIN`: un
// terzo concetto ancora, quanto di un abbonamento va in produzione contenuti. Le tre costanti
// coesistono, nessuna sostituisce le altre.

// 100% di markup sul costo provider = 200 crediti ogni $1 di `ai_calls.cost_usd`. Non un markup
// del 20%: quello dà solo il 16,7% di margine (margine = markup / (1+markup)), e con uno sconto a
// scala sopra andava sotto zero sui clienti più grandi — l'errore che questa costante corregge.
export const AI_MARKUP = 1.0;

// Nessun gradino della scala, in nessuna colonna, può scendere sotto questo margine nel caso
// peggiore (il cliente spende ogni credito comprato). Pinnato dal test in credit-ladder.test.ts:
// aggiungere un gradino o alzare un bonus senza farlo girare è esattamente come il floor si
// attraversa senza che nessuno se ne accorga finché non arriva la fattura.
export const MARGIN_FLOOR = 0.35;

// Il cambio "costo provider → credito addebitato" per il debito di una chiamata AI. Vale SEMPRE
// questo, a prescindere da come l'org ha comprato i suoi crediti: il cambio 70:1 sotto vale solo
// all'ACQUISTO di un pacchetto una tantum, mai alla SPESA — un credito nel saldo vale uguale a
// prescindere da dove viene.
export const CREDITS_PER_USD_SUBSCRIPTION_LIST = 100 * (1 + AI_MARKUP); // 200

// Il cambio per un acquisto una tantum: comprare senza impegno costa di più al cliente (70
// crediti per $1 invece di 100), quindi rende di più a noi — per questo la colonna una tantum ha
// sempre un margine più alto di quella abbonamento sullo stesso gradino, per costruzione.
export const CREDITS_PER_USD_ONE_TIME_LIST = 70;

// Quanti crediti concede UN dollaro di prezzo abbonamento (`PLANS[].mUsd` → `PLANS[].credits`,
// plans.ts) — un QUARTO concetto ancora, diverso dagli altri tre sopra: quello è il cambio a cui
// SI SPENDE un credito (SEMPRE 200/$1, a prescindere da come è stato comprato), questo è il
// cambio a cui un piano NE CONCEDE (100/$1 di prezzo). I due non sono la stessa cosa per
// costruzione: un piano da $89 concede 8900 crediti di GRANT, che valgono la metà in costo
// provider reale (8900 / 200 = $44,50) — il margine che finanzia tutto il resto (blog, SEO,
// strategia, chat) oltre alla produzione dei post.
export const CREDITS_PER_USD_GRANT = 100;

export type CreditRung = {
  price: number;
  creditsSubscription: number;
  creditsOneTime: number;
};

// Piatta (100:1 sub, 70:1 one-time — nessuno sconto) fino a $50: nessuna aritmetica da spiegare,
// un cliente fa il conto a mente. Lo sconto comincia solo da $100, dove vale la pena — ogni punto
// di margine speso da lì in su è deliberato, verificato dal test, mai deriva.
export const CREDIT_LADDER: readonly CreditRung[] = [
  { price: 5, creditsSubscription: 500, creditsOneTime: 350 },
  { price: 15, creditsSubscription: 1_500, creditsOneTime: 1_050 },
  { price: 30, creditsSubscription: 3_000, creditsOneTime: 2_100 },
  { price: 50, creditsSubscription: 5_000, creditsOneTime: 3_500 },
  { price: 100, creditsSubscription: 11_200, creditsOneTime: 7_840 },
  { price: 200, creditsSubscription: 24_000, creditsOneTime: 16_800 },
  { price: 400, creditsSubscription: 52_000, creditsOneTime: 36_400 }
] as const;

/**
 * Il debito di una chiamata AI in crediti, dal suo costo provider reale. Scritto UNA VOLTA in
 * `ai_calls.billed_credits` al momento della chiamata (mai ricalcolato in lettura): un cambio di
 * markup deve valere solo per le chiamate future, mai riscrivere silenziosamente lo storico di un
 * cliente sotto di lui.
 */
export function billedCreditsFor(costUsd: number): number {
  return Math.round(costUsd * CREDITS_PER_USD_SUBSCRIPTION_LIST);
}

/**
 * Il margine di un gradino nel caso peggiore: il cliente spende ogni credito comprato. Nessuna
 * ipotesi di crediti mai spesi (breakage) — quelli sono margine IN PIÙ, mai una condizione per
 * essere in utile. Stessa formula usata per costruire CREDIT_LADDER: mai una seconda
 * implementazione che potrebbe disallinearsi da questa.
 */
export function marginForRung(price: number, credits: number): number {
  const cost = credits / CREDITS_PER_USD_SUBSCRIPTION_LIST;
  return (price - cost) / price;
}

// ── Canone mensile per account social collegato ────────────────────────────────────
// Zernio fattura ~$7/account (unico numero nel repo: `$lib/server/plans.ts`, commento su Go —
// mai misurato con precisione, quindi PLACEHOLDER da confermare prima di andare in produzione).
// Il prezzo qui sotto tiene lo stesso margine minimo della scala sopra (MARGIN_FLOOR): con un
// costo di $7, il prezzo minimo è 7 / (1 − 0.35) = $10.77 — arrotondato a $11 per un numero che
// un cliente legge senza calcolatrice, margine effettivo 36.4%.
export const ZERNIO_COST_PER_ACCOUNT_USD_PLACEHOLDER = 7;
export const ACCOUNT_SEAT_USD = 11;
export const ACCOUNT_SEAT_CREDITS = ACCOUNT_SEAT_USD * CREDITS_PER_USD_SUBSCRIPTION_LIST; // 2200

// ── Crediti di benvenuto ────────────────────────────────────────────────────────────
export const WELCOME_CREDITS = 100;
export const WELCOME_CREDITS_EXPIRY_DAYS = 14;

// ── Org gratuite per utente ──────────────────────────────────────────────────────────
// "Gratuita" = mai un acquisto vero (nessuna riga credit_ledger source subscription_renewal o
// one_time_purchase): il benvenuto stesso (source 'promo') non conta come acquisto, altrimenti
// nessuna org resterebbe mai gratuita dopo il primo grant.
export const FREE_ORGS_PER_USER = 2;
