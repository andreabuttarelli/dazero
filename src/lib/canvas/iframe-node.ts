/**
 * LA PAGINA INCORPORATA: cosa sa di sé, e sotto quali condizioni si lascia mostrare.
 *
 * È il rovescio del nodo che produce. `gen` nasce vuoto e si riempie girando; questo nasce pieno e
 * non gira mai: porta una pagina che esiste già, come una nota porta un testo già scritto. Per
 * questo non ha modello, né prompt, né parametri — non c'è niente da comprare.
 *
 * DUE MODI, E QUALE SIA LO DICE QUALE CAMPO È PIENO. Non c'è un terzo campo a dichiararlo, perché
 * un discriminatore è una verità in più che può divergere dalle altre due: `source = 'url'` con
 * l'indirizzo vuoto e l'HTML pieno è una riga coerente con se stessa e impossibile da disegnare.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * LA SANDBOX, CHE È LA DECISIONE PIÙ IMPORTANTE DI QUESTO FILE
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `allow-scripts` e `allow-same-origin` INSIEME non sono una sandbox: sono una sandbox che il
 * documento incorporato può smontare. Con tutti e due, il codice dentro l'iframe arriva a
 * `parent.frameElement`, toglie l'attributo `sandbox` e si ricarica senza — la specifica HTML lo
 * dice a chiare lettere, e MDN lo chiama «no more secure than not using the sandbox attribute at
 * all».
 *
 * QUI NON È UN RISCHIO TEORICO, ed è per il secondo modo. Un `src` verso un sito di terzi vive su
 * un'altra origine e la manovra non gli riesce; ma `srcdoc` NO — l'HTML in `srcdoc` eredita
 * l'origine del documento che lo contiene, quindi sarebbe l'origine dell'app. E quell'HTML lo
 * scrive un membro del brand, o l'agente. I brand sono CONDIVISI (le RLS passano da
 * `auth_brand_ids()`): quel che scrive uno lo apre un altro, con i propri cookie. Concedere
 * entrambi i permessi darebbe XSS depositato sul dominio dell'app, servito dalla nostra pagina.
 *
 * Quindi `allow-same-origin` non si concede MAI, e il test accanto lo tiene fermo. Il costo è
 * reale e si paga volentieri: dentro la sandbox `localStorage`, i cookie e `document.domain` non
 * funzionano, e qualche embed che li pretende non andrà. L'alternativa è la sessione di chi guarda.
 *
 * E GLI SCRIPT SI CONCEDONO, invece. Senza, un embed non è un embed — un video, una mappa, un
 * grafico sono tutti script — e la tile mostrerebbe un rettangolo bianco. Da soli, su un'origine
 * opaca, gli script non vedono né i cookie né il DOM dell'app: girano in una stanza chiusa.
 *
 * PERCHÉ L'HTML NON SI SANIFICA. Un sanificatore lato server toglierebbe proprio gli `<script>`
 * che rendono un embed un embed, e in cambio darebbe una difesa aggirabile — la storia dei bypass
 * dei sanificatori è lunga. La sandbox è una garanzia del browser, non una lista di tag: è la
 * difesa più forte E quella che non rompe il prodotto. Si tengono le due cose insieme perché qui,
 * per una volta, non sono in conflitto.
 */

/** I due modi di riempire la tile. Quale sia lo dice quale campo è pieno: vedi `sourceOf`. */
export const IFRAME_SOURCES = ['url', 'html'] as const;

export type IframeSource = (typeof IFRAME_SOURCES)[number];

export function isIframeSource(x: string): x is IframeSource {
  return (IFRAME_SOURCES as readonly string[]).includes(x);
}

/**
 * I permessi concessi alla pagina incorporata, e sono quattro su una ventina possibili.
 *
 * `allow-same-origin` è ASSENTE di proposito, e il perché sta nell'intestazione: con
 * `allow-scripts` lascerebbe al documento la strada per togliersi la sandbox da solo, e su
 * `srcdoc` quel documento è HTML scritto da chi condivide il brand.
 *
 * `allow-top-navigation` è assente per un motivo più semplice: una pagina che può cambiare
 * l'indirizzo della scheda porta altrove chi sta guardando la tela, senza un clic. Nessun embed
 * legittimo ne ha bisogno; il dirottamento sì.
 */
export const IFRAME_SANDBOX = [
  // Un embed senza script è un rettangolo bianco: video, mappe e grafici sono tutti script.
  'allow-scripts',
  // I moduli dentro l'embed devono poter essere inviati, o una form incorporata non serve.
  'allow-forms',
  // Un link si apre in una scheda NUOVA, che è l'unica navigazione che non ruba quella di chi guarda.
  'allow-popups',
  // Senza, una scheda aperta dall'embed erediterebbe la sandbox e sarebbe rotta a sua volta.
  'allow-popups-to-escape-sandbox'
].join(' ');

/**
 * Cosa il browser deve mandare al sito incorporato come mittente.
 *
 * Solo l'origine, mai il percorso: l'indirizzo completo di una pagina dell'app dice quale brand e
 * quale tela si sta guardando, e non c'è ragione di raccontarlo a un sito di terzi.
 */
