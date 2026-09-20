<script lang="ts">
  /**
   * LA TELA DEL BRAND: media, documenti e post su una superficie sola.
   *
   * Le posizioni vivono in `brand_canvas_items`: chi ha già una riga la tiene, chi non l'ha mai
   * avuta passa dal layout che impila le tile senza farle toccare.
   */
  import { deserialize } from '$app/forms';
  import CanvasFlow from '$lib/components/canvas/CanvasFlow.svelte';
  import { packTiles } from '$lib/canvas/layout';
  import { isVectorImageSource } from '$lib/raster-image';

  let { data } = $props();

  type Media = { id: string; signed_url: string | null; kind: string; mime: string | null; width: number | null; height: number | null; title: string | null; file_name: string | null };
  type Doc = { id: string; title: string | null; kind: string | null; status: string | null; summary: string | null; file_name: string | null; collection: string | null };
  type Post = { id: string; caption: string | null; media_url: string | null; platform: string | null; status: string | null; content_type: string | null; scheduled_for: string | null };

  /** Cosa una tile mostra. La tela non lo sa: lo decide questa pagina. */
  type Card = { sort: 'media'; media: Media } | { sort: 'doc'; doc: Doc } | { sort: 'post'; post: Post };

  const COLUMNS = 5;

  /** La chiave con cui una posizione salvata trova la sua tile. La stessa che usa il server. */
  const keyOf = (c: Card) =>
    c.sort === 'media' ? `media:${c.media.id}` : c.sort === 'doc' ? `document:${c.doc.id}` : `post:${c.post.id}`;
  const kindOf = (c: Card) => (c.sort === 'media' ? 'media' : c.sort === 'doc' ? 'document' : 'post');
  const idOf = (c: Card) => (c.sort === 'media' ? c.media.id : c.sort === 'doc' ? c.doc.id : c.post.id);

  // I tre tipi alternati invece che in blocchi: un muro di immagini seguito da un muro di schede
  // nasconderebbe il caso che conta — una tile di testo accanto a una di foto, che è dove una tela
  // mostra se regge.
  const cards = $derived<Card[]>(
    (() => {
      const media = (data.items as Media[]).map((m): Card => ({ sort: 'media', media: m }));
      const docs = (data.documents as Doc[]).map((d): Card => ({ sort: 'doc', doc: d }));
      const posts = (data.posts as Post[]).map((p): Card => ({ sort: 'post', post: p }));
      const out: Card[] = [];
      for (let i = 0; i < Math.max(media.length, docs.length, posts.length); i++) {
        if (media[i]) out.push(media[i]);
        if (docs[i]) out.push(docs[i]);
        if (posts[i]) out.push(posts[i]);
      }
      return out;
    })()
  );

  // Un documento e un post sono più larghi che alti: sono testo, e un quadrato li costringerebbe a
  // una colonna stretta. Le misure diverse sono anche ciò che mette alla prova la tela.
  const tiles = $derived(
    (() => {
      const sized = cards.map((card) => ({
        id: idOf(card),
        w: card.sort === 'media' ? 300 : 340,
        h: card.sort === 'media' ? 300 : card.sort === 'doc' ? 200 : 180,
        card
      }));

      // Chi ha già una posizione la tiene; solo le tile mai spostate passano dal layout, che le
      // impila senza farle toccare. Disporre anche quelle salvate le riporterebbe indietro a ogni
      // apertura, cancellando il lavoro di chi le aveva sistemate.
      const placements = data.placements as Record<string, { x: number; y: number; w: number; h: number }>;
      const fresh = sized.filter((t) => !placements[keyOf(t.card)]);
      const packed = new Map(packTiles(fresh).map((p) => [p.id, p]));

      return sized.map((t) => {
        const saved = placements[keyOf(t.card)];
        const auto = packed.get(t.id);
        return { ...t, x: saved?.x ?? auto?.x ?? 0, y: saved?.y ?? auto?.y ?? 0 };
      });
    })()
  );

  const byId = $derived(new Map(tiles.map((t) => [t.id, t.card])));

  const cardById = $derived(new Map(tiles.map((t) => [t.id, t.card])));

  /**
   * Il salvataggio parte a trascinamento FINITO, non durante: SvelteFlow emette una posizione per
   * fotogramma, e una richiesta per fotogramma sarebbe cento scritture per uno spostamento.
   */
  async function persist(id: string, x: number, y: number) {
    const card = cardById.get(id);
    if (!card || !data.canvasId) return;
    const tile = tiles.find((t) => t.id === id);

    const fd = new FormData();
    fd.set('canvas_id', data.canvasId);
    fd.set('ref_kind', kindOf(card));
    fd.set('ref_id', idOf(card));
    fd.set('x', String(Math.round(x)));
    fd.set('y', String(Math.round(y)));
    fd.set('w', String(tile?.w ?? 300));
    fd.set('h', String(tile?.h ?? 300));

    saving = true;
    try {
      // `x-sveltekit-action` è ciò che distingue questa chiamata dall'invio di un form: senza,
      // SvelteKit risponde 303 verso la pagina, `fetch` segue il redirect da solo e torna l'HTML
      // con `res.ok` vero. Si leggeva «salvato» mentre la tabella restava vuota.
      const res = await fetch('?/move', {
        method: 'POST',
        headers: { 'x-sveltekit-action': 'true' },
        body: fd
      });

      // L'esito sta nel CORPO: una action risponde 200 anche quando rifiuta, quindi `res.ok` non
      // distingue un salvataggio da un rifiuto. Un salvataggio fallito si DICE: una posizione
      // persa in silenzio si scopre alla prossima apertura, quando la tile è tornata dov'era e
      // nessuno sa perché.
      const result = deserialize(await res.text());
      failed = result.type === 'success' ? null : 'posizione non salvata';
    } catch {
      failed = 'posizione non salvata';
    } finally {
      saving = false;
    }
  }

  let saving = $state(false);
  let failed = $state<string | null>(null);
