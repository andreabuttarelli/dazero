<script lang="ts">
  /**
   * LA BARRA CONTESTUALE DI UNA SELEZIONE — UNA SOLA, non due sovrapposte.
   *
   * Compare quando c'è almeno un nodo selezionato, ancorata SOPRA il riquadro che li contiene
   * tutti — non sotto, dove finirebbe fra i nodi stessi su una tela affollata. `box` arriva già in
   * coordinate di SCHERMO da chi monta la tela (`useSvelteFlow` sa convertire, questo componente
   * no: non vive dentro `SvelteFlow`, e leggere il suo contesto da fuori tornerebbe `null`).
   *
   * A SINISTRA LE PROPRIETÀ DEL NODO, A DESTRA I COMANDI. Erano due riquadri: l'overlay che
   * `GenNode.svelte` disegnava sul proprio bordo alto quando era l'unico selezionato, e questa
   * barra sotto per i comandi — con due o più nodi si aggiungeva un TERZO riquadro
   * (`CommonPropertiesPanel`, ora sparito) impilato sopra. Tre ancoraggi diversi per la stessa
   * selezione si spostavano l'uno rispetto all'altro a ogni zoom. Un solo ancoraggio, una sola
   * tabella (`common-properties.ts::GEN_FIELDS`) che UN nodo e PIÙ nodi leggono allo stesso modo:
   * un nodo solo è una selezione di uno, e `commonPropertiesOf` su un array di un elemento torna
   * già il suo valore com'è (`kind: 'same'`) — non serve un secondo pannello per dirlo.
   *
   * `Mixed` compare SOLO con più nodi: con uno solo `commonOf` non ha mai un secondo valore da cui
   * differire.
   *
   * LE AZIONI SONO UNA TABELLA (`selection-actions.ts`), non un bottone scritto per ognuna: un
   * bottone nuovo — "Crea post dalla selezione" — è una riga lì, non un `{#if}` qui.
   */
  import { SELECTION_ACTIONS, type SelectionActionId } from '$lib/canvas/selection-actions';
  import { SELECTION_ACTION_ICON } from '$lib/canvas/selection-action-icons';
  import { commonPropertiesOf, type CommonValue } from '$lib/canvas/common-properties';
  import { effectiveModel } from '$lib/canvas/default-models';
  import type { ModelChoice } from '$lib/canvas/gen-node';

  let {
    box,
    count,
    nodeSummaries = [],
    choicesFor,
    catalogueSynced = true,
    onaction,
    onpropertychange
  }: {
    /** Il riquadro che contiene la selezione, in coordinate di schermo. Null = niente da mostrare. */
    box: { x: number; y: number; width: number } | null;
    /** Quante tile sono scelte — solo per l'etichetta, la barra non ne ha bisogno per altro. */
    count: number;
    /** `type`/`data` dei nodi selezionati, la forma che `commonPropertiesOf` legge. */
    nodeSummaries?: { id: string; type: string; data: Record<string, unknown> }[];
    /** I modelli offribili per il tipo della selezione, dal catalogo del brand. */
    choicesFor?: (type: 'text' | 'image' | 'video') => ModelChoice[];
    /** Il catalogo del medium della selezione è già sincronizzato? Come su `GenNode`, un menù
     *  vuoto senza dirlo sembra un difetto invece della conseguenza accettata di "non
     *  sincronizzato, non offerto". */
    catalogueSynced?: boolean;
    onaction?: (id: SelectionActionId) => void;
    /** Un campo cambiato dalla barra, applicato a ogni nodo selezionato — uno o molti. */
    onpropertychange?: (patch: { model?: string | null; aspectRatio?: string; duration?: number; audio?: boolean; repeat?: number }) => void;
  } = $props();

  const properties = $derived(commonPropertiesOf(nodeSummaries));
  const choices = $derived(properties.type && choicesFor ? choicesFor(properties.type) : []);

  /**
   * IL MODELLO MOSTRATO È QUELLO RISOLTO, non il valore grezzo salvato: un nodo (o una selezione
   * intera) senza `model` scritto in `nodes.data` mostra comunque il default del medium
   * (`default-models.ts`), la stessa risoluzione che decide le porte (`connectorsForNode`) e se
   * "Genera" è acceso (`gen-history.ts`) — un menù vuoto qui li contraddirebbe.
   */
  const modelValue = $derived(
    properties.model.kind === 'same' && properties.type
      ? effectiveModel(properties.type, properties.model.value, choices)
      : null
  );
  const choice = $derived(modelValue ? choices.find((c) => c.id === modelValue) : null);

  function valueOr<T>(v: CommonValue<T>, fallback: T | null): T | null {
    return v.kind === 'same' ? v.value : fallback;
  }