export const IFRAME_REFERRER_POLICY = 'strict-origin-when-cross-origin';

export type IframeNode = {
  id: string;
  /** Su quale dei due modi è aperto il nodo. Alla lettura lo ricava `sourceOf` dai campi. */
  source: IframeSource;
  url: string;
  html: string;
};

export type UrlVerdict = { ok: true; url: string } | { ok: false; why: string };

/**
 * Gli unici due schemi che una pagina incorporata può portare.
 *
 * `javascript:` in un `src` esegue sull'origine di CHI INCORPORA — è la stessa falla della
 * sandbox, presa dall'altra parte. `data:` porta un documento arbitrario con la stessa comodità, e
 * `file:` punta al disco di chi guarda. Nessuno dei tre ha un uso legittimo qui.
 */
const EMBEDDABLE_PROTOCOLS = ['http:', 'https:'];

/**
 * L'indirizzo scritto da una persona, portato nella forma che si può incorporare — o rifiutato
 * con il motivo.
 *
 * IL MOTIVO FA PARTE DEL RISULTATO: un campo che si svuota da solo quando si incolla qualcosa non
 * si corregge, perché non si sa cosa correggere.
 *
 * Si verifica la FORMA, non la raggiungibilità: che il sito risponda, e che si lasci incorporare,
 * lo scopre il browser di chi guarda. Vedi `embedRefusalHint`.
 */
export function normalizeEmbedUrl(raw: string): UrlVerdict {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, why: 'Serve un indirizzo' };

  // Lo schema si legge PRIMA di completare: `javascript:alert(1)` senza questo passaggio
  // diventerebbe `https://javascript:alert(1)` e passerebbe il controllo travestito.
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, why: 'Non è un indirizzo valido' };
  }

  if (!EMBEDDABLE_PROTOCOLS.includes(parsed.protocol)) {
    return { ok: false, why: 'Si possono incorporare solo indirizzi http e https' };
  }
  if (!parsed.hostname) {
    return { ok: false, why: 'Manca il nome del sito' };
  }

  return { ok: true, url: parsed.toString() };
}

/**
 * Quale modo porta una riga: lo dice quale campo è pieno, che è l'unica verità che il vincolo
 * `brand_canvas_items_iframe_source` lascia esistere.
 *
 * Una riga con nessuno dei due si legge come «indirizzo da scrivere»: il database vieta di
 * SALVARLA così, ma un nodo appena nato sullo schermo lo è ancora, e deve aprirsi su un campo
 * invece di esplodere.
 */
export function sourceOf(row: { url?: string | null; html?: string | null }): IframeSource {
  return row.html ? 'html' : 'url';
}

/**
 * Quanto è grande una pagina incorporata appena nata.
 *
 * Più larga di un nodo che produce, e non è un capriccio: dentro c'è una pagina web vera, pensata
 * per una finestra. In un riquadro stretto quasi ogni sito passa al suo impaginato per telefono o
 * apre una barra di scorrimento orizzontale — si vedrebbe un angolo di pagina invece della pagina.
 */
const IFRAME_NODE_SIZE = { w: 560, h: 420 };

export function iframeNodeSize(): { w: number; h: number } {
  return { ...IFRAME_NODE_SIZE };
}

export type NewIframeTile = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  source: IframeSource;
  url: string;
  html: string;
  connectable: true;
};

/**
 * Dove nasce una pagina incorporata chiesta col doppio clic: centrata sul punto, come ogni altro
 * nodo — il punto arriva già in unità di tela.
 *
 * Nasce sul modo INDIRIZZO perché è quello che serve nove volte su dieci: incollare un link è il
 * gesto, scrivere HTML è il caso esperto.
 */
export function newIframeNodeAt(at: { x: number; y: number }): NewIframeTile {
  const { w, h } = iframeNodeSize();

  return {
    id: crypto.randomUUID(),
    x: at.x - w / 2,
    y: at.y - h / 2,
    w,
    h,
    source: 'url',
    url: '',
    html: '',
    connectable: true
  };
}

/**
 * QUANDO L'IFRAME RESTA BIANCO, E PERCHÉ NON SI PUÒ SAPERE PRIMA.
 *
 * Molti siti rifiutano di essere incorporati (`X-Frame-Options`, o `frame-ancestors` nella CSP), e
 * il rifiuto arriva DENTRO il browser di chi guarda: la pagina padre non riceve nessun errore, e
 * `onerror` non scatta. Nemmeno chiederlo dal server aiuterebbe — quelle intestazioni parlano di
 * chi incorpora, non di chi chiede, e un `fetch` nostro vedrebbe un 200 tranquillo.
 *
 * Quindi non si indovina: si dice sempre. La tile porta il link «apri in una scheda» in permanenza
 * accanto al riquadro, così un rettangolo bianco ha già la sua via d'uscita al momento in cui
 * compare, invece di essere un guasto senza spiegazione.
 */
export const EMBED_REFUSAL_HINT =
  'Alcuni siti non si lasciano incorporare: se resta vuoto, aprilo in una scheda.';
