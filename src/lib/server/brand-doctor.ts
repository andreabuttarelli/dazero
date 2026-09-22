import type { SupabaseClient } from '@supabase/supabase-js';
import { isExportOnlyPlan } from '$lib/server/plans';

/**
 * BRAND DOCTOR — «perché questo brand non sta ricevendo niente dall'AI?»
 *
 * È la domanda che il supporto, il founder e l'utente si fanno più spesso, e finora si rispondeva
 * leggendo il codice: ogni ciclo (autopilot, analytics review, …) ha la sua catena di gate, ogni
 * gate ha il suo `continue`, e nessuno di quei `continue` lasciava traccia. L'analytics review
 * agent è rimasto fermo per settimane senza che niente lo dicesse (docs/38-salto-di-qualita.md §1).
 *
 * Il pattern nasce da una diagnosi che interroga ogni fonte dal vivo e
 * dice perché una non trova niente. Qui è generalizzato: per ogni ciclo, **il primo gate che questo
 * brand non supera**, cosa serve per superarlo, e quando è girato l'ultima volta.
 *
 * DUE REGOLE CHE TENGONO ONESTO QUESTO MODULO:
 * 1. Si riportano solo gate **verificati nel codice** del ciclo corrispondente. Un gate inventato
 *    qui manda il supporto a caccia di un problema che non esiste.
 * 2. «Non lo so» è una risposta valida e viene detta (`unknown`), invece di essere presentata come
 *    un via libera. Un doctor che dice sempre "tutto ok" non lo apre più nessuno.
 *
 * Read-only: nessuna scrittura, nessuna AI, nessun credito speso.
 */

export type DoctorGate = {
  /** Identificatore stabile: ci si fanno le query, non è prosa. */
  id: string;
  status: 'pass' | 'fail' | 'unknown';
  /** Cosa dice il dato, con i numeri. */
  detail: string;
  /** Cosa deve succedere perché passi. Presente solo su `fail`. */
  fix?: string;
};

export type DoctorLoop = {
  loop: string;
  /** Quando gira, in parole — la fonte è vercel.json, non una supposizione. */
  schedule: string;
  /** `blocked` = un gate lo esclude; `waiting` = passa i gate ma non è ancora il suo turno. */
  status: 'ok' | 'blocked' | 'waiting' | 'failing' | 'unknown';
  /** L'id del PRIMO gate fallito. È la risposta alla domanda per cui esiste questa pagina. */
  blockedBy: string | null;
  gates: DoctorGate[];
  lastRun: { at: string; outcome: string; reason: string | null } | null;
};

export type DoctorFacts = {
  now: number;
  plan: string | null;
  hasActiveEditorialPlan: boolean;
  connectedAccounts: number;
  /** Il piano vende zero account per progetto (Go): zero collegati è lo stato normale, non un guasto. */
  exportOnly: boolean;
  ownHistoryAt: string | null;
  pendingPosts: number;
  /** Solo i pending STANTII: è questo il numero su cui lo scheduler frena, non il totale. */
  pendingStalePosts: number;
  publishedLast30: number;
  /** Ultimo esito registrato per ciclo (loop_ticks), incluse le esclusioni. */
  lastTicks: Record<string, { at: string; outcome: string; reason: string | null } | undefined>;
};

const DAY = 24 * 60 * 60 * 1000;
const PENDING_BACKLOG_CAP = 15;
const PENDING_BACKLOG_AGE_MS = 7 * DAY;

/** Il primo gate fallito decide lo stato del ciclo. Un `unknown` non è un via libera: si dichiara. */
function verdict(gates: DoctorGate[]): Pick<DoctorLoop, 'status' | 'blockedBy'> {
  const failed = gates.find((g) => g.status === 'fail');
  if (failed) return { status: 'blocked', blockedBy: failed.id };
  if (gates.some((g) => g.status === 'unknown')) return { status: 'unknown', blockedBy: null };
  return { status: 'ok', blockedBy: null };
}

/**
 * La diagnosi, come funzione pura sui fatti. Tutta l'I/O sta in `collectDoctorFacts`, così questa
 * si può testare su qualunque combinazione di stato senza un database.
 */
