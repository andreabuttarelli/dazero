/**
 * Generare verso la LIBRERIA del brand, non verso un post.
 *
 *   genera → l'asset entra in brand_media → create_post lo attacca con media_ids
 *
 * L'ultimo passo esisteva già; mancava il primo, e senza di lui un agente esterno doveva creare
 * un post finto in calendario per ottenere un'immagine — poi cancellarlo. Tre direzioni visive
 * erano tre post da buttare, e l'asset nasceva attaccato a un post invece che riutilizzabile.
 *
 * Il vincolo del post era cablaggio, non un vincolo vero: `renderPostImage` prende una stringa, e
 * la coda `video_renders` accetta `post_id` nullo da sempre. Qui si usa quello che c'era.
 *
 * Immagine e video hanno due tempi diversi e quindi due forme diverse:
 *
 *   immagine  →  sincrona, ~10s   →  { status: 'ready',     media: [...] }
 *   video     →  minuti           →  { status: 'rendering', jobId }  → check_media_job
 *
 * Aspettare un video non è un'opzione: il poll di kie arriva a 600s contro un muro di funzione a
 * 300s, quindi chi aspetta muore sempre a metà. È il reconciler del cron a finirlo.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { insertBrandMedia, storeBrandMediaBytes, probeImageDimensions } from '$lib/server/brand-media';
import { signKnowledgePaths } from '$lib/server/media-archive';
import { mediaUrl } from '$lib/media-url';
import { IMAGE_PART_MAX_BYTES } from '$lib/raster-image';
import type { ImagePart, ImagePartRefusal } from '$lib/server/brand-context';
import { safeProviderReason } from '$lib/server/provider-reason';
import { markImage, DIGITAL_SOURCE_TYPE } from '$lib/server/content-credentials';
import type { AspectRatio } from '$lib/server/media-generate.images';

export type GeneratedMedia = {
  /**
   * `null` quando il disegno non è entrato in nessuna libreria: senza brand non c'è una riga in
   * `brand_media` da nominare — e non è una svista. Le policy di quella tabella dicono
   * `brand_id in (select auth_brand_ids())`, e `NULL in (…)` vale NULL, non true: una riga senza
   * brand sarebbe invisibile a tutti, non visibile a tutti.
   */
  id: string | null;
  kind: string;
  mime: string | null;
  width: number | null;
  height: number | null;
  url: string | null;
  /** Dov'è il file. Presente solo sul disegno senza brand, la cui `url` è una firma che scade. */
  storage_path?: string;
};

export type GenerateMediaOpts = {
  /** `null` = nessun brand nominato: paga `orgId`, e non c'è una libreria in cui archiviare. */
  brandId: string | null;
  orgId?: string;
  userId: string;
  prompt: string;
  kind?: 'image' | 'video';
  count?: number;
  aspectRatio?: AspectRatio;
  title?: string;
  /** Vale per QUESTA chiamata soltanto: nessuna preferenza del brand viene toccata. */
  model?: string;
  /** Un'IMMAGINE da animare: l'id della libreria sotto un brand, il percorso consegnato senza. */
  baseMediaId?: string;
  /** Secondi. Assente → la preferenza del brand. */
  durationSeconds?: number;
  /**
   * Il fotogramma FINALE — richiede `baseMediaId` come iniziale, e vale solo sulla famiglia
   * Seedance (`RenderVideoOpts.lastFrameUrl`): un modello senza riferimenti multimodali lo ignora,
   * lo stesso posto che decide quanti ne prende (`videoRefCapacity`, `video-models.ts`).
   */
  lastFrameUrl?: string;
  /** Riferimenti multimodali OLTRE al fotogramma iniziale. URL pubblici già firmati: questo
   *  percorso senza brand non ha una libreria da cui risolverli per id. */
  referenceImageUrls?: string[];
  referenceAudioUrls?: string[];
  referenceVideoUrls?: string[];
};

