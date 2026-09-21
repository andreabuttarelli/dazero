<script lang="ts">
  /**
   * IL NODO CHE PRODUCE, disegnato.
   *
   * Tre fasce, e l'ordine non è estetico: sopra COME si fa (modello e parametri), in mezzo quel
   * che è VENUTO FUORI, sotto COSA si chiede. Il prompt sta in fondo perché è la riga che si
   * riscrive dieci volte guardando il risultato che le sta sopra — al contrario, ogni modifica
   * spingerebbe il risultato fuori dallo sguardo.
   *
   * LE PROPRIETÀ COMPAIONO SUL NODO SELEZIONATO, e stanno FUORI dal suo corpo.
   *
   * Erano una fascia fissa dentro ogni nodo, e la ragione scritta qui era che nascondere modello e
   * formato costringe ad aprirli per sapere con cosa una cosa è stata fatta. Vero per un nodo; su
   * una tela con dieci sono dieci file di menù addosso a quel che si sta guardando, e il contenuto
   * — l'immagine, la clip — resta schiacciato sotto. Vince il contenuto: i controlli servono a chi
   * sta lavorando su QUEL nodo, e chi ci sta lavorando l'ha selezionato.
   *
   * Fuori dal corpo e non dentro: dentro, aprirli cambierebbe la misura del nodo, e tutto quel che
   * c'è sotto salterebbe a ogni selezione.
   *
   * I LIMITI SONO QUELLI DEL MODELLO, letti dal catalogo: i formati sono quelli che serve, la
   * durata sta fra il suo minimo e il suo massimo, e il prompt troppo lungo si dice PRIMA invece
   * di tornare come un rifiuto pagato.
   */
  import { runStateOf, promptTooLong, type GenNode, type ModelChoice } from '$lib/canvas/gen-node';

  let {
    node,
    choices = [],
    selected = false,
    onchange,
    onrun,
    result
  }: {
    node: GenNode;
    /** I modelli che questo medium può usare, dal catalogo del brand. */
    choices?: ModelChoice[];
    /** Le proprietà si aprono solo sul nodo scelto: dieci fasce addosso al contenuto lo coprono. */
    selected?: boolean;
    onchange?: (patch: Partial<GenNode>) => void;
    onrun?: () => void;
    /** Come si disegna quel che è uscito. Il nodo non sa da dove venga l'URL firmato. */
    result?: import('svelte').Snippet<[{ refId: string }]>;
  } = $props();

  const choice = $derived(choices.find((c) => c.id === node.model) ?? choices[0]);
  const state = $derived(runStateOf(node));
  const tooLong = $derived(!!choice && promptTooLong(node.prompt, choice));
  const canRun = $derived((state === 'ready' || state === 'done') && !tooLong && !!node.model);

  const LABEL: Record<string, string> = {
    empty: 'Scrivi cosa vuoi',
    ready: 'Pronto',
    running: 'Sta lavorando…',
    done: 'Fatto'
  };

  function patchParams(patch: Record<string, unknown>) {
    onchange?.({ params: { ...node.params, ...patch } });
  }
</script>

