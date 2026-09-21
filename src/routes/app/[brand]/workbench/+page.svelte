<script lang="ts">
  import { _ } from 'svelte-i18n';
  import HomeHead from '$lib/components/HomeHead.svelte';
  import HomeWorkbench from '$lib/components/HomeWorkbench.svelte';
  import WorkbenchPageShimmer from '$lib/components/WorkbenchPageShimmer.svelte';
  import CanvasFlow from '$lib/components/canvas/CanvasFlow.svelte';

  let { data } = $props();

  /**
   * IL RECAP È UN NODO, non più una pagina.
   *
   * Sta a (0,0) perché `fitView` inquadra quel che c'è: da solo riempie lo schermo all'apertura, e
   * quando l'agente metterà altro sulla tela la vista si allargherà da sé senza che questa misura
   * cambi.
   *
   * Le dimensioni sono quelle della colonna che il recap aveva prima — `HomeWorkbench` è scritto
   * per una larghezza da pagina, e stringerlo dentro una tile lo spezzerebbe. Alto abbastanza da
   * non tagliare le tre sezioni: il nodo non scorre, è la TELA che si muove.
   *
   * `connectable: false` perché il recap non produce niente: riassume. Un arco che parte da qui
   * non avrebbe un significato che `canConnect` sappia dare, e i due puntini sarebbero l'invito a
   * un gesto che poi fallisce.
   */
  const RECAP = { id: 'recap', x: 0, y: 0, w: 1120, h: 1400, connectable: false };
</script>

<svelte:head><title>Anomalia — {$_('app.home.workbench.title')}</title></svelte:head>

<!-- Lo scheletro resta fuori dalla tela: dentro sarebbe un nodo che compare e sparisce, e
     `fitView` inquadrerebbe due volte — una sullo scheletro, una sul recap.

     `extras` non si passa di proposito: erano i badge differiti del layout, e qui dentro
     non ci sono. Servivano solo come sovrascrittura anticipata — `overview` porta già
     ognuno di quei numeri, quindi il recap è identico, appena meno impaziente.

     Se un giorno questo shimmer non finisce più, il sospettato NON è la promessa: è
     `HomeWorkbench` che esplode mentre si disegna. Il ramo `:then` muore a metà, `{#await}`
     resta su quello in attesa e l'errore finisce solo in console — visto una volta, con una
     variabile rimasta nel markup dopo che la sua dichiarazione era stata tolta. -->
{#await data.overview}
  <WorkbenchPageShimmer variant="workbench" />
{:then overview}
  <div class="wb-canvas">
    <CanvasFlow tiles={[RECAP]}>
      {#snippet tile()}
        <div class="wb-recap">
          <HomeHead {overview} brandSlug={data.brand.slug} />
          <HomeWorkbench
            brandSlug={data.brand.slug}
            {overview}
            launchedAt={data.brand?.launched_at ?? null}
          />
        </div>
      {/snippet}
    </CanvasFlow>
  </div>
{:catch}
  <p class="wb-failed">{$_('app.home.workbench.failed')}</p>
{/await}

<style>
  .wb-canvas {
    height: 100%;
    min-height: 0;
  }

  /* Il nodo si comporta come la pagina che conteneva: sfondo pieno e il suo respiro attorno.
     Senza, il recap galleggia sulla griglia della tela e le sue sezioni si leggono come tile.

     `--paper-2` e non `--paper`: la tela è già `--paper`, e un nodo dello stesso colore avrebbe
     solo il bordo a dirlo — un riquadro che si perde appena si allontana lo zoom. */
  .wb-recap {
    height: 100%;
    overflow: hidden;
    padding: 24px 28px;
    border-radius: 18px;
    background: var(--paper-2, #f9f9f9);
    border: 1px solid var(--line-2, #d2d2d7);
  }

  .wb-failed {
    margin: 0;
    font-size: 13.5px;
    color: var(--ink-soft);
  }

</style>
