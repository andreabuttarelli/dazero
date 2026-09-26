<script lang="ts">
  /**
   * IL NODO `influencer`, disegnato: il volto, il nome, quante viste porta.
   *
   * Sempre pieno, mai in modifica — a differenza di `ProductsNode` non c'è un campo da scrivere
   * sulla tile: `influencer_id` non cambia dopo la nascita. `views` arriva da fuori (il server le
   * legge da `influencer_views`), mai da `nodes.data` — la stessa dottrina di `ProductsNode` per i
   * prodotti, qui applicata alle immagini di un volto.
   */
  import UserRound from '@lucide/svelte/icons/user-round';

  type InfluencerView = { id: string; label: string; url: string | null };

  let {
    name,
    views = []
  }: {
    name: string;
    views?: InfluencerView[];
  } = $props();

  const cover = $derived(views[0] ?? null);
</script>

<div class="influencer">
  <div class="influencer-body">
    {#if cover?.url}
      <img class="influencer-photo" src={cover.url} alt={name} loading="lazy" />
    {:else}
      <div class="influencer-photo influencer-photo-empty"><UserRound size={28} strokeWidth={1.5} /></div>
    {/if}

    <div class="influencer-info">
      <p class="influencer-name">{name}</p>
      <p class="influencer-views">{views.length} {views.length === 1 ? 'view' : 'views'}</p>
    </div>
  </div>
</div>

<style>
  .influencer {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--paper, #fff);
    border: 1px solid var(--line, #e5e5e5);
    box-shadow:
      0 1px 2px rgb(0 0 0 / 0.05),
      0 8px 24px -12px rgb(0 0 0 / 0.2);
    overflow: hidden;
    transition: box-shadow 140ms ease;
  }
  .influencer:hover {
    box-shadow:
      0 1px 2px rgb(0 0 0 / 0.06),
      0 12px 32px -14px rgb(0 0 0 / 0.26);
  }
  @media (prefers-reduced-motion: reduce) {
    .influencer {
      transition: none;
    }
  }

  .influencer-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .influencer-photo {
    flex: 1;
    min-height: 0;
    width: 100%;
    object-fit: cover;
    background: var(--paper-2, #f9f9f9);
  }
  .influencer-photo-empty {
    display: grid;
    place-content: center;
    color: var(--ink-soft, #6e6e73);
  }

  .influencer-info {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 10px;
    border-top: 1px solid var(--line, #e5e5e5);
  }
  .influencer-name {
    margin: 0;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--ink, #1d1d1f);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .influencer-views {
    margin: 0;
    font-size: 11px;
    color: var(--ink-soft, #6e6e73);
  }
</style>
