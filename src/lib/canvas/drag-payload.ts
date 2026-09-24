/**
 * COSA DIVENTA UN NODO QUANDO ARRIVA TRASCINATO DA FUORI LA TELA — dalla libreria degli asset o
 * dalla lista dei brand. Una tabella sola, non un `if` per ogni pannello che trascina qualcosa:
 * `DRAG_NODE_KIND` risponde "che tipo di nodo nasce" per ogni origine, e le funzioni sotto
 * costruiscono `data` già nella forma che `nodes_data_shape_check` (vedi la migration
 * `20260922_jsonb_check_constraints.sql`) e gli zod di `node-data.ts` accettano.
 *
 * UN NODO STATICO, NON GENERATO. Un'immagine o un video trascinati prendono `type: 'image'`
 * o `type: 'video'` con `data.assetId` valorizzato — lo stesso discriminante di
 * `uploaded-node.ts::isUploadedNodeRow`: un upload e un drag sono la stessa cosa sulla tela,
 * un file che esiste già, non un prompt da far girare. `prompt: ''` soddisfa il CHECK, che per
 * `image`/`video` chiede solo quello — `assetId` non è nel CHECK apposta (vedi il commento in
 * `uploaded-node.ts`), ma è lui a far apparire il tag "caricato" invece del pulsante "Genera".
 */
import { genNodeSize } from './gen-node';
import { docNodeSize } from './doc-node';
import { socialFeedNodeSize } from './social-feed-node';
import { SOCIAL_PLATFORMS } from './social-platforms';

export type DragAssetKind = 'image' | 'video' | 'document';
export type DragBrandField = 'logo' | 'text' | 'content';

export const DRAG_NODE_KIND: {
  asset: Record<DragAssetKind, 'image' | 'video' | 'doc'>;
  brand: Record<DragBrandField, 'image' | 'text' | 'doc'>;
  chip: { colour: 'image'; handle: 'social_account_feed' };
} = {
  asset: {
    image: 'image',
    video: 'video',
    document: 'doc'
  },
  brand: {
    logo: 'image',
    text: 'text',
    content: 'doc'
  },
  chip: {
    colour: 'image',
    handle: 'social_account_feed'
  }
};

export type StaticImageOrVideoData = {
  prompt: '';
  assetId: string;
  url: string;
  name: string;
  mimeType: string;
};

export function staticMediaData(input: {
  assetId: string;
  url: string;
  name: string;
  mimeType: string;
}): StaticImageOrVideoData {
  return { prompt: '', assetId: input.assetId, url: input.url, name: input.name, mimeType: input.mimeType };
}

export type StaticTextData = { prompt: string };

export function staticTextData(text: string): StaticTextData {
  return { prompt: text };
}

export type StaticDocData = { content: string; public: false };

export function staticDocData(content: string): StaticDocData {
  return { content, public: false };
}

export type InfluencerData = { influencer_id: string };

export function influencerNodeData(influencerId: string): InfluencerData {
  return { influencer_id: influencerId };
}

/** Alto quanto un'immagine (`genNodeSize('image')`): un influencer mostra un volto, non testo. */
const INFLUENCER_NODE_SIZE = { w: 360, h: 460 };

export function influencerNodeSize(): { w: number; h: number } {
  return { ...INFLUENCER_NODE_SIZE };
}

/**
 * IL TIPO MIME CON CUI UN NODO GIÀ PIENO VIAGGIA DA FUORI LA TELA — dalla libreria asset o dalla
 * lista brand, un `dragstart` su una card, non sul menù `+` della tela. `CANVAS_DRAG_MEDIUM`
 * (`new-node.ts`) porta solo un nome di tipo (`Addable`) e la tela lo trasforma in un nodo VUOTO
 * (`newNodeRow`); qui invece il nodo nasce PIENO — un asset o un campo brand che esiste già, non
 * un prompt da scrivere. Un MIME diverso, non un payload più ricco sullo stesso: la tela di oggi
 * (`CanvasFlow.svelte::onDrop`) ignora un tipo che non riconosce, quindi finché il suo handler
 * non legge anche questo, un file trascinato qui non fa niente — non crea un nodo vuoto per
 * sbaglio, che sarebbe peggio di un trascinamento che non funziona ancora.
 */
export const CANVAS_DRAG_FILLED_NODE = 'application/x-dazero-filled-node';

export type FilledNodeDrag = {
  type: 'image' | 'video' | 'text' | 'doc' | 'influencer' | 'social_account_feed';
  data: Record<string, unknown>;
  w: number;
  h: number;
};

/**
 * LO STESSO PACCHETTO, DA UNA RIGA DI ASSET O DA UN CAMPO BRAND — non riscritto a ogni pannello
 * che trascina. Prima viveva due volte, dentro `dragstart` di `assets/+page.svelte` e
 * `brands/+page.svelte`; la sidebar del progetto (`ProjectDragPanel`) è il terzo posto da cui la
 * stessa card parte, e una terza copia sarebbe la regola sparsa che CLAUDE.md chiede di non
 * scrivere. `null` quando non c'è niente da mettere nel nodo — un asset senza url firmato, un
 * campo brand vuoto — non un nodo che nasce e si scopre rotto al primo sguardo.
 */