export type GenerateMediaResult =
  | {
      ok: true;
      status: 'ready';
      media: GeneratedMedia[];
      jobId: null;
      model: string | null;
      renders: number;
    }
  | {
      ok: true;
      status: 'rendering';
      media: [];
      jobId: string;
      model: string | null;
      renders: 0;
      /** I secondi DAVVERO mandati: il modello ha una sua finestra e non e' quella chiesta. */
      durationSeconds: number | null;
    }
  | {
      ok: false;
      error:
        | 'render_failed'
        | 'store_failed'
        | 'video_budget_exhausted'
        | 'source_not_found'
        | 'source_not_an_image';
      /** Cosa ha detto il fornitore. Assente quando non ha detto niente: non si inventa. */
      reason?: string;
    }
  | { ok: false; error: 'duration_out_of_range'; reason: string }
  | { ok: false; error: 'model_not_for_slot'; allowed: string[] };

const IMAGE_MIME = 'image/png';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Quanti asset si guardano per sciogliere un prefisso: id, tipo e peso, quindi una lettura corta. */
const PREFIX_SCAN = 500;

type LibrarySource = { id: string; kind: string; bytes: number | null };

export type SourceTooLarge = {
  ok: false;
  error: 'source_too_large';
  bytes: number | null;
  limit: number;
};

const SOURCE_REFUSAL: Record<ImagePartRefusal, 'source_too_large' | 'source_not_found'> = {
  too_large: 'source_too_large',
  not_an_image: 'source_not_found',
  fetch_failed: 'source_not_found'
};

function refusedSource(
  reason: ImagePartRefusal,
  bytes: number | null
): SourceTooLarge | { ok: false; error: 'source_not_found' } {
  const error = SOURCE_REFUSAL[reason];
  if (error === 'source_not_found') return { ok: false, error };

  return { ok: false, error, bytes, limit: IMAGE_PART_MAX_BYTES };
}

/**
 * Un prefisso corto come lo accettano gli id dei post, ma risolto QUI e non nel livello MCP: li'
 * varrebbe solo per chi passa da MCP, e la CLI o una chiamata HTTP diretta resterebbero senza.
 *
 * Ambiguo e inesistente collassano nello stesso rifiuto di proposito: in entrambi i casi non
 * abbiamo UN asset, e ricadere sulla generazione — disegnare da zero credendo di modificare — e'
 * il difetto che questo percorso esiste per togliere.
 */
async function resolveLibraryId(
  supabase: SupabaseClient,
  brandId: string,
  idOrPrefix: string
): Promise<LibrarySource | null> {
  const want = idOrPrefix.trim().toLowerCase();
  if (!want) return null;

  // Si interroga SEMPRE, anche per un id completo. Prima l'id intero saltava la lettura e passava
  // dritto: l'appartenenza la scopriva solo il passo dopo, che sa dire «non e' un'immagine» ma non
  // «non e' tua» — e un id di un altro inquilino tornava con l'errore sbagliato.
  const { data } = await supabase
    .from('brand_media')
    .select('id, kind, bytes')
    .eq('brand_id', brandId)
    .limit(PREFIX_SCAN);
  const rows = (data ?? []) as Array<{ id: string; kind: string; bytes: number | null }>;
  const hits = rows.filter((r) => String(r.id).toLowerCase().startsWith(want));
  if (hits.length !== 1) return null;

  return { id: String(hits[0].id), kind: String(hits[0].kind), bytes: hits[0].bytes ?? null };
}

/** Il prefisso con cui lo Storage pubblica un oggetto del bucket: l'URL che consegniamo lo porta. */
const PUBLIC_MEDIA = '/storage/v1/object/public/media/';

/** Un percorso che finisce così è un clip. Senza una riga di libreria, il file è tutto ciò che c'è. */
const CLIP_EXTENSION = /\.(mp4|mov|webm|m4v)$/i;

/**
 * Come si nomina una sorgente quando una libreria non c'è.
 *
 * La strada senza brand consegna due maniglie e nient'altro: `storage_path` per un disegno, l'URL
 * pubblico per un clip. Tutte e due dicono lo stesso percorso, e il suo PRIMO segmento è lo user —
 * la stessa cosa che guarda la policy dello Storage. Il percorso di un altro non risolve,
 * esattamente come l'id di un altro inquilino non risolve sotto il brand.
 *
 * Un indirizzo qualunque NON è una sorgente: qui non si scarica niente da un host scelto da chi
 * chiama: si firma un percorso del NOSTRO bucket. Una stringa che non è un nostro percorso cade.
 */
