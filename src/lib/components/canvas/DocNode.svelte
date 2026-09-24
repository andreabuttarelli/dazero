<script lang="ts">
  /**
   * IL DOCUMENTO, disegnato.
   *
   * Come la pagina incorporata, nasce pieno e non produce: la fascia in alto porta come si legge
   * e il link pubblico, sotto c'è il markdown — reso in lettura, grezzo in scrittura.
   *
   * IL TOKEN DEL LINK SI MOSTRA UNA VOLTA. Solo l'impronta resta sul database, quindi dopo un
   * ricarico il vecchio indirizzo non è più recuperabile: si conia uno nuovo (che revoca quello
   * di prima) o si chiude il link. Un URL che si può rileggere dal server sarebbe un token
   * conservato, e il patto è che non lo sia.
   */
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import Link from '@lucide/svelte/icons/link';
  import LinkOff from '@lucide/svelte/icons/unlink';
  import { ADDABLE_LABEL } from '$lib/canvas/addable';
  import { ADDABLE_ICON } from '$lib/canvas/addable-icons';
  import type { DocNode, DocMode } from '$lib/canvas/doc-node';
  import '$lib/styles/doc-prose.css';

  const DocIcon = ADDABLE_ICON.doc;

  let {
    node,
    onchange,
    onshare
  }: {
    node: DocNode;
    onchange?: (patch: Partial<DocNode>) => void;
    /** Conia o revoca il link pubblico. Torna l'URL mostrato una volta sola. */
    onshare?: (on: boolean) => Promise<{ url: string } | null>;
  } = $props();

  let mode = $state<DocMode>('view');
  let shareUrl = $state<string | null>(null);
  let shareNote = $state<string | null>(null);

  const renderer = import('$lib/canvas/doc-render');

  function commit(text: string) {
    if (text === node.content) {
      return;
    }
    onchange?.({ content: text });
  }

  async function toggleShare() {
    shareNote = null;
    const on = !node.public;
    const result = await onshare?.(on);
    if (!result) {
      shareNote = 'Link non aggiornato';
      return;
    }

    if (!on) {
      shareUrl = null;
      shareNote = 'Link revocato';
      return;
    }

    shareUrl = result.url;
  }

  async function renewShare() {
    shareNote = null;
    const result = await onshare?.(true);
    if (!result?.url) {
      shareNote = 'Link non aggiornato';
      return;
    }

    shareUrl = result.url;
  }

  async function copyShare() {
    if (!shareUrl) {
      return;
    }
    await navigator.clipboard.writeText(shareUrl);
    shareNote = 'Copiato';
  }
</script>