export function assetDrag(item: {
  type: string;
  id: string;
  signedUrl: string | null;
  url: string | null;
  mimeType: string | null;
  content: string | null;
}): FilledNodeDrag | null {
  if (item.type === 'image' || item.type === 'video') {
    if (!item.signedUrl) return null;
    const nodeType = item.type;
    return {
      type: nodeType,
      data: staticMediaData({
        assetId: item.id,
        url: item.signedUrl,
        name: item.url?.split('/').pop() ?? item.id,
        mimeType: item.mimeType ?? ''
      }),
      ...genNodeSize(nodeType)
    };
  }

  if (item.type === 'document') {
    return { type: 'doc', data: staticDocData(item.content ?? ''), ...docNodeSize() };
  }

  return null;
}

export function brandFieldDrag(
  brand: { name: string; logoAssetId: string | null; logoUrl: string | null; shortDescription: string | null; content: string | null },
  field: DragBrandField
): FilledNodeDrag | null {
  if (field === 'logo') {
    if (!brand.logoAssetId || !brand.logoUrl) return null;
    return {
      type: 'image',
      data: staticMediaData({ assetId: brand.logoAssetId, url: brand.logoUrl, name: `${brand.name} logo`, mimeType: 'image/*' }),
      ...genNodeSize('image')
    };
  }

  if (field === 'text') {
    return {
      type: 'text',
      data: staticTextData(`${brand.name}\n\n${brand.shortDescription ?? ''}`.trim()),
      ...genNodeSize('text')
    };
  }

  if (!brand.content) return null;
  return { type: 'doc', data: staticDocData(brand.content), ...docNodeSize() };
}

/**
 * UN INFLUENCER TRASCINATO DAL PANNELLO — di catalogo o proprio dell'org, la stessa card in
 * entrambi i casi: il nodo porta solo `influencer_id`, le viste il server le legge da
 * `influencer_views` quando la tila si disegna (`InfluencerNode.svelte`), la stessa dottrina di
 * `ProductsNode`. Nessun caso `null`: un influencer esiste già per costruzione, a differenza di un
 * asset senza url firmato o un campo brand vuoto.
 */
export function influencerDrag(influencer: { id: string }): FilledNodeDrag {
  return { type: 'influencer', data: influencerNodeData(influencer.id), ...influencerNodeSize() };
}

/**
 * UN CHIP COLORE, TRASCINATO DAL MARKDOWN DI UN BRAND — diventa un'immagine statica dello stesso
 * tipo di un logo trascinato (`brandFieldDrag`), non un nodo generato: `assetId` deve esistere
 * già quando il puntatore parte, perché `dragstart` è sincrono e non può materializzare uno
 * swatch al volo (vedi il commento in cima al file). Chi chiama prepara l'asset PRIMA — la stessa
 * regola di `logoAssetId` in `brands/+page.server.ts`.
 */
export function colourDrag(swatch: { hex: string; assetId: string | null; url: string | null }): FilledNodeDrag | null {
  if (!swatch.assetId || !swatch.url) return null;
  return {
    type: 'image',
    data: staticMediaData({ assetId: swatch.assetId, url: swatch.url, name: swatch.hex, mimeType: 'image/png' }),
    ...genNodeSize('image')
  };
}

/**
 * UN CHIP PIATTAFORMA, TRASCINATO DAL MARKDOWN DI UN BRAND — diventa un nodo `social_account_feed`
 * già con `platform`/`handle` valorizzati, come se qualcuno l'avesse appena compilato a mano.
 * Nessun `null`: un handle scritto nel content esiste già per costruzione, ma la piattaforma deve
 * stare nel CHECK (`SOCIAL_PLATFORMS`) — un valore fuori tabella non produce un nodo che poi il
 * database rifiuterebbe.
 */
export function handleDrag(chip: { platform: string; handle: string }): FilledNodeDrag | null {
  if (!(SOCIAL_PLATFORMS as readonly string[]).includes(chip.platform)) return null;
  return {
    type: 'social_account_feed',
    data: { platform: chip.platform, handle: chip.handle },
    ...socialFeedNodeSize()
  };
}

export function serializeFilledNodeDrag(drag: FilledNodeDrag): string {
  return JSON.stringify(drag);
}

const FILLED_NODE_DRAG_TYPES = new Set<FilledNodeDrag['type']>([
  'image',
  'video',
  'text',
  'doc',
  'influencer',
  'social_account_feed'
]);

export function parseFilledNodeDrag(raw: string): FilledNodeDrag | null {
  try {
    const parsed = JSON.parse(raw) as Partial<FilledNodeDrag>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.type || !FILLED_NODE_DRAG_TYPES.has(parsed.type)) return null;
    if (!parsed.data || typeof parsed.data !== 'object') return null;
    if (typeof parsed.w !== 'number' || typeof parsed.h !== 'number') return null;
    return { type: parsed.type, data: parsed.data, w: parsed.w, h: parsed.h };
  } catch {
    return null;
  }
}