function ownStoragePath(userId: string, handle: string): string | null {
  const raw = handle.trim();
  const tail = raw.includes(PUBLIC_MEDIA) ? raw.split(PUBLIC_MEDIA)[1] : raw;
  const path = tail.split('?')[0].replace(/^\/+/, '');
  const segments = path.split('/');
  if (segments[0] !== userId) return null;
  if (segments.some((s) => s === '..' || s === '.' || !s)) return null;

  return path;
}

function storedKind(path: string): 'image' | 'video' {
  return CLIP_EXTENSION.test(path) ? 'video' : 'image';
}

/** Una firma per un percorso del bucket. L'unico modo di leggere un oggetto privato, e il solo qui. */
async function signedPath(supabase: SupabaseClient, path: string): Promise<string | null> {
  return (await signKnowledgePaths(supabase, [path])).get(path) ?? null;
}

function dataUrlBytes(dataUrl: string): { bytes: Buffer; mime: string } | null {
  const [head, base64] = dataUrl.split(',');
  if (!base64) return null;

  return { bytes: Buffer.from(base64, 'base64'), mime: head?.match(/data:([^;]+)/)?.[1] ?? IMAGE_MIME };
}

type StoredDrawing = {
  storagePath: string;
  fileName: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
};

export type DrawingStoreFailure = { reason: string };

/**
 * I byte nel bucket privato, e nient'altro: né una riga, né un id. Il primo segmento del percorso
 * è ciò che le policy dello storage guardano, quindi è sempre lo user — con o senza un brand
 * sotto, il file resta suo.
 *
 * L'esito porta SEMPRE il motivo del fornitore, `dataUrlBytes` a parte: un bucket assente e una
 * scrittura respinta sono due difetti diversi, e schiacciarli sullo stesso `null` è quanto
 * rendeva `store_failed` indebuggabile dall'interfaccia.
 */
async function storeDrawing(
  supabase: SupabaseClient,
  folder: string,
  dataUrl: string
): Promise<StoredDrawing | DrawingStoreFailure> {
  const decoded = dataUrlBytes(dataUrl);
  if (!decoded) return { reason: 'the model returned no image data' };

  // Marcata sintetica prima di toccare lo storage: un'immagine di modello che gira senza la sua
  // provenienza è un problema che non si ripara a valle.
  const bytes = await markImage(decoded.bytes, decoded.mime, DIGITAL_SOURCE_TYPE.synthetic);
  const ext = decoded.mime.includes('jpeg') ? 'jpg' : decoded.mime.includes('webp') ? 'webp' : 'png';
  const fileName = `generated-${crypto.randomUUID()}.${ext}`;
  const storagePath = `${folder}/${fileName}`;

  const stored = await storeBrandMediaBytes(supabase, storagePath, bytes, decoded.mime);
  if (stored.error) return { reason: stored.error };

  const { width, height } = await probeImageDimensions(bytes);

  return { storagePath, fileName, mime: decoded.mime, bytes: bytes.length, width, height };
}

function isStoredDrawing(result: StoredDrawing | DrawingStoreFailure): result is StoredDrawing {
  return 'storagePath' in result;
}

type DepositOutcome = { ok: true; media: GeneratedMedia } | { ok: false; reason: string };

/**
 * Un'immagine generata finisce nel bucket privato della libreria, non fra i media pubblici dei
 * post: è materiale del brand, riutilizzabile, e nessuno deve poterla leggere senza una firma.
 */
async function depositImage(
  supabase: SupabaseClient,
  opts: { brandId: string; userId: string; prompt: string; title?: string },
  dataUrl: string
): Promise<DepositOutcome> {
  const drawn = await storeDrawing(supabase, `${opts.userId}/${opts.brandId}/media`, dataUrl);
  if (!isStoredDrawing(drawn)) return { ok: false, reason: drawn.reason };

  const { row, error } = await insertBrandMedia(supabase, {
    brandId: opts.brandId,
    userId: opts.userId,
    storagePath: drawn.storagePath,
    fileName: drawn.fileName,
    mime: drawn.mime,
    bytes: drawn.bytes,
    width: drawn.width,
    height: drawn.height,
    source: 'generate',
    title: opts.title?.trim() || opts.prompt.slice(0, 80)
  });
  if (!row) return { ok: false, reason: error ?? 'the library row could not be written' };

  return {
    ok: true,
    media: {
      id: row.id,
      kind: row.kind,
      mime: drawn.mime,
      width: drawn.width,
      height: drawn.height,
      url: mediaUrl(row.short_code)
    }
  };
}

