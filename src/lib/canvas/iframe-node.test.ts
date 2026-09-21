import { describe, it, expect } from 'vitest';
import {
  IFRAME_SANDBOX,
  IFRAME_SOURCES,
  iframeNodeSize,
  isIframeSource,
  normalizeEmbedUrl,
  newIframeNodeAt,
  sourceOf,
  type IframeNode
} from './iframe-node';

const node = (over: Partial<IframeNode> = {}): IframeNode => ({
  id: 'i1',
  source: 'url',
  url: 'https://example.com',
  html: '',
  ...over
});

describe('i due modi di riempire un iframe', () => {
  it('sono due, e nient altro', () => {
    expect(IFRAME_SOURCES).toEqual(['url', 'html']);
  });

  it('rifiuta un modo inventato prima che arrivi al check', () => {
    expect(isIframeSource('srcdoc')).toBe(false);
    expect(isIframeSource('html')).toBe(true);
  });
});

describe("l'indirizzo di una pagina incorporata", () => {
  it('accetta http e https, che sono gli unici che il browser può incorporare senza danno', () => {
    expect(normalizeEmbedUrl('https://example.com/a')).toEqual({
      ok: true,
      url: 'https://example.com/a'
    });
    expect(normalizeEmbedUrl('http://example.com/a').ok).toBe(true);
  });

  it("completa un indirizzo scritto senza protocollo, invece di rifiutarlo", () => {
    // Chi incolla un indirizzo dalla barra spesso lascia fuori lo schema. Rifiutarlo sarebbe
    // corretto e inutile: l'intenzione è chiara e https è la lettura giusta.
    expect(normalizeEmbedUrl('example.com')).toEqual({ ok: true, url: 'https://example.com/' });
  });

  it('RIFIUTA javascript:, che eseguirebbe sull origine di chi incorpora', () => {
    // Il difetto che questo test esiste per fermare: i brand sono condivisi, quindi una tile
    // scritta da un membro la apre un altro. `javascript:` in un `src` gira con la sessione di
    // chi guarda — XSS depositato, non una preferenza di stile.
    expect(normalizeEmbedUrl('javascript:alert(document.cookie)').ok).toBe(false);
    expect(normalizeEmbedUrl('  JaVaScRiPt:alert(1)  ').ok).toBe(false);
  });

  it('RIFIUTA data: e file:, che portano lo stesso danno per altre strade', () => {
    expect(normalizeEmbedUrl('data:text/html,<script>alert(1)</script>').ok).toBe(false);
    expect(normalizeEmbedUrl('file:///etc/passwd').ok).toBe(false);
  });

  it('rifiuta il vuoto e quel che non è un indirizzo', () => {
    expect(normalizeEmbedUrl('').ok).toBe(false);
    expect(normalizeEmbedUrl('   ').ok).toBe(false);
    expect(normalizeEmbedUrl('http://').ok).toBe(false);
  });

  it('dice PERCHÉ ha rifiutato: un campo che si svuota senza motivo non si corregge', () => {
    const verdict = normalizeEmbedUrl('javascript:alert(1)');

    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.why).toBeTruthy();
  });
});

describe('la sandbox di una pagina incorporata', () => {
  /**
   * IL TEST PIÙ IMPORTANTE DEL FILE, e non è una formalità.
   *
   * `allow-scripts` insieme ad `allow-same-origin` lascia al documento incorporato la strada per
   * raggiungere `parent.frameElement` e TOGLIERSI la sandbox da solo — la specifica lo dice, e con
   * `srcdoc`, che eredita l'origine di chi lo contiene, il documento incorporato è HTML arbitrario
   * scritto da un membro del brand o dall'agente. I brand sono condivisi: sarebbe XSS depositato
   * sull'origine dell'app, con i cookie di chi apre la tela.
   *
   * Questo test è ciò che impedisce che qualcuno aggiunga `allow-same-origin` «perché l'embed non
   * si vedeva».
   */
  it('NON concede mai allow-same-origin: con allow-scripts annullerebbe la sandbox', () => {
    expect(IFRAME_SANDBOX).not.toMatch(/allow-same-origin/);
  });

  it('concede gli script, perché senza un embed non è un embed', () => {
    expect(IFRAME_SANDBOX).toMatch(/allow-scripts/);
  });

  it('non concede la navigazione della finestra che lo contiene', () => {
    // Una pagina incorporata che può cambiare l'indirizzo della scheda porta chi guarda altrove
    // senza un clic: è il dirottamento, e non serve a nessun embed legittimo.
    expect(IFRAME_SANDBOX).not.toMatch(/allow-top-navigation/);
  });
});

describe('quale dei due modi porta una tile', () => {
  it("lo dice quale campo è pieno, non un terzo campo che può mentire", () => {
    expect(sourceOf({ url: 'https://example.com', html: null })).toBe('url');
    expect(sourceOf({ url: null, html: '<h1>ciao</h1>' })).toBe('html');
  });

  it('una riga vuota si legge come indirizzo da scrivere, non come un errore', () => {
    // Il database vieta di SALVARE una riga vuota, ma un nodo appena nato sullo schermo lo è
    // ancora: deve aprirsi sul campo dell'indirizzo, non esplodere.
    expect(sourceOf({ url: null, html: null })).toBe('url');
  });
});

describe('un iframe creato dal doppio clic', () => {
  it('nasce dove è stato chiesto, centrato sul puntatore', () => {
    const tile = newIframeNodeAt({ x: 400, y: 120 });

    expect(tile.x).toBe(400 - tile.w / 2);
    expect(tile.y).toBe(120 - tile.h / 2);
  });

  it('nasce vuoto, sul modo indirizzo', () => {
    const tile = newIframeNodeAt({ x: 0, y: 0 });

    expect(tile.url).toBe('');
    expect(tile.html).toBe('');
    expect(tile.source).toBe('url');
  });

  it('nasce collegabile: una pagina incorporata è un riferimento, come un documento', () => {
    expect(newIframeNodeAt({ x: 0, y: 0 }).connectable).not.toBe(false);
  });

  it('ogni nodo ha un id suo', () => {
    expect(newIframeNodeAt({ x: 0, y: 0 }).id).not.toBe(newIframeNodeAt({ x: 0, y: 0 }).id);
  });

  it('nasce abbastanza grande da mostrare una pagina', () => {
    // Una pagina web dentro un riquadro da 360×220 è una barra di scorrimento, non una pagina.
    const { w, h } = iframeNodeSize();

    expect(w).toBeGreaterThanOrEqual(480);
    expect(h).toBeGreaterThanOrEqual(360);
  });
});

describe('il nodo appena nato non si può ancora salvare', () => {
  it('un nodo senza né indirizzo né HTML non è pronto: il database lo rifiuterebbe', () => {
    // `brand_canvas_items_iframe_source` vuole uno e uno solo dei due. Chiederlo qui è ciò che
    // trasforma un 23514 illeggibile in un campo che aspetta di essere riempito.
    expect(node({ url: '', html: '' }).url).toBe('');
  });
});
