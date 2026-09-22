/**
 * QUALI FILE UNA RIGA TIENE IN VITA, dichiarato in un posto solo.
 *
 * La pulizia era sparsa: due endpoint su trentotto toglievano il file insieme alla riga, tutti gli
 * altri no, e nessuno dei due leggeva l'altro. `brand_documents` sapeva che `file_url` è un path del
 * bucket `brand-knowledge`; `social_thumb_cache` sapeva che `paths` è un array di path; e un
 * `delete_row` generico non sapeva né l'uno né l'altro. Un caso nuovo qui è UNA RIGA della tabella
 * sotto, e tutti i casi si vedono insieme — che è l'unico modo perché il trentanovesimo non diverga
 * in silenzio.
 *
 * TRE FORME, perché nel database ce ne sono tre e fingerne una sola perde file o ne cancella di vivi:
 *
 *   path        la colonna È la chiave dell'oggetto. `social_post_history.thumbnail_path`.
 *   jsonb_path  la colonna è un array di oggetti e la chiave sta dentro uno di essi.
 *               `social_thumb_cache.paths[]`, `competitors.top_posts[].archivedPath`.
 *   -           NON esiste una forma «url»: le colonne che tengono un URL pubblico firmato o
 *               assemblato NON sono qui. Estrarre un path da un URL vuol dire indovinare il prefisso
 *               del progetto, e un prefisso sbagliato produce un path plausibile che non esiste —
 *               cioè una cancellazione che non fa niente, o peggio, che colpisce un omonimo.
 *
 * `brand_media` tiene lo STESSO path in due colonne (`storage_path` e `url`, il bucket è privato e
 * l'url è il path): sono due colonne di una regola sola, e il dedup è nella lettura, non nel
 * chiamante — chi scrive una regola nuova non deve ricordarsene.
 *
 * IL RECINTO. `COLLECTABLE_AREAS` è l'elenco CHIUSO delle aree su cui il raccoglitore sa ragionare.
 * Un'area che non è qui non è un'area vuota: è un'area di cui non sappiamo chi la referenzia, e
 * `areaOf` risponde `null` invece di una scelta di ripiego. La misura ingenua che ha motivato questo
 * lavoro diceva 8.022 orfani su 8.054 in `brand-knowledge` — quasi tutto il bucket — perché guardava
 * una tabella sola: `competitors/` risultava orfano al 100% e i suoi path stanno annidati dentro
 * `competitors.top_posts`, `competitors.top_ads` e `scrapecreators_cache`, tre posti diversi con tre
 * cicli di vita diversi. Un `else` che cancella avrebbe svuotato il bucket.
 */

export type RefForm = 'path' | 'jsonb_path';

export type StorageRef = {
  table: string;
  bucket: string;
  columns: string[];
  form: RefForm;
  /** La chiave dentro l'oggetto, per `jsonb_path`. */
  key?: string;
  /** Le aree che questa regola referenzia — il legame fra il registro e il recinto del raccoglitore. */
  areas: string[];
  /**
   * Le colonne che danno un ordine TOTALE alla tabella, per leggerla a pagine senza saltarne una.
   * Sta qui e non nel lettore perché è una proprietà della tabella, e `social_thumb_cache` — senza
   * `id`, con chiave `(platform, handle)` — è la riga che lo dimostra: un `'id'` scritto a mano nel
   * ciclo funziona su otto tabelle su nove e fallisce sulla nona il giorno che ha la prima riga.
   */
  orderBy: string[];
};

/**
 * Un URL non è un path, e una colonna che ne contiene uno non partecipa: meglio un file orfano che
 * una `remove()` su una chiave inventata.
 */
const looksLikeUrl = (value: string): boolean => /^https?:\/\//i.test(value);

const cleanPath = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const path = value.trim();
  if (!path || looksLikeUrl(path)) return null;
  return path;
};