/**
 * Il disegno chiesto senza un brand si CONSEGNA, non si archivia. Nessuna riga in `brand_media`:
 * le sue policy dicono `brand_id in (select auth_brand_ids())`, e `NULL in (…)` vale NULL, non
 * true — una riga senza brand sarebbe invisibile a tutti e nemmeno inseribile. Quindi torna quello
 * che c'è davvero: il percorso, e una firma che scade.
 */
async function handOverImage(
  supabase: SupabaseClient,
  opts: { userId: string },
  dataUrl: string
): Promise<DepositOutcome> {
  const drawn = await storeDrawing(supabase, `${opts.userId}/media`, dataUrl);
  if (!isStoredDrawing(drawn)) return { ok: false, reason: drawn.reason };

  // Senza un id, la firma è l'UNICO modo di raggiungere il file: consegnarla nulla lascerebbe chi
  // legge `ok` con un render pagato e niente da aprire.
  const signed = await signKnowledgePaths(supabase, [drawn.storagePath]);
  const url = signed.get(drawn.storagePath);
  if (!url) return { ok: false, reason: 'the file was stored but could not be signed for reading' };

  return {
    ok: true,
    media: {
      id: null,
      kind: 'image',
      mime: drawn.mime,
      width: drawn.width,
      height: drawn.height,
      url,
      storage_path: drawn.storagePath
    }
  };
}

/**
 * UNA SOLA funzione per disegnare e per modificare, perché il motore è lo stesso: `baseImage` è
 * l'unico segnale che `buildImageRequest` guarda per distinguere una modifica da un disegno nuovo.
 * I tool esposti restano due — generare e rifinire sono due operazioni diverse per chi chiama, e
 * vogliono argomenti diversi — ma qui sotto sarebbero due copie della stessa cosa.
 */
export type ImageJob = {
  /** `null` = disegno estemporaneo: nessun brand da leggere, nessuna libreria in cui archiviare. */
  brandId: string | null;
  userId: string;
  /** Cosa mostrare, oppure — con `baseMediaId` — cosa cambiare. */
  prompt: string;
  count?: number;
  aspectRatio?: AspectRatio;
  title?: string;
  /** Vale per QUESTA chiamata: non tocca `content_prefs`, che è il mestiere di set_media_model. */
  model?: string;
  /** L'immagine della libreria da cui partire. Presente → è una modifica. */
  baseMediaId?: string;
  brandStyle?: BrandStyleUse;
};

export type BrandStyleUse = 'apply' | 'ignore';

export type ImageJobResult =
  | {
      ok: true;
      media: GeneratedMedia[];
      model: string | null;
      renders: number;
      /**
       * Quanto è stato FATTURATO per questi render, letto dalle righe di `ai_calls` mentre lo
       * scope è ancora aperto. `null` quando nessuna fattura è arrivata — mai `0`, che sarebbe di
       * nuovo un numero comodo al posto di un fatto.
       */
      costUsd: number | null;
    }
  | { ok: false; error: 'render_failed' | 'store_failed' | 'source_not_found'; reason?: string }
  | SourceTooLarge
  | { ok: false; error: 'model_not_for_slot'; allowed: string[] };

async function brandContentPrefs(
  supabase: SupabaseClient,
  brandId: string
): Promise<Record<string, unknown>> {
  const { data } = await supabase
    .from('brands')
    .select('content_prefs')
    .eq('id', brandId)
    .maybeSingle();

  return (data?.content_prefs ?? {}) as Record<string, unknown>;
}

/**
 * L'esito di `imagePartFor`, più il peso quando lo conosciamo. Il MOTIVO viaggia fino in fondo:
 * schiacciarlo su «non trovata» è ciò che faceva rigenerare da zero una sorgente che c'era
 * eccome — il difetto che #403 ha chiuso, e che un secondo ramo non deve reintrodurre.
 */