</script>

<svelte:head><title>Canvas</title></svelte:head>

<div class="lab">
  <header>
    <h1>Canvas</h1>
    <p class="hint">Due dita per spostare · pinch o ⌘/Ctrl + rotella per zoomare · trascina i riquadri</p>
    <span class="count">
      {data.items.length} media · {data.documents.length} documenti · {data.posts.length} post
      {#if failed}· <span class="bad">{failed}</span>{:else if saving}· salvo…{/if}
    </span>
  </header>

  <div class="stage">
    <CanvasFlow {tiles} onMove={persist}>
      {#snippet tile(t)}
        {@const c = byId.get(t.id)}
        {#if c?.sort === 'media'}
          <figure class="card">
            {#if c.media.signed_url && c.media.kind === 'image'}
              <img
                src={c.media.signed_url}
                alt={c.media.title ?? c.media.file_name ?? ''}
                loading="lazy"
                class:vector={isVectorImageSource({ mime: c.media.mime ?? '', filename: c.media.file_name ?? '' })}
              />
            {:else if c.media.signed_url}
              <video src={c.media.signed_url} muted playsinline></video>
            {:else}
              <span class="ph">{c.media.file_name ?? t.id.slice(0, 8)}</span>
            {/if}
          </figure>
        {:else if c?.sort === 'post'}
          <article class="card post">
            <p>{c.post.caption ?? 'Senza testo'}</p>
            <footer>
              {#if c.post.platform}<span class="tag">{c.post.platform}</span>{/if}
              <span class="tag" class:warn={c.post.status === 'pending_user'}>{c.post.status ?? 'bozza'}</span>
            </footer>
          </article>
        {:else if c?.sort === 'doc'}
          <article class="card doc">
            <h3>{c.doc.title ?? c.doc.file_name ?? 'Senza titolo'}</h3>
            {#if c.doc.summary}<p>{c.doc.summary}</p>{/if}
            <footer>
              <span class="tag">{c.doc.kind ?? 'document'}</span>
              {#if c.doc.collection}<span class="tag">{c.doc.collection}</span>{/if}
              {#if c.doc.status && c.doc.status !== 'ready'}<span class="tag warn">{c.doc.status}</span>{/if}
            </footer>
          </article>
        {/if}
      {/snippet}
    </CanvasFlow>
  </div>
</div>

<style>
  .lab { display: flex; flex-direction: column; height: calc(100dvh - 60px); gap: 10px; padding: 12px; }
  header { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
  h1 { margin: 0; font-size: 18px; }
  .hint { margin: 0; font-size: 12px; color: var(--ink-faint); }
  .count { margin-left: auto; font-size: 12px; color: var(--ink-faint); }
  .bad { color: #b91c1c; }

  .stage { flex: 1; min-height: 0; border-radius: 14px; overflow: hidden; border: 1px solid color-mix(in srgb, var(--ink) 10%, transparent); }

  .card {
    margin: 0; width: 100%; height: 100%; border-radius: 12px; overflow: hidden;
    background: var(--paper); display: grid; place-items: center;
    box-shadow: 0 1px 3px color-mix(in srgb, var(--ink) 12%, transparent);
  }
  .card img, .card video { width: 100%; height: 100%; object-fit: cover; display: block; }
  /* Un vettoriale è quasi sempre un logo: contenuto invece che ritagliato, su carta perché uno
     con lo sfondo trasparente sparirebbe sulla tessera. */
  .card img.vector { object-fit: contain; padding: 12%; background: #fff; box-sizing: border-box; }
  .ph { font-size: 12px; color: var(--ink-faint); padding: 8px; text-align: center; }

  /* Un documento è testo: si allinea in alto e si legge, non si ritaglia come una foto. */
  .doc { display: flex; flex-direction: column; gap: 8px; place-items: stretch; padding: 14px; text-align: left; }
  .doc h3 { margin: 0; font-size: 15px; line-height: 1.3; }
  .doc p {
    margin: 0; font-size: 12px; line-height: 1.45; color: var(--ink-soft); flex: 1; overflow: hidden;
    display: -webkit-box; line-clamp: 5; -webkit-line-clamp: 5; -webkit-box-orient: vertical;
  }
  .doc footer { display: flex; gap: 6px; flex-wrap: wrap; }
  .tag {
    font-size: 10px; padding: 2px 7px; border-radius: 999px; color: var(--ink-soft);
    background: color-mix(in srgb, var(--ink) 7%, transparent);
  }
  .tag.warn { background: color-mix(in srgb, #d97706 18%, transparent); color: #92400e; }

  /* Un post è la sua didascalia: niente titolo, perché non ne ha uno. */
  .post { display: flex; flex-direction: column; gap: 10px; place-items: stretch; padding: 14px; text-align: left; }
  .post p {
    margin: 0; font-size: 13px; line-height: 1.45; flex: 1; overflow: hidden;
    display: -webkit-box; line-clamp: 4; -webkit-line-clamp: 4; -webkit-box-orient: vertical;
  }
  .post footer { display: flex; gap: 6px; flex-wrap: wrap; }
</style>
