<script lang="ts">
  /**
   * LA PAGINA INCORPORATA, disegnata.
   *
   * Due fasce: sopra da DOVE viene il contenuto, sotto il contenuto. L'opposto del nodo che
   * produce, dove il prompt sta in fondo perché si riscrive dieci volte guardando il risultato —
   * qui l'indirizzo si scrive una volta e poi si guarda la pagina, quindi il campo sta in alto e
   * lascia tutto lo spazio a quel che conta.
   *
   * ────────────────────────────────────────────────────────────────────────────────────────────
   * LA SANDBOX, CHE È LA RAGIONE PER CUI QUESTO COMPONENTE È SCRITTO COSÌ
   * ────────────────────────────────────────────────────────────────────────────────────────────
   *
   * `IFRAME_SANDBOX` non contiene `allow-same-origin`, e non è una dimenticanza da correggere il
   * giorno in cui un embed non si vede: con `allow-scripts` insieme, il documento incorporato
   * arriva a `parent.frameElement` e si toglie la sandbox da solo. Su `srcdoc` — l'HTML scritto da
   * un membro del brand o dall'agente — quel documento erediterebbe l'origine dell'app, e i brand
   * sono CONDIVISI: sarebbe XSS depositato, con i cookie di chi apre la tela. Il ragionamento
   * completo sta in `iframe-node.ts`, accanto alla costante; un test lo tiene fermo.
   *
   * IL LINK «apri in una scheda» STA SEMPRE, non solo quando qualcosa va storto. Un sito che
   * rifiuta di essere incorporato (`X-Frame-Options`, `frame-ancestors`) lascia un rettangolo
   * bianco e NON avvisa: l'evento di errore non scatta, quindi non c'è modo di accorgersene per
   * mostrare un messaggio allora. L'unica difesa onesta è che la via d'uscita ci sia già.
   */
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import { ADDABLE_LABEL } from '$lib/canvas/addable';
  import { ADDABLE_ICON } from '$lib/canvas/addable-icons';
  import {
    EMBED_REFUSAL_HINT,
    IFRAME_REFERRER_POLICY,
    IFRAME_SANDBOX,
    normalizeEmbedUrl,
    type IframeNode,
    type IframeSource
  } from '$lib/canvas/iframe-node';

  const FrameIcon = ADDABLE_ICON.iframe;

  let {
    node,
    onchange
  }: {
    node: IframeNode;
    onchange?: (patch: Partial<IframeNode>) => void;
  } = $props();

  /**
   * Quel che si sta scrivendo resta locale finché non è valido: portare ogni battuta fino al
   * genitore vorrebbe dire ricaricare l'iframe a ogni lettera — e `htt`, `http`, `https:/` sono
   * tutti indirizzi che non esistono, chiesti alla rete uno per uno.
   */
  let draft = $state(node.url);

  // L'indirizzo che l'iframe carica davvero: l'ultimo VALIDO, non quel che c'è nel campo.
  const embedded = $derived.by(() => {
    const verdict = normalizeEmbedUrl(node.url);
    return verdict.ok ? verdict.url : null;
  });

  const refusal = $derived.by(() => {
    if (!draft.trim()) return null;
    const verdict = normalizeEmbedUrl(draft);
    return verdict.ok ? null : verdict.why;
  });

  function commitUrl() {
    const verdict = normalizeEmbedUrl(draft);
    if (!verdict.ok) return;

    draft = verdict.url;
    onchange?.({ url: verdict.url, html: '' });
  }

  function pickSource(source: IframeSource) {
    // I due modi si escludono a vicenda nel database (`brand_canvas_items_iframe_source`), quindi
    // passare all'uno svuota l'altro: tenerli entrambi pieni renderebbe la riga non salvabile, e
    // il rifiuto arriverebbe molto dopo il gesto che lo ha causato.
    onchange?.(source === 'url' ? { source, html: '' } : { source, url: '' });
  }
</script>

