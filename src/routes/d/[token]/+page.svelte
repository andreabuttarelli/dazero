<script lang="ts">
  import { renderDocHtml } from '$lib/canvas/doc-node';
  import '$lib/styles/doc-prose.css';

  let { data } = $props();

  const html = $derived(renderDocHtml(data.content));
</script>

<svelte:head><title>Documento</title></svelte:head>

<main class="sheet">
  <article class="body doc-prose">{@html html}</article>
</main>

<style>
  .sheet {
    min-height: 100vh;
    padding: 48px 20px 80px;
    background: var(--paper, #fff);
  }

  .body {
    max-width: 42rem;
    margin: 0 auto;
    font-size: 15px;
  }
</style>
