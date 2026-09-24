/**
 * IL DOCUMENTO: un markdown nato pieno, come la pagina incorporata non genera nulla.
 *
 * `doc` porta un testo scritto. Non ha modello, né prompt, né parametri: è il rovescio del nodo
 * che produce, lo stesso patto di `iframe-node.ts` per una pagina che esiste già.
 *
 * IL LINK PUBBLICO HA UN TOKEN, MAI L'ID. Un id indovinabile è un link «segreto» mai scaduto.
 * Solo l'impronta SHA-256 va sul database — il token in chiaro si mostra una volta sola e non si
 * conserva da nessuna parte. Revocato (impronta tolta), scaduto e mai esistito sono la STESSA
 * risposta: tre risposte diverse direbbero a chi prova quale caso ha trovato.
 */

export type DocNode = {
  id: string;
  content: string;
  public: boolean;
};

/** Due modi di stare sul documento: leggere il markdown reso, o scriverlo grezzo. */
export const DOC_MODES = ['view', 'edit'] as const;

export type DocMode = (typeof DOC_MODES)[number];

const DOC_NODE_SIZE = { w: 480, h: 380 };
const TOKEN_BYTES = 32;

export function docNodeSize(): { w: number; h: number } {
  return { ...DOC_NODE_SIZE };
}

export type NewDocTile = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  content: string;
  public: false;
  connectable: true;
};

export function newDocNodeAt(at: { x: number; y: number }): NewDocTile {
  const { w, h } = docNodeSize();

  return {
    id: crypto.randomUUID(),
    x: at.x - w / 2,
    y: at.y - h / 2,
    w,
    h,
    content: '',
    public: false,
    connectable: true
  };
}

export type DocShareRow = {
  content: string;
  public_token_hash: string | null;
  public_expires_at: string | null;
};

/** L'unico posto dove un link smette di valere. Tre motivi, una risposta sola: `null`. */
export function docShareLive(row: DocShareRow | null, now: Date): DocShareRow | null {
  if (!row) return null;
  if (!row.public_token_hash) return null;
  if (row.public_expires_at && Date.parse(row.public_expires_at) <= now.getTime()) return null;
  return row;
}

function base64url(bytes: Uint8Array): string {
  let raw = '';
  for (const byte of bytes) {
    raw += String.fromCharCode(byte);
  }
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Hash e conio via Web Crypto: questo file vive anche sul client (la tile legge `docNodeSize`),
 * e `node:crypto` lì non si può importare. Stessa forma di `shared-views.ts`.
 */
export async function hashShareToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function mintShareToken(): Promise<{ token: string; token_hash: string }> {
  const token = base64url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
  return { token, token_hash: await hashShareToken(token) };
}

/**
 * L'URL monouso che si mostra una volta. Senza `path` il server non ha coniato il token: tornare
 * un indirizzo vuoto fa credere che il link esista e brucia l'unica lettura del token.
 */
export function shareUrlOf(origin: string, path: string | null | undefined): string | null {
  if (!path) {
    return null;
  }
  return `${origin}${path}`;
}