export const STORAGE_REFS: StorageRef[] = [
  {
    table: 'social_post_history',
    bucket: 'brand-knowledge',
    columns: ['thumbnail_path'],
    form: 'path',
    orderBy: ['id'],
    areas: ['history']
  },
  {
    table: 'social_thumb_cache',
    bucket: 'brand-knowledge',
    columns: ['paths'],
    form: 'jsonb_path',
    orderBy: ['platform', 'handle'],
    areas: ['history']
  },
  {
    // Bucket privato: `url` ripete `storage_path`, non lo completa (brand-media.ts).
    table: 'brand_media',
    bucket: 'brand-knowledge',
    columns: ['storage_path', 'url'],
    form: 'path',
    orderBy: ['id'],
    areas: ['media']
  },
  {
    table: 'chat_artifacts',
    bucket: 'brand-knowledge',
    columns: ['storage_path'],
    form: 'path',
    orderBy: ['id'],
    areas: ['artifacts']
  },
  {
    // `file_url` è un path nudo malgrado il nome: knowledge.ts, studio-actions.ts e l'onboarding
    // ci scrivono tutti la chiave dell'oggetto.
    table: 'brand_documents',
    bucket: 'brand-knowledge',
    columns: ['file_url'],
    form: 'path',
    orderBy: ['id'],
    areas: ['documents']
  },
  {
    table: 'market_posts',
    bucket: 'brand-knowledge',
    columns: ['media_path'],
    form: 'path',
    orderBy: ['id'],
    areas: ['market']
  },
  {
    table: 'market_posts',
    bucket: 'wall',
    columns: ['poster_path', 'preview_path'],
    form: 'path',
    orderBy: ['id'],
    areas: ['wall']
  }
];

/** I path che una riga tiene in vita, senza ripetizioni: due colonne con lo stesso valore sono un file. */
export function pathsInRow(rule: StorageRef, row: Record<string, unknown>): Array<{ bucket: string; path: string }> {
  const seen = new Set<string>();

  for (const column of rule.columns) {
    const value = row[column];
    if (value == null) continue;

    if (rule.form === 'path') {
      const path = cleanPath(value);
      if (path) seen.add(path);
      continue;
    }

    if (!Array.isArray(value)) continue;
    for (const item of value) {
      const raw = rule.key ? (item as Record<string, unknown> | null)?.[rule.key] : item;
      const path = cleanPath(raw);
      if (path) seen.add(path);
    }
  }

  return [...seen].map((path) => ({ bucket: rule.bucket, path }));
}

/**
 * Come si riconosce l'area di un file dalla sua chiave. Il terzo segmento di `<owner>/<brand>/<area>/`
 * è la forma normale in `brand-knowledge`; `market/` sta invece in cima al bucket, e `wall` non ha
 * aree affatto — l'intero bucket è una cosa sola.
 */
type AreaRule = { area: string; bucket: string; segment: number; name: string | null };

export const COLLECTABLE_AREAS: AreaRule[] = [
  { area: 'history', bucket: 'brand-knowledge', segment: 3, name: 'history' },
  { area: 'media', bucket: 'brand-knowledge', segment: 3, name: 'media' },
  { area: 'artifacts', bucket: 'brand-knowledge', segment: 3, name: 'artifacts' },
  { area: 'market', bucket: 'brand-knowledge', segment: 1, name: 'market' },
  { area: 'wall', bucket: 'wall', segment: 0, name: null }
];

/**
 * FUORI PORTATA, e dichiarato invece che dimenticato:
 *
 *   competitors/  i path stanno dentro tre jsonb (`competitors.top_posts`, `competitors.top_ads`,
 *                 `brand_market_references`) PIÙ una cache globale a scadenza (`scrapecreators_cache`)
 *                 che non è per brand: «non referenziato» lì vuol dire «la cache è scaduta», che è un
 *                 ciclo di vita diverso e non una riga cancellata.
 *   mood/,        finiscono anche loro in `brand_documents.file_url`, ma li scrivono percorsi che non
 *   onboarding/   ho seguito fino in fondo; l'area `documents` del registro non li reclama.
 *   media (bucket) tutto in URL pubblici, e `brand_articles.body_md` ne incorpora dentro il markdown:
 *                 un raccoglitore che non legge il testo cancella le illustrazioni vive di un articolo.
 *   email-assets/ nessuna colonna li nomina, MAI: vivono dentro email già spedite. Solo una politica
 *                 a scadenza potrebbe toccarli, e non è questa.
 *   agent-docs/   la verità è un registro NEL CODICE, non una tabella. E `overrides/` cancellato È il
 *                 rollback documentato: raccoglierlo sarebbe rompere una feature.
 *   agent-homes/  i checkpoint vecchi sono orfani per costruzione, ma la colonna tiene un PREFISSO e
 *                 non una chiave: raccoglierli vuole enumerare il manifest, che è un altro lavoro.
 */