type SourceOutcome =
  | { ok: true; part: ImagePart }
  | { ok: false; reason: ImagePartRefusal; bytes: number | null };

const SOURCE_MISSING = { ok: false, reason: 'fetch_failed', bytes: null } as const;

async function libraryImageSource(
  supabase: SupabaseClient,
  brandId: string,
  idOrPrefix: string
): Promise<SourceOutcome> {
  const { loadLibraryMediaPart } = await import('$lib/server/brand-media');
  const source = await resolveLibraryId(supabase, brandId, idOrPrefix);
  if (!source) return SOURCE_MISSING;

  const outcome = await loadLibraryMediaPart(supabase, brandId, source.id);

  return outcome.ok ? outcome : { ...outcome, bytes: source.bytes };
}

/**
 * Senza libreria il peso non è scritto da nessuna parte — non c'è una riga che lo porti — ma il
 * motivo sì, e vale lo stesso ridimensionamento a 2048px: sono file appena caricati dall'utente,
 * quindi grandi per definizione, ed è il ramo che ne ha più bisogno.
 */
async function storedImageSource(
  supabase: SupabaseClient,
  userId: string,
  handle: string
): Promise<SourceOutcome> {
  const path = ownStoragePath(userId, handle);
  if (!path) return SOURCE_MISSING;

  const url = await signedPath(supabase, path);
  if (!url) return SOURCE_MISSING;

  const { imagePartFor } = await import('$lib/server/brand-context');
  const outcome = await imagePartFor(url);

  return outcome.ok ? outcome : { ...outcome, bytes: null };
}

async function runImageJob(
  supabase: SupabaseClient,
  job: ImageJob
): Promise<ImageJobResult> {
  const [
    { renderPostImage, buildImageRequest, loadBrandVisualContext },
    { imageModelFor, imageRefineModelFor },
    { mediaModelSlot, slotAccepts, slotChoices }
  ] = await Promise.all([
    import('$lib/server/media-generate.images'),
    import('$lib/image-models'),
    import('$lib/media-model-slots')
  ]);

  // Il catalogo è quello vero, lo stesso che governa set_media_model: un secondo elenco
  // divergerebbe dal primo al prossimo modello aggiunto, e la metà vecchia rifiuterebbe in
  // silenzio un modello valido.
  const refining = !!job.baseMediaId;
  const slot = mediaModelSlot(refining ? 'imageRefineModel' : 'imageModel');
  if (job.model && slot && !slotAccepts(slot, job.model)) {
    return { ok: false, error: 'model_not_for_slot', allowed: slotChoices(slot).map((c) => c.id) };
  }

  // Senza brand non c'è niente da leggere: valgono i default del prodotto. Andarci lo stesso
  // sarebbe l'ancora rimasta attaccata — un `.eq('id', null)` che non trova nulla e intanto
  // racconta che questo percorso un brand ce l'ha ancora.
  const prefs = job.brandId ? await brandContentPrefs(supabase, job.brandId) : {};

  // Due confini, ognuno nella sua query. Sotto il brand `loadLibraryMediaPart` filtra per
  // brand_id, quindi l'id di un altro inquilino non risolve; senza brand il confine è il primo
  // segmento del percorso, che è lo user — la stessa cosa che guarda la policy dello Storage.
  let baseImage: ImagePart | undefined;
  if (job.baseMediaId) {
    const found = job.brandId
      ? await libraryImageSource(supabase, job.brandId, job.baseMediaId)
      : await storedImageSource(supabase, job.userId, job.baseMediaId);
    if (!found.ok) return refusedSource(found.reason, found.bytes);
    baseImage = found.part;
  }

  const brandVisuals =
    job.brandId && job.brandStyle !== 'ignore'
      ? await loadBrandVisualContext(supabase, job.brandId)
      : {};

  const opts = {
    ...brandVisuals,
    model: refining ? imageModelFor(prefs) : (job.model ?? imageModelFor(prefs)),
    refineModel: refining ? (job.model ?? imageRefineModelFor(prefs)) : imageRefineModelFor(prefs),
    baseImage,
    aspectRatio: job.aspectRatio
  };

  // Il modello riportato viene dalla STESSA funzione che costruisce la richiesta, non da una copia
  // della sua tabella: chiedere due volte la stessa cosa è gratis, tenerne due versioni no.
  const chosen = buildImageRequest(job.prompt, opts).model ?? null;

  const media: GeneratedMedia[] = [];
  // Quanti render sono stati PAGATI, non quanti ne sono stati chiesti. Un render riuscito che
  // qualcosa a valle scarta si paga lo stesso, e finche' il conto dichiarato racconta le immagini
  // invece dei render, mente — in silenzio, perche' `ai_calls` si riempie di `ok: true`.
  let renders = 0;
  for (let i = 0; i < (job.count ?? 1); i++) {
    renders += 1;
    const dataUrl = await renderPostImage(job.prompt, opts).catch(() => undefined);
    if (!dataUrl) break;

    const filed = job.brandId
      ? await depositImage(supabase, { ...job, brandId: job.brandId }, dataUrl)
      : await handOverImage(supabase, job, dataUrl);
    if (!filed.ok) return { ok: false, error: 'store_failed', reason: filed.reason };

    media.push(filed.media);
  }

  // Nessuna alternativa prodotta è un fallimento, non un successo vuoto: chi legge `ok` deve poter
  // credere che qualcosa esista.
  if (!media.length) return { ok: false, error: 'render_failed' };

  // Si legge QUI, dentro lo scope: la fattura vive lì e fuori non esiste più.
  const { billedUsdInScope } = await import('$lib/server/ai-log');

  return { ok: true, media, model: chosen, renders, costUsd: billedUsdInScope() ?? null };
}

