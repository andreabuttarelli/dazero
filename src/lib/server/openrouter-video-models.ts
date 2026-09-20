/**
 * IL CATALOGO VIDEO, CHIESTO AL GATEWAY.
 *
 * Gemello di `openrouter-models.ts`, un endpoint più in là: `/videos/models` pubblica per ogni
 * modello le durate ammesse, i rapporti, le risoluzioni, se genera audio e quali fotogrammi
 * accetta. Sono gli stessi fatti che `video-models.ts` teneva scritti a mano, modello per modello.
 *
 * PERCHÉ NON SI SCRIVONO PIÙ A MANO. Un registro locale dice la verità fino al giorno in cui un
 * provider cambia una durata o ritira un rapporto, e quel giorno non ce lo comunica nessuno: il
 * render prende un 422 e sembra un difetto nostro. Il gateway invece il suo catalogo lo aggiorna,
 * perché è lui a servire quei modelli.
 *
 * CIÒ CHE NON C'È NON SI INVENTA. Un modello che il gateway non conosce torna `null`, mai un
 * default prudente: un default è una bugia che il provider smentisce dopo che si è già pagato.
 *
 * UN CATALOGO IRRAGGIUNGIBILE NON SPEGNE LA GENERAZIONE. La rete che cade lascia la mappa vuota e
 * chi chiama decide: un throw qui fermerebbe un render che sarebbe partito benissimo, e una
 * risposta vuota non cancella un catalogo buono già in memoria.
 */
import { env } from '$env/dynamic/private';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export type VideoCatalogEntry = {
  id: string;
  label: string;
  /** Le durate in secondi che il modello accetta. Vuoto = il gateway non le dichiara. */
  durations: number[];
  aspectRatios: string[];
  resolutions: string[];
  /** Il modello produce anche l'audio, o la clip esce muta. */
  generatesAudio: boolean;
  /** Accetta un fotogramma di partenza. */
  firstFrame: boolean;
  /** Accetta anche quello finale: non tutti, ed è ciò che rende possibile una transizione decisa. */
  lastFrame: boolean;
};

type RawVideoModel = {
  id?: string;
  name?: string;
  supported_durations?: unknown;
  supported_aspect_ratios?: unknown;
  supported_resolutions?: unknown;
  supported_frame_images?: unknown;
  generate_audio?: unknown;
};

let catalog = new Map<string, VideoCatalogEntry>();
let loadedAt = 0;
let inFlight: Promise<void> | null = null;

export function __resetVideoCatalog(): void {
  catalog = new Map();
  loadedAt = 0;
  inFlight = null;
}

const strings = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.map((v) => String(v)).filter(Boolean) : [];

const numbers = (raw: unknown): number[] =>
  Array.isArray(raw) ? raw.map((v) => Number(v)).filter((n) => Number.isFinite(n)) : [];

export async function ensureVideoCatalog(
  opts: { fetchImpl?: typeof fetch; baseUrl?: string } = {}
): Promise<void> {
  if (catalog.size && Date.now() - loadedAt < CACHE_TTL_MS) return;
  if (inFlight) return inFlight;

  const doFetch = opts.fetchImpl ?? fetch;
  const baseUrl = (opts.baseUrl ?? env.LLM_BASE_URL?.trim() ?? '').replace(/\/$/, '');
  if (!baseUrl) return;

  inFlight = (async () => {
    try {
      const res = await doFetch(`${baseUrl}/videos/models`);
      if (!res.ok) return;
      const body = (await res.json()) as { data?: RawVideoModel[] };

      const next = new Map<string, VideoCatalogEntry>();
      for (const m of body?.data ?? []) {
        if (!m?.id) continue;
        const frames = strings(m.supported_frame_images);
        next.set(m.id, {
          id: m.id,
          label: m.name?.trim() || m.id,
          durations: numbers(m.supported_durations),
          aspectRatios: strings(m.supported_aspect_ratios),
          resolutions: strings(m.supported_resolutions),
          generatesAudio: m.generate_audio === true,
          firstFrame: frames.includes('first_frame'),
          lastFrame: frames.includes('last_frame')
        });
      }
      // Una risposta vuota non è un catalogo nuovo: è una risposta vuota. Sostituire quello buono
      // con niente toglierebbe le capacità a metà giornata senza che nulla sia cambiato davvero.
      if (next.size) {
        catalog = next;
        loadedAt = Date.now();
      }
    } catch {
      // La rete che cade lascia le cose come stavano: chi chiama ha il suo ripiego.
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Cosa il gateway dice di questo modello, o null se non lo conosce. */
export function videoCatalogEntry(modelId: string | undefined | null): VideoCatalogEntry | null {
  return (modelId && catalog.get(modelId)) || null;
}

/** L'elenco per un picker, nell'ordine in cui il gateway lo pubblica. */
export function videoCatalogModels(): VideoCatalogEntry[] {
  return [...catalog.values()];
}
