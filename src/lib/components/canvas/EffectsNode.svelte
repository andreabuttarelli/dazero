<script lang="ts">
  /**
   * IL NODO `effects`: mostra il RISULTATO (`refId`) quando la pila è già stata applicata,
   * altrimenti l'immagine a monte con un'etichetta "Non applicato", altrimenti l'invito a
   * collegarne una. `imageUrl`/`sourceImageUrl` arrivano già firmati dalla pagina — la stessa
   * disciplina di `GenNode`, che non firma niente qui dentro.
   *
   * `onopeneditor` non ha ancora un bottone visibile: la fase 3 costruisce l'editor della pila, e
   * un bottone che apre il nulla è un controllo morto — CLAUDE.md lo vieta. Resta una prop pronta
   * perché la pagina non debba cambiare firma quando l'editor arriva.
   */
  import ImageIcon from '@lucide/svelte/icons/image';
  import type { EffectsNode } from '$lib/canvas/effects-node';

  let {
    node,
    imageUrl = null,
    sourceImageUrl = null,
    onopeneditor
  }: {
    node: EffectsNode;
    imageUrl?: string | null;
    sourceImageUrl?: string | null;
    onopeneditor?: () => void;
  } = $props();

  void onopeneditor;
</script>

<div class="effects">
  {#if node.refId && imageUrl}
    <img class="effects-photo" src={imageUrl} alt="Risultato" loading="lazy" />
  {:else if node.sourceRefId && sourceImageUrl}
    <div class="effects-unapplied">
      <img class="effects-photo" src={sourceImageUrl} alt="Immagine collegata" loading="lazy" />
      <span class="effects-badge">Non applicato</span>
    </div>
  {:else}
    <div class="effects-empty">
      <ImageIcon size={22} strokeWidth={1.5} />
      <p>Collega un'immagine</p>
    </div>
  {/if}
</div>

<style>
  .effects {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
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
  .effects:hover {
    box-shadow:
      0 1px 2px rgb(0 0 0 / 0.06),
      0 12px 32px -14px rgb(0 0 0 / 0.26);
  }
  @media (prefers-reduced-motion: reduce) {
    .effects {
      transition: none;
    }
  }

  .effects-photo {
    width: 100%;
    height: 100%;
    object-fit: cover;
    background: var(--paper-2, #f9f9f9);
  }

  .effects-unapplied {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .effects-badge {
    position: absolute;
    left: 8px;
    bottom: 8px;
    padding: 2px 6px;
    font-size: 10.5px;
    color: var(--paper, #fff);
    background: rgb(0 0 0 / 0.6);
  }

  .effects-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 10px;
    color: var(--ink-soft, #6e6e73);
    text-align: center;
  }
  .effects-empty p {
    margin: 0;
    font-size: 11.5px;
  }
</style>