<div class="gen" class:is-running={state === 'running'}>
  {#if selected}
  <header class="gen-head">
    <span class="gen-medium">{node.medium}</span>

    <select
      class="gen-field"
      value={node.model ?? ''}
      onchange={(e) => onchange?.({ model: e.currentTarget.value || null })}
      aria-label="Modello"
    >
      {#if !node.model}
        <option value="">Modello…</option>
      {/if}
      {#each choices as c (c.id)}
        <option value={c.id}>{c.label}</option>
      {/each}
    </select>

    {#if choice?.aspectRatios?.length}
      <select
        class="gen-field"
        value={node.params.aspectRatio ?? ''}
        onchange={(e) => patchParams({ aspectRatio: e.currentTarget.value })}
        aria-label="Formato"
      >
        {#each choice.aspectRatios as ratio (ratio)}
          <option value={ratio}>{ratio}</option>
        {/each}
      </select>
    {/if}

    {#if typeof choice?.maxDuration === 'number' && choice.maxDuration > 0}
      <label class="gen-duration">
        <input
          type="number"
          class="gen-field gen-number"
          min={choice.minDuration ?? 1}
          max={choice.maxDuration}
          value={node.params.duration ?? choice.minDuration ?? 1}
          oninput={(e) => patchParams({ duration: Number(e.currentTarget.value) })}
          aria-label="Durata in secondi"
        />
        <span class="gen-unit">s</span>
      </label>
    {/if}

    {#if choice?.generateAudio !== undefined}
      <label class="gen-toggle">
        <input
          type="checkbox"
          checked={node.params.audio ?? choice.generateAudio}
          onchange={(e) => patchParams({ audio: e.currentTarget.checked })}
        />
        audio
      </label>
    {/if}
  </header>
  {/if}

  <!-- Il risultato, quando c'è. Il testo lo mostra qui perché è esso stesso il prodotto; immagine
       e video li disegna chi usa il nodo, che sa da dove viene l'URL firmato. -->
  <div class="gen-body">
    {#if state === 'running'}
      <span class="gen-dots" aria-label={LABEL.running}><i></i><i></i><i></i></span>
    {:else if node.refId && result}
      {@render result({ refId: node.refId })}
    {:else}
      <p class="gen-hint">{LABEL[state]}</p>
    {/if}
  </div>

  <footer class="gen-foot">
    <textarea
      class="gen-prompt"
      rows="2"
      placeholder={node.medium === 'text' ? 'Di cosa deve parlare…' : 'Descrivi cosa vuoi vedere…'}
      value={node.prompt}
      oninput={(e) => onchange?.({ prompt: e.currentTarget.value })}
    ></textarea>

    <div class="gen-actions">
      {#if tooLong && choice?.maxPromptChars}
        <span class="gen-warn">{node.prompt.length}/{choice.maxPromptChars}</span>
      {/if}
      <button type="button" onclick={() => onrun?.()} disabled={!canRun}>
        {state === 'done' ? 'Rifai' : 'Genera'}
      </button>
    </div>
  </footer>
</div>

<style>
  .gen {
    /* Il riferimento per l'overlay, che gli sta sopra e fuori. */
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    border-radius: 14px;
    background: var(--paper-2, #f9f9f9);
    border: 1px solid var(--line-2, #d2d2d7);
  }

  .gen.is-running {
    border-color: var(--accent, #c485fe);
  }

  /* Galleggia SOPRA il nodo, ancorata al suo bordo alto: dentro il corpo cambierebbe la misura
     del nodo a ogni selezione, e quel che sta sotto salterebbe. `max-content` perché i controlli
     sono pochi e diversi per medium — una barra larga quanto il nodo sarebbe mezza vuota su un
     nodo di testo. */
  .gen-head {
    position: absolute;
    z-index: 3;
    bottom: calc(100% + 8px);
    left: 0;
    width: max-content;
    max-width: 148%;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    padding: 6px 8px;
    border: 1px solid var(--line-2, #d2d2d7);
    border-radius: 11px;
    background: var(--paper, #fff);
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.12);
  }
  .gen-medium {
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ink-soft, #6e6e73);
  }
  .gen-field {
    max-width: 130px;
    padding: 3px 6px;
    font: inherit;
    font-size: 11.5px;
    color: var(--ink, #1d1d1f);
    background: var(--paper-2, #f9f9f9);
    border: 1px solid var(--line-2, #d2d2d7);
    border-radius: 7px;
  }
  .gen-number {
    width: 52px;
  }
  .gen-duration,
  .gen-toggle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11.5px;
    color: var(--ink-soft, #6e6e73);
  }

  /* Il taglio vale per il CONTENUTO, non per il nodo: `overflow: hidden` sul nodo intero
     mangerebbe la fascia delle proprietà, che sporge apposta. */
  .gen-body {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px;
    overflow: hidden;
    border-radius: 13px 13px 0 0;
  }
  .gen-hint {
    margin: 0;
    font-size: 12px;
    color: var(--ink-soft, #6e6e73);
  }

  .gen-foot {
    border-radius: 0 0 13px 13px;
    padding: 8px 9px 9px;
    border-top: 1px solid var(--line-2, #d2d2d7);
    background: var(--paper, #fff);
  }
  .gen-prompt {
    width: 100%;
    resize: none;
    border: 1px solid var(--line-2, #d2d2d7);
    border-radius: 9px;
    padding: 6px 8px;
    font: inherit;
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--ink, #1d1d1f);
    background: var(--paper-2, #f9f9f9);
  }
  .gen-prompt:focus {
    outline: none;
    border-color: var(--accent, #c485fe);
  }

  .gen-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 6px;
  }
  .gen-warn {
    font-size: 11px;
    color: #c0392b;
  }
  button {
    padding: 4px 12px;
    font: inherit;
    font-size: 12px;
    border: none;
    border-radius: 8px;
    background: var(--ink, #1d1d1f);
    color: var(--paper, #fff);
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .gen-dots {
    display: inline-flex;
    gap: 4px;
  }
  .gen-dots i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ink-soft, #6e6e73);
    animation: gen-blink 1.2s infinite;
  }
  .gen-dots i:nth-child(2) {
    animation-delay: 0.2s;
  }
  .gen-dots i:nth-child(3) {
    animation-delay: 0.4s;
  }
  @keyframes gen-blink {
    0%, 60%, 100% { opacity: 0.25; }
    30% { opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .gen-dots i { animation: none; opacity: 0.5; }
  }
</style>