<div class="doc">
  <div class="doc-tag">
    <DocIcon size={13} strokeWidth={1.8} />
    <span>{ADDABLE_LABEL.doc}</span>
  </div>

  <header class="doc-head">
    <div class="doc-modes" role="group" aria-label="Come si vede il documento">
      <button type="button" class:is-on={mode === 'view'} onclick={() => (mode = 'view')}>
        Leggi
      </button>
      <button type="button" class:is-on={mode === 'edit'} onclick={() => (mode = 'edit')}>
        Scrivi
      </button>
    </div>

    {#if node.public}
      <button type="button" class="doc-share is-on" onclick={toggleShare} title="Revoca il link">
        <LinkOff size={14} strokeWidth={1.7} />
        <span>Revoca</span>
      </button>
    {:else}
      <button type="button" class="doc-share" onclick={toggleShare} title="Crea un link pubblico">
        <Link size={14} strokeWidth={1.7} />
        <span>Link pubblico</span>
      </button>
    {/if}
  </header>

  {#if shareUrl}
    <div class="doc-link">
      <input class="doc-link-url" readonly value={shareUrl} aria-label="Link pubblico" />
      <button type="button" class="doc-link-copy" onclick={copyShare}>Copia</button>
      <a class="doc-link-open" href={shareUrl} target="_blank" rel="noopener noreferrer" aria-label="Apri il link">
        <ExternalLink size={14} strokeWidth={1.7} />
      </a>
    </div>
  {:else if node.public}
    <p class="doc-note">Il link è attivo. «Nuovo link» ne conia uno diverso e revoca questo.</p>
    <div class="doc-link-actions">
      <button type="button" class="doc-share" onclick={renewShare}>
        Nuovo link
      </button>
    </div>
  {/if}

  {#if shareNote}
    <p class="doc-note" role="status">{shareNote}</p>
  {/if}

  {#if mode === 'edit'}
    <textarea
      class="doc-write"
      aria-label="Markdown del documento"
      value={node.content}
      oninput={(e) => commit(e.currentTarget.value)}
      onblur={(e) => commit(e.currentTarget.value)}
    ></textarea>
  {:else if node.content.trim()}
    <article class="doc-read doc-prose">
      {#await renderer then { renderDocHtml }}{@html renderDocHtml(node.content)}{/await}
    </article>
  {:else}
    <p class="doc-empty">Documento vuoto. Passa a «Scrivi».</p>
  {/if}
</div>

<style>
  .doc {
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
  .doc:hover {
    box-shadow:
      0 1px 2px rgb(0 0 0 / 0.06),
      0 12px 32px -14px rgb(0 0 0 / 0.26);
  }
  @media (prefers-reduced-motion: reduce) {
    .doc {
      transition: none;
    }
  }

  .doc-tag {
    position: absolute;
    z-index: 2;
    top: 8px;
    right: 8px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px 3px 6px;
    font-size: 11px;
    color: var(--ink-soft, #6e6e73);
    background: color-mix(in srgb, var(--paper, #fff) 86%, transparent);
    border: 1px solid var(--line-2, #d2d2d7);
    backdrop-filter: blur(6px);
    pointer-events: none;
  }

  .doc-head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 9px;
    padding-right: 72px;
    border-bottom: 1px solid var(--line, #e5e5e5);
    background: var(--paper, #fff);
  }

  .doc-modes {
    display: inline-flex;
    flex: none;
    padding: 2px;
    background: var(--paper-2, #f9f9f9);
    border: 1px solid var(--line-2, #d2d2d7);
  }
  .doc-modes button {
    padding: 3px 8px;
    font: inherit;
    font-size: 11.5px;
    color: var(--ink-soft, #6e6e73);
    background: none;
    border: none;
    cursor: pointer;
  }
  .doc-modes button.is-on {
    color: var(--ink, #1d1d1f);
    background: var(--paper, #fff);
  }

  .doc-share {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-left: auto;
    padding: 3px 8px;
    font: inherit;
    font-size: 11.5px;
    color: var(--ink-soft, #6e6e73);
    background: none;
    border: 1px solid var(--line-2, #d2d2d7);
    cursor: pointer;
  }
  .doc-share:hover {
    color: var(--ink, #1d1d1f);
    background: var(--paper-2, #f9f9f9);
  }
  .doc-share.is-on {
    color: var(--ink, #1d1d1f);
  }

  .doc-link {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 9px;
    border-bottom: 1px solid var(--line, #e5e5e5);
    background: var(--paper, #fff);
  }
  .doc-link-url {
    flex: 1;
    min-width: 0;
    padding: 3px 7px;
    font-family: var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 11px;
    color: var(--ink, #1d1d1f);
    background: var(--paper-2, #f9f9f9);
    border: 1px solid var(--line-2, #d2d2d7);
  }
  .doc-link-copy {
    flex: none;
    padding: 3px 10px;
    font: inherit;
    font-size: 11.5px;
    color: var(--paper, #fff);
    background: var(--ink, #1d1d1f);
    border: none;
    cursor: pointer;
  }
  .doc-link-open {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    color: var(--ink-soft, #6e6e73);
  }
  .doc-link-open:hover {
    background: var(--paper-2, #f9f9f9);
    color: var(--ink, #1d1d1f);
  }

  .doc-link-actions {
    display: flex;
    justify-content: flex-end;
    padding: 0 9px 7px;
    background: var(--paper, #fff);
  }

  .doc-note {
    margin: 0;
    padding: 5px 9px 7px;
    font-size: 10.5px;
    line-height: 1.4;
    color: var(--ink-soft, #6e6e73);
    background: var(--paper, #fff);
    border-bottom: 1px solid var(--line, #e5e5e5);
  }

  .doc-read {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 12px 14px;
    font-size: 13px;
  }

  .doc-write {
    flex: 1;
    min-height: 0;
    width: 100%;
    resize: none;
    padding: 12px 14px;
    font-family: var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 12px;
    line-height: 1.5;
    color: var(--ink, #1d1d1f);
    background: var(--paper, #fff);
    border: none;
  }
  .doc-write:focus {
    outline: none;
  }

  .doc-empty {
    flex: 1;
    display: grid;
    place-content: center;
    margin: 0;
    padding: 0 16px;
    font-size: 12px;
    text-align: center;
    color: var(--ink-soft, #6e6e73);
  }
</style>