/**
 * Il disegno estemporaneo: nessuno slug, nessun brand, niente da scegliere. Paga
 * l'organizzazione, che lo scope nomina — senza, la riga in `ai_calls` non atterrerebbe da nessuna
 * parte e il cancello dei crediti sopra passerebbe per sempre.
 */
export async function generateImagesWithoutBrand(
  supabase: SupabaseClient,
  job: Omit<ImageJob, 'brandId' | 'title'> & { orgId: string }
): Promise<ImageJobResult> {
  const { withOrgContext } = await import('$lib/server/ai-log');

  return withOrgContext(job.orgId, () => runImageJob(supabase, { ...job, brandId: null }));
}

/**
 * 4:5 è un formato da fotografia e nessun modello video lo accetta: passarlo rimappato su un altro
 * sarebbe consegnare una clip con un taglio che nessuno ha chiesto. Qui cade, e vale il default.
 */
const VIDEO_ASPECTS = ['1:1', '9:16', '16:9'] as const;

function videoAspect(ratio?: AspectRatio) {
  return VIDEO_ASPECTS.find((a) => a === ratio);
}

async function brandVisualStyle(
  admin: SupabaseClient,
  brandId: string
): Promise<string | undefined> {
  const { data } = await admin
    .from('brand_kit')
    .select('visual_style')
    .eq('brand_id', brandId)
    .maybeSingle();

  return (data?.visual_style as string | null) || undefined;
}

type CoverLookup = { url: string } | { ok: false; error: 'source_not_found' | 'source_not_an_image' };

async function libraryCoverUrl(
  admin: SupabaseClient,
  brandId: string,
  idOrPrefix: string
): Promise<CoverLookup> {
  const source = await resolveLibraryId(admin, brandId, idOrPrefix);
  if (!source) return { ok: false, error: 'source_not_found' };
  if (source.kind !== 'image') return { ok: false, error: 'source_not_an_image' };

  const { resolveBrandImageIds } = await import('$lib/server/brand-media');
  const urls = await resolveBrandImageIds(admin, brandId, [source.id]);
  // resolveBrandImageIds guarda solo `kind = 'image'`: un id che esiste ma e' un video non
  // risolve, e va detto con un errore suo invece che confuso con «non esiste».
  if (!urls.length) return { ok: false, error: 'source_not_an_image' };

  return { url: urls[0] };
}