</script>

{#if box}
  <div class="toolbar" style={`left:${box.x + box.width / 2}px; top:${box.y}px`} role="toolbar" aria-label="Azioni sulla selezione">
    {#if properties.type}
      <div class="props" role="group" aria-label="Proprietà del nodo">
        {#if !choices.length && !catalogueSynced}
          <span class="field warn">Catalogo non sincronizzato</span>
        {:else}
          <select
            class="field"
            value={modelValue ?? ''}
            onchange={(e) => onpropertychange?.({ model: e.currentTarget.value || null })}
            aria-label="Modello"
          >
            {#if properties.model.kind === 'mixed'}
              <option value="" disabled selected>Mixed</option>
            {:else if !modelValue}
              <option value="">Modello…</option>
            {/if}
            {#each choices as c (c.id)}
              <option value={c.id}>{c.label}</option>
            {/each}
          </select>
        {/if}

        {#if properties.aspectRatio.kind !== 'absent' && choice?.aspectRatios?.length}
          <select
            class="field"
            value={valueOr(properties.aspectRatio, null) ?? ''}
            onchange={(e) => onpropertychange?.({ aspectRatio: e.currentTarget.value })}
            aria-label="Formato"
          >
            {#if properties.aspectRatio.kind === 'mixed'}
              <option value="" disabled selected>Mixed</option>
            {/if}
            {#each choice.aspectRatios as ratio (ratio)}
              <option value={ratio}>{ratio}</option>
            {/each}
          </select>
        {/if}

        {#if properties.duration.kind !== 'absent' && typeof choice?.maxDuration === 'number' && choice.maxDuration > 0}
          <label class="duration">
            <input
              type="number"
              class="field number"
              min={choice.minDuration ?? 1}
              max={choice.maxDuration}
              placeholder={properties.duration.kind === 'mixed' ? 'Mixed' : undefined}
              value={valueOr(properties.duration, choice.minDuration ?? 1) ?? ''}
              oninput={(e) => onpropertychange?.({ duration: Number(e.currentTarget.value) })}
              aria-label="Durata in secondi"
            />
            <span class="unit">s</span>
          </label>
        {/if}

        {#if properties.audio.kind !== 'absent' && choice?.generateAudio !== undefined}
          <label class="toggle">
            <input
              type="checkbox"
              checked={valueOr(properties.audio, choice.generateAudio) ?? false}
              indeterminate={properties.audio.kind === 'mixed'}
              onchange={(e) => onpropertychange?.({ audio: e.currentTarget.checked })}
            />
            audio
          </label>
        {/if}
      </div>
      <span class="sep"></span>
    {/if}

    <span class="count">{count}</span>
    {#each SELECTION_ACTIONS as action (action.id)}
      {@const Icon = SELECTION_ACTION_ICON[action.id]}
      <button
        type="button"
        title={action.label}
        aria-label={action.label}
        onclick={() => onaction?.(action.id)}
      >
        <Icon size={15} strokeWidth={1.7} />
      </button>
    {/each}
  </div>
{/if}

<style>
  .toolbar {
    position: fixed;
    z-index: 15;
    display: flex;
    align-items: center;
    gap: 2px;
    transform: translate(-50%, calc(-100% - 10px));
    padding: 4px;
    border-radius: 0;
    background: var(--paper, #fff);
    border: 1px solid var(--line-2, #d2d2d7);
    box-shadow: 0 4px 18px rgb(0 0 0 / 0.1);
  }

  .props {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 6px;
  }

  .sep {
    align-self: stretch;
    width: 1px;
    margin: 0 2px;
    background: var(--line, #e5e5e5);
  }

  .field {
    max-width: 130px;
    padding: 3px 6px;
    font: inherit;
    font-size: 11.5px;
    color: var(--ink, #1d1d1f);
    background: var(--paper-2, #f9f9f9);
    border: 1px solid var(--line-2, #d2d2d7);
    border-radius: 0;
  }
  .field.warn {
    color: #c0392b;
    background: transparent;
    border-style: dashed;
  }
  .field.number {
    width: 52px;
  }

  .duration,
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11.5px;
    color: var(--ink-soft, #6e6e73);
    white-space: nowrap;
  }

  .count {
    padding: 0 6px;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: var(--ink-soft, #6e6e73);
    border-right: 1px solid var(--line, #e5e5e5);
  }

  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 6px;
    font: inherit;
    color: var(--ink, #1d1d1f);
    background: none;
    border: none;
    border-radius: 0;
    cursor: pointer;
  }
  button:hover,
  button:focus-visible {
    background: var(--paper-2, #f9f9f9);
  }
</style>
