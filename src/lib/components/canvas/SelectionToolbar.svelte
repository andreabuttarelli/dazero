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
  import { SELECTION_ACTIONS, enabledFor, type SelectionActionId } from '$lib/canvas/selection-actions';
  import { SELECTION_ACTION_ICON } from '$lib/canvas/selection-action-icons';
  import { commonPropertiesOf, type CommonValue } from '$lib/canvas/common-properties';
  import { effectiveModel } from '$lib/canvas/default-models';
  import { TOOLBAR_HIDE_BELOW_ZOOM, toolbarScale } from '$lib/canvas/toolbar-scale';
  import { filterChoices, groupByProvider } from '$lib/canvas/model-picker';
  import type { ModelChoice } from '$lib/canvas/gen-node';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
  import * as Tooltip from '$lib/components/ui/tooltip/index.js';
  import ModalityIcons from './ModalityIcons.svelte';
  import ProviderIcon from './ProviderIcon.svelte';

  let {
    box,
    zoom = 1,
    count,
    nodeSummaries = [],
    choicesFor,
    catalogueSynced = true,
    onaction,
    onpropertychange
  }: {
    /** Il riquadro che contiene la selezione, in coordinate di schermo. Null = niente da mostrare. */
    box: { x: number; y: number; width: number } | null;
    /** Lo zoom della tela — la barra vive fuori da `SvelteFlow`, quindi non lo eredita dalla
     *  `transform` del viewport come la targhetta del nodo: deve applicarsela da sé. */
    zoom?: number;
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

  const visible = $derived(box !== null && zoom >= TOOLBAR_HIDE_BELOW_ZOOM);
  const scale = $derived(toolbarScale(zoom));

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

  let modelQuery = $state('');
  const filteredGroups = $derived(groupByProvider(filterChoices(choices, modelQuery)));

  function valueOr<T>(v: CommonValue<T>, fallback: T | null): T | null {
    return v.kind === 'same' ? v.value : fallback;
  }

  function onModelMenuOpenChange(open: boolean): void {
    if (!open) modelQuery = '';
  }

  function stopTypeahead(e: KeyboardEvent): void {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Escape') e.stopPropagation();
  }

  function focusOnMount(node: HTMLInputElement): void {
    node.focus();
  }
</script>

{#if visible && box}
  <div
    class="toolbar"
    style={`left:${box.x + box.width / 2}px; top:${box.y}px; --toolbar-scale:${scale}`}
    role="toolbar"
    aria-label="Azioni sulla selezione"
  >
    {#if properties.type}
      <div class="props" role="group" aria-label="Proprietà del nodo">
        {#if !choices.length && !catalogueSynced}
          <span class="field warn">Catalogo non sincronizzato</span>
        {:else}
          <DropdownMenu.Root onOpenChange={onModelMenuOpenChange}>
            <DropdownMenu.Trigger class="field model-trigger" aria-label="Modello">
              {#if properties.model.kind === 'mixed'}
                Mixed
              {:else if choice}
                {choice.label}
              {:else}
                Modello…
              {/if}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="start" class="model-menu">
              <input
                type="text"
                class="model-search"
                placeholder="Cerca modello o provider…"
                bind:value={modelQuery}
                onkeydown={stopTypeahead}
                use:focusOnMount
              />
              <DropdownMenu.RadioGroup
                value={modelValue ?? ''}
                onValueChange={(v) => onpropertychange?.({ model: v || null })}
              >
                {#each filteredGroups as group (group.provider)}
                  <DropdownMenu.Label class="provider-label">
                    <ProviderIcon provider={group.provider} />
                    <span>{group.providerLabel}</span>
                  </DropdownMenu.Label>
                  {#each group.choices as c (c.id)}
                    <DropdownMenu.RadioItem value={c.id}>
                      <span class="model-name">{c.label}</span>
                      <ModalityIcons inputModalities={c.inputModalities ?? []} />
                    </DropdownMenu.RadioItem>
                  {/each}
                {/each}
              </DropdownMenu.RadioGroup>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
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
    <Tooltip.Provider delayDuration={200}>
    {#each SELECTION_ACTIONS as action (action.id)}
      {@const Icon = SELECTION_ACTION_ICON[action.id]}
      {@const gate = enabledFor(action.id, nodeSummaries)}
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <button {...props} type="button" aria-label={action.label} disabled={!gate.enabled} onclick={() => onaction?.(action.id)}>
              <Icon size={15} strokeWidth={1.7} />
            </button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="top">{gate.reason ?? action.label}</Tooltip.Content>
      </Tooltip.Root>
    {/each}
    </Tooltip.Provider>
  </div>
{/if}

<style>
  .toolbar {
    position: fixed;
    z-index: 15;
    display: flex;
    align-items: center;
    gap: 2px;
    /* `box.y` arriva già sopra la targhetta del nodo (`CanvasSelectionBridge.svelte`,
       `LABEL_CLEARANCE_FLOW`): il gap qui è solo fra la barra e quel punto.
       `scale` va DOPO `translate` e con lo stesso `transform-origin` (il default, il centro
       dell'elemento, coincide col punto d'ancoraggio che `translate` già usa) perché la barra si
       rimpicciolisca SU QUEL punto — non sull'angolo in alto a sinistra, che la farebbe scivolare
       via dal nodo mentre si zooma fuori. */
    transform-origin: center bottom;
    transform: translate(-50%, calc(-100% - 10px)) scale(var(--toolbar-scale, 1));
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

  :global(.model-trigger) {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
    cursor: pointer;
  }

  :global([data-slot='dropdown-menu-radio-item']) {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 11.5px !important;
  }

  .model-name {
    flex: 1 1 auto;
  }

  :global(.model-menu) {
    max-height: 340px;
    overflow-y: auto;
  }

  .model-search {
    width: 100%;
    box-sizing: border-box;
    margin-bottom: 4px;
    padding: 5px 7px;
    font: inherit;
    font-size: 11.5px;
    color: var(--ink, #1d1d1f);
    background: var(--paper-2, #f9f9f9);
    border: 1px solid var(--line-2, #d2d2d7);
    border-radius: 0;
  }

  :global(.provider-label) {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
    font-size: 11.5px !important;
  }
  :global(.provider-label:first-child) {
    margin-top: 0;
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