async function storedCoverUrl(
  admin: SupabaseClient,
  userId: string,
  handle: string
): Promise<CoverLookup> {
  const path = ownStoragePath(userId, handle);
  if (!path) return { ok: false, error: 'source_not_found' };
  if (storedKind(path) !== 'image') return { ok: false, error: 'source_not_an_image' };

  const url = await signedPath(admin, path);

  return url ? { url } : { ok: false, error: 'source_not_found' };
}

/**
 * Un clip non torna mai pronto: la risposta è sempre un lavoro da seguire. Dichiararlo qui è ciò
 * che permette a chi legge di scrivere `durationSeconds` — i secondi DAVVERO mandati, e un clip si
 * paga al secondo — senza restringere a mano un'unione che comprende anche l'immagine.
 */
export type VideoJobResult =
  | {
      ok: true;
      status: 'rendering';
      media: [];
      jobId: string;
      model: string | null;
      renders: 0;
      durationSeconds: number | null;
    }
  | Extract<GenerateMediaResult, { ok: false }>;

async function startVideo(opts: GenerateMediaOpts): Promise<VideoJobResult> {
  const [{ createAdminClient }, { countOutstandingVideoRenders, submitAndTrackVideoRender }] =
    await Promise.all([
      import('$lib/server/supabase-admin'),
      import('$lib/server/video-render-queue')
    ]);
  const admin = createAdminClient();

  // Senza brand non c'è niente da leggere: valgono i default del prodotto. Andarci lo stesso
  // sarebbe l'ancora rimasta attaccata — un `.eq('id', null)` che non trova nulla e intanto
  // racconta che questo percorso un brand ce l'ha ancora.
  const { data: brand } = opts.brandId
    ? await admin
        .from('brands')
        .select('plan, timezone, content_prefs')
        .eq('id', opts.brandId)
        .maybeSingle()
    : { data: null };
  const prefs = (brand?.content_prefs ?? {}) as Record<string, string | number | null>;

  const visualStyle = opts.brandId ? await brandVisualStyle(admin, opts.brandId) : undefined;

  // Animare una foto e filmare da un prompt sono due MESTIERI, e il catalogo lo sa gia': lo slot
  // cambia, quindi cambia anche l'elenco dei modelli ammessi. Sceglierne uno solo accetterebbe un
  // modello che poi il renderer scarta.
  const { mediaModelSlot, slotAccepts, slotChoices } = await import('$lib/media-model-slots');
  const slot = mediaModelSlot(opts.baseMediaId ? 'videoImageModel' : 'videoModel');
  if (opts.model && slot && !slotAccepts(slot, opts.model)) {
    return { ok: false, error: 'model_not_for_slot', allowed: slotChoices(slot).map((c) => c.id) };
  }

  // La copertina e' l'immagine da animare, e vive nella libreria di QUESTO brand: la risoluzione
  // passa da resolveBrandImageIds, che filtra `brand_id` nella query e per un id di un altro
  // inquilino non restituisce niente. Non trovarla FERMA la richiesta: filmare da zero un prompt
  // quando qualcuno ha chiesto di animare la sua foto e' il difetto travestito da rimedio.
  //
  // Senza brand la stessa domanda ha un'altra risposta e lo stesso confine: la maniglia è il
  // percorso consegnato, e il suo primo segmento è lo user.
  let coverUrl: string | undefined;
  if (opts.baseMediaId) {
    const cover = opts.brandId
      ? await libraryCoverUrl(admin, opts.brandId, opts.baseMediaId)
      : await storedCoverUrl(admin, opts.userId, opts.baseMediaId);
    if ('error' in cover) return cover;
    coverUrl = cover.url;
  }

  // La durata si CONTRATTA prima di inviare. `clampVideoDuration` alzerebbe in silenzio 5 a 10 —
  // e i video si pagano al secondo, quindi un riporto muto raddoppia il conto senza dirlo. Il
  // pavimento di prodotto (MIN_DURATION) resta dov'e' per il percorso dei post: qui si rifiuta
  // dichiarando la finestra, invece di consegnare qualcosa che nessuno ha chiesto.
  const { resolveVideoModel, clampVideoDuration } = await import('$lib/server/video');
  const effectiveModel = resolveVideoModel({
    model: opts.model ?? null,
    prefs,
    hasCover: !!opts.baseMediaId
  });
  const wanted = opts.durationSeconds;
  if (wanted != null) {
    const achievable = clampVideoDuration(wanted, effectiveModel);
    if (achievable !== wanted) {
      return {
        ok: false,
        error: 'duration_out_of_range',
        reason: `${effectiveModel} cannot film ${wanted}s — the nearest it accepts is ${achievable}s. Ask for that instead; a clip is billed per second.`
      };
    }
  }

  // L'allocazione mensile dei video è del PIANO di un brand. Senza brand non c'è un piano da
  // interrogare: il tetto è il saldo crediti dell'organizzazione, che la rotta guarda prima di qui.
  if (opts.brandId) {
    const { remaining } = await import('$lib/server/usage');
    const budget = await remaining(admin, opts.brandId, brand?.plan, brand?.timezone ?? 'Europe/Rome');

    // I render in volo contano sull'allowance: il numero mensile si addebita quando il clip atterra,
    // e guardare solo `usage` lascerebbe spendere lo stesso budget più volte di fila.
    const inFlight = await countOutstandingVideoRenders(admin, opts.brandId);
    if (budget.videos - inFlight <= 0) return { ok: false, error: 'video_budget_exhausted' };
  }

  let submitReason: string | undefined;
  const submitted = await submitAndTrackVideoRender({
    admin,
    onSubmitError: (why: string) => {
      submitReason = safeProviderReason(why);
    },
    brandId: opts.brandId,
    orgId: opts.orgId,
    userId: opts.userId,
    postId: null,
    threadId: null,
    // `imagePrompt` è la SCENA — cosa si vede. `render.prompt` sarebbe il brief di regia (camera,
    // movimento, energia) e resta vuoto apposta: ripeterci dentro la stessa stringa la
    // duplicherebbe nel prompt finale, dove scena e regia vengono concatenate.
    imagePrompt: opts.prompt,
    render: {
      aspectRatio: videoAspect(opts.aspectRatio),
      // Con una copertina il modello parte da quei pixel: soggetto, scena e stile sono gia' li',
      // e il prompt dirige il MOVIMENTO.
      imageUrl: coverUrl,
      // Un fotogramma finale senza quello iniziale non ha un percorso da chiudere: si ignora
      // invece di mandarlo al provider, che lo scarterebbe comunque (`RenderVideoOpts.lastFrameUrl`).
      lastFrameUrl: coverUrl ? opts.lastFrameUrl : undefined,
      referenceImageUrls: opts.referenceImageUrls,
      referenceAudioUrls: opts.referenceAudioUrls,
      referenceVideoUrls: opts.referenceVideoUrls,
      duration: opts.durationSeconds ?? (prefs.videoDuration as number | undefined),
      visualStyle,
      instructions: prefs.videoInstructions as string | null | undefined,
      resolution: prefs.videoResolution as string | null | undefined,
      model:
        opts.model ??
        ((opts.baseMediaId ? prefs.videoImageModel : prefs.videoModel) as string | null | undefined)
    }
  });
  if (!submitted) return { ok: false, error: 'render_failed', ...(submitReason ? { reason: submitReason } : {}) };

  const { data: job } = await admin
    .from('video_renders')
    .select('id')
    .eq('task_id', submitted.taskId)
    .maybeSingle();
  if (!job) return { ok: false, error: 'store_failed' };

  return {
    ok: true,
    status: 'rendering',
    media: [],
    jobId: job.id as string,
    model: submitted.model ?? null,
    renders: 0,
    durationSeconds: submitted.durationSeconds ?? wanted ?? null
  };
}

/**
 * Un clip senza brand. Non torna pronto — kie ci mette minuti — e non c'è una libreria in cui
 * depositarlo: il risultato vive sulla riga della coda, che porta addosso chi paga.
 */
export async function generateVideoWithoutBrand(
  opts: Omit<GenerateMediaOpts, 'brandId' | 'kind' | 'title'> & { orgId: string }
): Promise<VideoJobResult> {
  const { withOrgContext } = await import('$lib/server/ai-log');

  return withOrgContext(opts.orgId, () => startVideo({ ...opts, brandId: null, kind: 'video' }));
}