<div class="frame">
  <!-- La targhetta resta SEMPRE: da lontano una pagina incorporata e un'immagine sono due
       rettangoli, e con lo zoom stretto il contenuto non si legge. Nome e icona dal registro, gli
       stessi della barra in basso. -->
  <div class="frame-tag">
    <FrameIcon size={13} strokeWidth={1.8} />
    <span>{ADDABLE_LABEL.iframe}</span>
  </div>

  <header class="frame-head">
    <div class="frame-modes" role="group" aria-label="Da dove viene il contenuto">
      <button
        type="button"
        class:is-on={node.source === 'url'}
        onclick={() => pickSource('url')}
      >
        Indirizzo
      </button>
      <button
        type="button"
        class:is-on={node.source === 'html'}
        onclick={() => pickSource('html')}
      >
        Codice
      </button>
    </div>

    {#if node.source === 'url'}
      <input
        class="frame-field"
        type="url"
        inputmode="url"
        placeholder="https://…"
        aria-label="Indirizzo della pagina"
        bind:value={draft}
        onblur={commitUrl}
        onkeydown={(e) => e.key === 'Enter' && commitUrl()}
      />

      <!-- Sempre, non solo quando l'iframe resta bianco: quel caso non si può rilevare. -->
      <a
        class="frame-open"
        href={embedded ?? '#'}
        target="_blank"
        rel="noopener noreferrer"
        aria-disabled={embedded ? undefined : 'true'}
        title={embedded ? 'Apri in una scheda' : 'Scrivi prima un indirizzo'}
        aria-label="Apri in una scheda"
      >
        <ExternalLink size={15} strokeWidth={1.7} />
      </a>
    {/if}
  </header>

  <div class="frame-body">
    {#if node.source === 'html'}
      <!--
        `srcdoc` È IL CASO PERICOLOSO, ed è quello che la sandbox rende innocuo: senza
        `allow-same-origin` l'HTML gira su un'origine opaca, dove non vede né i cookie né il DOM
        dell'app. Senza quella riga, questo sarebbe XSS depositato su un brand condiviso.
      -->
      <iframe
        title="Contenuto incorporato"
        srcdoc={node.html}
        sandbox={IFRAME_SANDBOX}
        referrerpolicy={IFRAME_REFERRER_POLICY}
        loading="lazy"
      ></iframe>
    {:else if embedded}
      <iframe
        title="Pagina incorporata"
        src={embedded}
        sandbox={IFRAME_SANDBOX}
        referrerpolicy={IFRAME_REFERRER_POLICY}
        loading="lazy"
      ></iframe>
    {:else}
      <p class="frame-hint">{refusal ?? 'Incolla un indirizzo'}</p>
    {/if}
  </div>

  {#if node.source === 'html'}
    <footer class="frame-foot">
      <textarea
        class="frame-code"
        rows="3"
        spellcheck="false"
        placeholder="&lt;iframe src=…&gt; oppure dell'HTML"
        aria-label="Codice da mostrare"
        value={node.html}
        oninput={(e) => onchange?.({ html: e.currentTarget.value })}
      ></textarea>
    </footer>
  {:else if embedded}
    <p class="frame-note">{EMBED_REFUSAL_HINT}</p>
  {/if}
</div>

<style>
  /* Lo stesso guscio del nodo che produce, e la stessa ragione: su una tela un bordo da un pixel
     sparisce a zoom ridotto, e l'ombra è quel che dice dove finisce il nodo e comincia lo sfondo.
     Due nodi che galleggiano in modo diverso si leggono come due prodotti diversi. */
  .frame {
    /* Il riferimento della targhetta, che galleggia sul suo angolo. */
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    border-radius: 16px;
    background: var(--paper, #fff);
    border: 1px solid var(--line, #e5e5e5);
    box-shadow:
      0 1px 2px rgb(0 0 0 / 0.05),
      0 8px 24px -12px rgb(0 0 0 / 0.2);
    overflow: hidden;
    transition: box-shadow 140ms ease;
  }
  .frame:hover {
    box-shadow:
      0 1px 2px rgb(0 0 0 / 0.06),
      0 12px 32px -14px rgb(0 0 0 / 0.26);
  }
  @media (prefers-reduced-motion: reduce) {
    .frame {
      transition: none;
    }
  }

  /* Sull'angolo alto e fuori dal flusso: dentro toglierebbe spazio alla pagina incorporata, che
     è la cosa che si guarda. `pointer-events: none` perché è un'etichetta, non un bersaglio —
     sotto ci sono i controlli del modo, e intercettarne i clic sarebbe peggio che non averla. */
  .frame-tag {
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
    border-radius: 999px;
    backdrop-filter: blur(6px);
    pointer-events: none;
  }

  .frame-head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 9px;
    border-bottom: 1px solid var(--line, #e5e5e5);
    background: var(--paper, #fff);
  }

  .frame-modes {
    display: inline-flex;
    flex: none;
    padding: 2px;
    border-radius: 8px;
    background: var(--paper-2, #f9f9f9);
    border: 1px solid var(--line-2, #d2d2d7);
  }
  .frame-modes button {
    padding: 3px 8px;
    font: inherit;
    font-size: 11.5px;
    color: var(--ink-soft, #6e6e73);
    background: none;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }
  .frame-modes button.is-on {
    color: var(--ink, #1d1d1f);
    background: var(--paper, #fff);
  }

  .frame-field {
    flex: 1;
    min-width: 0;
    padding: 3px 7px;
    font: inherit;
    font-size: 11.5px;
    color: var(--ink, #1d1d1f);
    background: var(--paper-2, #f9f9f9);
    border: 1px solid var(--line-2, #d2d2d7);
    border-radius: 7px;
  }
  .frame-field:focus {
    outline: none;
    border-color: var(--accent, #c485fe);
  }

  .frame-open {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 7px;
    color: var(--ink-soft, #6e6e73);
  }
  .frame-open:hover {
    background: var(--paper-2, #f9f9f9);
    color: var(--ink, #1d1d1f);
  }
  .frame-open[aria-disabled='true'] {
    opacity: 0.35;
    pointer-events: none;
  }

  .frame-body {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--paper, #fff);
  }
  .frame-body iframe {
    width: 100%;
    height: 100%;
    border: none;
    /* La pagina dentro è bianca quasi sempre: su tema scuro un fondo trasparente la farebbe
       sembrare rotta a metà mentre carica. */
    background: #fff;
  }
  .frame-hint {
    margin: 0;
    font-size: 12px;
    color: var(--ink-soft, #6e6e73);
  }

  .frame-foot {
    padding: 8px 9px 9px;
    border-top: 1px solid var(--line, #e5e5e5);
    background: var(--paper, #fff);
  }
  .frame-code {
    width: 100%;
    resize: none;
    padding: 6px 8px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11.5px;
    line-height: 1.45;
    color: var(--ink, #1d1d1f);
    background: var(--paper-2, #f9f9f9);
    border: 1px solid var(--line-2, #d2d2d7);
    border-radius: 9px;
  }
  .frame-code:focus {
    outline: none;
    border-color: var(--accent, #c485fe);
  }

  .frame-note {
    margin: 0;
    padding: 5px 9px 7px;
    font-size: 10.5px;
    line-height: 1.4;
    color: var(--ink-soft, #6e6e73);
    background: var(--paper, #fff);
    border-top: 1px solid var(--line, #e5e5e5);
  }
</style>
