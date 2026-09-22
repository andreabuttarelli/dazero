<script lang="ts">
  import { Play } from '@lucide/svelte';

  let {
    kind,
    title,
    url
  }: { kind: string; title: string | null; url: string } = $props();

  const isVideo = $derived(kind === 'video');
  const label = $derived(title?.trim() || (isVideo ? 'Video' : 'Immagine'));
</script>

<a class="tile" href={url} target="_blank" rel="noreferrer" title={label} aria-label={label}>
  <span class="frame">
    {#if isVideo}
      <!-- Primo fotogramma come copertina: metadata basta a farlo apparire senza scaricare
           la clip intera su uno scaffale che può arrivare a sessanta pezzi. -->
      <!-- svelte-ignore a11y_media_has_caption -->
      <video src={url} muted playsinline preload="metadata"></video>
      <span class="play" aria-hidden="true">
        <Play size={11} strokeWidth={2.25} fill="currentColor" />
      </span>
    {:else}
      <img src={url} alt="" loading="lazy" />
    {/if}
  </span>
  {#if title}
    <span class="name">{title}</span>
  {/if}
</a>

<style>
  /* Il pezzo intero è il bersaglio del click: niente secondo bottone dentro il riquadro,
     che a questa misura non si prende il tocco senza rubare metà miniatura. */
  .tile {
    display: block;
    min-width: 0;
    text-decoration: none;
    color: inherit;
    border-radius: 10px;
  }
  .frame {
    position: relative;
    display: block;
    aspect-ratio: 1;
    border: 1px solid var(--line, #ededef);
    border-radius: 10px;
    overflow: hidden;
    background: var(--paper-2, #f9f9f9);
  }
  img,
  video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    background: var(--paper-2, #f9f9f9);
  }
  .play {
    position: absolute;
    inset: 0;
    margin: auto;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: #fff;
    background: color-mix(in oklab, #000 50%, transparent);
    pointer-events: none;
  }
  .name {
    display: block;
    margin: 5px 2px 0;
    font-size: 11px;
    line-height: 1.3;
    color: var(--ink-soft, #6e6e73);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tile:hover .frame {
    border-color: var(--line-2, #d2d2d7);
  }
  .tile:focus-visible {
    outline: 2px solid var(--accent, #7c5cff);
    outline-offset: 2px;
  }
</style>
