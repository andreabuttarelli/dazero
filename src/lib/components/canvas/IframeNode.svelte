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
  import { embedBox } from '$lib/canvas/iframe-scale';
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

  /**
   * Stessa ragione per il codice, e senza questa bozza l'anteprima ripartiva a OGNI CARATTERE:
   * `srcdoc` legato al valore che si sta digitando ricarica l'iframe a ogni tasto, e incollare a
   * mano un embed di YouTube sono un centinaio di ricariche. Qui non c'è un «valido» da
   * riconoscere come per l'indirizzo — un HTML a metà è comunque disegnabile — quindi il momento
   * lo sceglie chi scrive: si esce dal campo, o si preme il bottone.
   */
  let htmlDraft = $state(node.html);

  /** L'HTML che l'anteprima mostra davvero: l'ultimo confermato, non quel che è nel campo. */
  let shownHtml = $state(node.html);

  function commitHtml() {
    if (htmlDraft === shownHtml) return;
    shownHtml = htmlDraft;
    onchange?.({ html: htmlDraft, url: '' });
  }

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

  /**
   * LA MISURA VERA DEL RIQUADRO, che è quella che decide di quanto rimpicciolire la pagina.
   *
   * Un `ResizeObserver` e non la misura che la tile dichiara: il nodo lo si ridimensiona
   * trascinandone l'angolo, e un numero letto una volta lascerebbe la pagina alla scala di
   * quando è nata — cioè il difetto di prima con un passaggio in più.
   *
   * Non si legge lo zoom della tela: SvelteFlow scala già tutto il viewport, quindi il nostro
   * fattore si compone con il suo e la pagina si rimpicciolisce insieme al nodo da sé. Il
   * ragionamento per esteso sta in `iframe-scale.ts`.
   *
   * `$effect` e non `onMount`: il riquadro esiste solo nel ramo che disegna una pagina, quindi
   * compare e sparisce passando fra indirizzo e codice — e l'observer va riagganciato ogni volta.
   * Il ritorno lo stacca, che è l'unica cosa che impedisce a un nodo cancellato di tenersi in
   * vita un ascoltatore sul proprio riquadro morto.
   */
  let body = $state<HTMLElement | null>(null);
  let measured = $state({ width: 0, height: 0 });

  /**
   * L'ultima misura vista, FUORI dallo stato reattivo — ed è la riga che chiude il ciclo.
   *
   * Il confronto serve perché `{width, height}` è un oggetto nuovo a ogni battuta anche coi due
   * numeri identici: scriverlo comunque ricalcola `frameStyle`, riscrive lo `style` dell'iframe,
   * fa rifare il layout e richiama l'observer. Ma leggere `measured` DENTRO l'effect per fare
   * quel confronto lo rende una sua dipendenza — e allora ogni scrittura stacca l'observer e ne
   * aggancia un altro, che alla prima misura riparte. Il ciclo si spostava soltanto.
   *
   * Una variabile normale non è tracciata: l'effect dipende solo da `body`, e si riaggancia
   * quando cambia il riquadro, che è l'unica ragione per cui dovrebbe.
   */
  let lastSeen = { width: 0, height: 0 };

  $effect(() => {
    const el = body;
    if (!el) return;

    const observer = new ResizeObserver(([entry]) => {
      const { inlineSize, blockSize } = entry.contentBoxSize[0];
      if (lastSeen.width === inlineSize && lastSeen.height === blockSize) return;

      lastSeen = { width: inlineSize, height: blockSize };
      measured = lastSeen;
    });

    observer.observe(el);
    return () => observer.disconnect();
  });

  const box = $derived(embedBox(measured));

  /**
   * `transform-origin: top left` è la metà che non si vede e senza cui niente funziona: di
   * default `scale` riduce attorno al CENTRO, e un elemento largo 1280 dentro un riquadro da 340
   * finirebbe ridotto ma spostato di metà della differenza — la pagina uscirebbe dal riquadro a
   * sinistra e in alto, che è esattamente il sintomo che si stava togliendo.
   */
  const frameStyle = $derived(
    `width:${box.width}px;height:${box.height}px;transform:scale(${box.scale});transform-origin:top left`
  );
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

  <!-- `loading` NON SI DICHIARA su nessuno dei due, ed è la cura di un difetto pagato: era
       `lazy`, e il caricamento differito è guidato dall'intersezione. SvelteFlow tiene ogni nodo
       dentro un viewport che trasforma e a cui riscrive `visibility` a ogni misura nuova, quindi
       il differimento si riarmava a ogni pan e a ogni zoom — la pagina ripartiva da capo per
       sempre. Un'anteprima su una tela non ha niente da differire: il nodo è lì per guardarlo. -->
  <div class="frame-body" bind:this={body}>
    {#if node.source === 'html'}
      <!--
        `srcdoc` È IL CASO PERICOLOSO, ed è quello che la sandbox rende innocuo: senza
        `allow-same-origin` l'HTML gira su un'origine opaca, dove non vede né i cookie né il DOM
        dell'app. Senza quella riga, questo sarebbe XSS depositato su un brand condiviso.
      -->
      <iframe
        title="Contenuto incorporato"
        srcdoc={shownHtml}
        sandbox={IFRAME_SANDBOX}
        referrerpolicy={IFRAME_REFERRER_POLICY}
        style={frameStyle}
      ></iframe>
    {:else if embedded}
      <iframe
        title="Pagina incorporata"
        src={embedded}
        sandbox={IFRAME_SANDBOX}
        referrerpolicy={IFRAME_REFERRER_POLICY}
        style={frameStyle}
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
        bind:value={htmlDraft}
        onblur={commitHtml}
      ></textarea>
      <div class="frame-code-actions">
        <button type="button" onclick={commitHtml} disabled={htmlDraft === shownHtml}>
          Mostra
        </button>
      </div>
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

  /* `overflow: hidden` perché l'iframe dentro è largo quanto un desktop: prima della `transform`
     — e per un fotogramma, prima che l'observer riporti la misura — sborderebbe dal nodo e
     coprirebbe la tela accanto.

     Non centra più niente con flex: la pagina è ancorata all'angolo alto a sinistra dal suo
     `transform-origin`, e un `align-items: center` sposterebbe il riquadro NON scalato di metà
     della differenza fra le due altezze, cioè fuori dal nodo. */
  .frame-body {
    flex: 1;
    min-height: 0;
    position: relative;
    overflow: hidden;
    background: var(--paper, #fff);
  }
  /* Misure e fattore arrivano inline da `frameStyle`: dipendono dalla misura vera del riquadro,
     che solo il `ResizeObserver` conosce. Qui resta quel che non cambia mai. */
  .frame-body iframe {
    display: block;
    border: none;
    /* La pagina dentro è bianca quasi sempre: su tema scuro un fondo trasparente la farebbe
       sembrare rotta a metà mentre carica. */
    background: #fff;
  }
  /* Si centra da sé perché il riquadro non lo fa più: il `flex` che lo teneva in mezzo è stato
     tolto per non spostare la pagina scalata, e senza queste righe il messaggio resterebbe
     appiccicato all'angolo alto a sinistra di un riquadro vuoto e alto. */
  .frame-code-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 6px;
  }
  .frame-code-actions button {
    padding: 4px 12px;
    font: inherit;
    font-size: 12px;
    border: none;
    background: var(--ink, #1d1d1f);
    color: var(--paper, #fff);
    cursor: pointer;
  }
  .frame-code-actions button:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .frame-hint {
    display: grid;
    place-content: center;
    height: 100%;
    margin: 0;
    padding: 0 16px;
    font-size: 12px;
    text-align: center;
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