export function assessLoops(f: DoctorFacts): DoctorLoop[] {
  const loops: DoctorLoop[] = [];

  // ── 1. Distribuzione. Non è un cron: è la catena che rende sensato tutto il resto. Sta per
  // prima perché è il gate che, oggi, blocca la grande maggioranza dei brand.
  {
    // Le soglie qui sotto sono quelle che la produzione applica davvero. Un doctor che riporta
    // soglie sue manda l'utente a risolvere un problema che il codice non ha.
    const accountsBlock = f.connectedAccounts === 0 && !f.exportOnly;
    const backlogBlock = f.pendingStalePosts > PENDING_BACKLOG_CAP;
    const staleDays = Math.round(PENDING_BACKLOG_AGE_MS / (24 * 60 * 60 * 1000));
    const gates: DoctorGate[] = [
      {
        id: 'social_accounts',
        status: accountsBlock ? 'fail' : 'pass',
        detail: f.connectedAccounts > 0
          ? `${f.connectedAccounts} account social collegati.`
          : f.exportOnly
            ? 'Piano "prepara ed esporta": nessun account collegato per progetto, i post si esportano a mano.'
            : 'Nessun account social collegato: la produzione ricorrente è ferma, i post non avrebbero dove uscire.',
        ...(accountsBlock ? { fix: 'Collega almeno un account in Impostazioni → Piattaforme: la produzione riparte da sola.' } : {})
      },
      {
        id: 'approval_backlog',
        // Il freno guarda solo i pending STANTII: chi ha appena ricevuto la settimana e la
        // approverà domani non è un brand fermo.
        status: backlogBlock ? 'fail' : 'pass',
        detail: backlogBlock
          ? `${f.pendingStalePosts} post in attesa da più di ${staleDays} giorni (soglia: ${PENDING_BACKLOG_CAP}): la produzione è in pausa finché la coda non scende.`
          : `${f.pendingPosts} post in coda di approvazione, di cui ${f.pendingStalePosts} da più di ${staleDays} giorni (soglia: ${PENDING_BACKLOG_CAP}).`,
        ...(backlogBlock
          ? { fix: 'Approva dalla mail (un tap), da /approvals, o con `dazero approve <slug> --all`. Approvare o eliminare qualunque post fa ripartire la produzione.' }
          : {})
      },
      {
        id: 'recent_publish',
        // Per un piano prepara-ed-esporta la pubblicazione non passa da qui: chiamarlo fallimento
        // sarebbe segnalare come guasto il funzionamento previsto del tier.
        status: f.publishedLast30 > 0 ? 'pass' : f.exportOnly ? 'unknown' : 'fail',
        detail:
          f.publishedLast30 > 0
            ? `${f.publishedLast30} post pubblicati negli ultimi 30 giorni.`
            : f.exportOnly
              ? 'Nessuna pubblicazione dall\'app negli ultimi 30 giorni — atteso su un piano di sola esportazione.'
              : 'Nessun post pubblicato negli ultimi 30 giorni.',
        ...(f.publishedLast30 === 0 && !f.exportOnly
          ? { fix: 'Sblocca i due gate qui sopra: senza pubblicazioni non parte nessun ciclo di apprendimento.' }
          : {})
      }
    ];
    loops.push({
      loop: 'publishing',
      schedule: 'continuo (approvazione → scheduler)',
      ...verdict(gates),
      gates,
      lastRun: null
    });
  }

  return loops;
}

/** La riga che si legge per prima: il primo ciclo bloccato, o il via libera. */
export function doctorHeadline(loops: DoctorLoop[]): string {
  const blocked = loops.find((l) => l.status === 'blocked' || l.status === 'failing');
  if (!blocked) return 'Nessun blocco rilevato sui cicli coperti da questa diagnosi.';
  const gate = blocked.gates.find((g) => g.id === blocked.blockedBy);
  return `${blocked.loop}: ${gate?.detail ?? blocked.blockedBy}${gate?.fix ? ` → ${gate.fix}` : ''}`;
}

/** Tutte le letture, in parallelo dove possibile. Nessuna scrittura. */
export async function collectDoctorFacts(
  admin: SupabaseClient,
  brand: { id: string; plan?: string | null; own_history_at?: string | null },
  now = Date.now()
): Promise<DoctorFacts> {
  const since30 = new Date(now - 30 * DAY).toISOString();

  const staleBefore = new Date(now - PENDING_BACKLOG_AGE_MS).toISOString();

  const [accounts, plan, pending, pendingStale, published, ticks] = await Promise.all([
    admin.from('social_accounts').select('id', { count: 'exact', head: true }).eq('brand_id', brand.id).eq('status', 'active'),
    admin.from('editorial_plans').select('id').eq('brand_id', brand.id).eq('status', 'active').limit(1).maybeSingle(),
    admin.from('posts').select('id', { count: 'exact', head: true }).eq('brand_id', brand.id).eq('status', 'pending_user'),
    // Lo stesso conteggio su cui frena lo scheduler: pending E più vecchi della finestra.
    admin
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.id)
      .eq('status', 'pending_user')
      .lt('created_at', staleBefore),
    admin
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.id)
      .eq('status', 'published')
      .gte('published_at', since30),
    admin
      .from('loop_ticks')
      .select('loop, outcome, reason, created_at')
      .eq('brand_id', brand.id)
      .order('created_at', { ascending: false })
      .limit(50)
  ]);

  // Ultimo esito per ciclo: le righe arrivano già ordinate dal più recente, quindi la prima vince.
  const lastTicks: DoctorFacts['lastTicks'] = {};
  for (const row of ticks.data ?? []) {
    const loop = String(row.loop);
    if (lastTicks[loop]) continue;
    lastTicks[loop] = { at: String(row.created_at), outcome: String(row.outcome), reason: row.reason ?? null };
  }

  return {
    now,
    plan: brand.plan ?? null,
    hasActiveEditorialPlan: Boolean(plan.data?.id),
    connectedAccounts: accounts.count ?? 0,
    exportOnly: isExportOnlyPlan(brand.plan),
    ownHistoryAt: brand.own_history_at ?? null,
    pendingPosts: pending.count ?? 0,
    pendingStalePosts: pendingStale.count ?? 0,
    publishedLast30: published.count ?? 0,
    lastTicks
  };
}

export async function brandDoctor(
  admin: SupabaseClient,
  brand: { id: string; name?: string | null; slug?: string | null; plan?: string | null; own_history_at?: string | null }
) {
  const facts = await collectDoctorFacts(admin, brand);
  const loops = assessLoops(facts);
  return {
    brand: { name: brand.name ?? null, slug: brand.slug ?? null, plan: brand.plan ?? null },
    generatedAt: new Date(facts.now).toISOString(),
    headline: doctorHeadline(loops),
    loops,
    // Onestà sul perimetro: questa diagnosi copre un ciclo solo. Dire quali NON copre evita che
    // un "nessun blocco" venga letto come "tutto il prodotto sta funzionando".
    notCovered: ['seo', 'geo', 'field', 'ads', 'analytics_review']
  };
}