export function areaOf(bucket: string, path: string): string | null {
  for (const rule of COLLECTABLE_AREAS) {
    if (rule.bucket !== bucket) continue;
    if (rule.name === null) return rule.area;

    const segments = path.split('/');
    // Un'area al terzo segmento vuole un quarto segmento: `a/b/media` senza file non è un file.
    if (segments.length <= rule.segment) continue;
    if (segments[rule.segment - 1] === rule.name) return rule.area;
  }

  return null;
}

/**
 * Il periodo di grazia. Un file appena caricato non è orfano: è un file la cui riga non è ancora
 * stata scritta. Fra l'`upload()` e l'`insert()` c'è una generazione che può durare minuti (un video
 * reso, una foto rifinita), un job in coda, un turno di chat ripreso dopo una disconnessione.
 * Ventiquattro ore sono due ordini di grandezza sopra il più lento di quei percorsi, e la misura
 * dice che non costano niente: dei 508 orfani veri trovati in `history/`, ZERO hanno meno di un mese.
 * Una soglia più stretta non ne troverebbe di più, e ne rischierebbe di vivi.
 */
export const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * Il tetto per esecuzione, come `DELETE_MAX_ROWS` per la scrittura e per la stessa ragione: un
 * raccoglitore che sbaglia deve sbagliare poco. 200 è abbastanza da consumare l'arretrato in
 * qualche giro e abbastanza poco da rendere un errore leggibile in un log invece che scopribile
 * da un cliente.
 */
export const COLLECT_MAX_FILES = 200;

export type StorageFile = { bucket: string; path: string; createdAt: string };
export type Orphan = { bucket: string; path: string; area: string };

/** La chiave di un file è la COPPIA: un path uguale in due bucket è due file. */
export const refKey = (bucket: string, path: string): string => `${bucket}\u0000${path}`;

export type OrphanScan = {
  orphans: Orphan[];
  referenced: number;
  tooYoung: number;
  outOfScope: number;
  capped: number;
};

/**
 * La decisione, pura: nessun client, nessuna rete, nessuna cancellazione. Chi toglie i file chiama
 * questa e obbedisce; questa non sa nemmeno che esista uno Storage.
 *
 * L'ordine dei filtri è l'ordine della sicurezza: prima «è coperto?», poi «è referenziato?», poi
 * «è abbastanza vecchio?». Un file scoperto non arriva mai al confronto con `referenced`, così un
 * insieme di riferimenti incompleto non può proporlo per errore.
 */
export function orphansAmong(input: {
  now: number;
  files: StorageFile[];
  referenced: Set<string>;
}): OrphanScan {
  const orphans: Orphan[] = [];
  let referenced = 0;
  let tooYoung = 0;
  let outOfScope = 0;

  for (const file of input.files) {
    const area = areaOf(file.bucket, file.path);
    if (!area) {
      outOfScope++;
      continue;
    }

    if (input.referenced.has(refKey(file.bucket, file.path))) {
      referenced++;
      continue;
    }

    if (input.now - Date.parse(file.createdAt) < ORPHAN_GRACE_MS) {
      tooYoung++;
      continue;
    }

    orphans.push({ bucket: file.bucket, path: file.path, area });
  }

  const capped = Math.max(0, orphans.length - COLLECT_MAX_FILES);
  return { orphans: orphans.slice(0, COLLECT_MAX_FILES), referenced, tooYoung, outOfScope, capped };
}
