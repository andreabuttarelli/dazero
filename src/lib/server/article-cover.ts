/**
 * LA COPERTINA DI UN ARTICOLO, e come si risale al file che l'URL nasconde.
 *
 * `brand_articles.cover_image` tiene un URL PUBBLICO, non un path — è l'eccezione che ha tenuto
 * questa tabella fuori dal registro di `storage-refs.ts`, dove tutte le regole parlano di chiavi
 * nude. Cancellare un articolo lasciava quindi la sua copertina nel bucket per sempre.
 *
 * Perché l'estrazione sta qui e non è una `form: 'url'` nel registro: da un URL si ricava un path
 * solo indovinando il prefisso del progetto, e un prefisso sbagliato produce una chiave PLAUSIBILE
 * che punta a un altro file. In un registro quella forma la erediterebbero tutte le colonne che
 * tengono un URL — comprese `posts.media_url` e le immagini dentro `brand_articles.body_md`, che
 * vivono nello STESSO bucket `media` e che un raccoglitore cieco cancellerebbe da sotto un articolo
 * pubblicato. Qui l'indovinello è ristretto a una colonna sola, di cui si conoscono tutti i valori:
 * in produzione 122 copertine su 122 hanno questa forma esatta e nessun'altra.
 *
 * Un URL che non è del nostro Storage torna `null` e il file non si tocca: una copertina presa da
 * Unsplash è di qualcun altro.
 */

const PUBLIC_MEDIA = '/storage/v1/object/public/media/';

/** Solo i nostri: un dominio qualunque che imiti il percorso non è il nostro bucket. */
const SUPABASE_HOST = /\.supabase\.(co|in)$/;

export function coverStoragePath(coverImage: string | null | undefined): string | null {
  if (typeof coverImage !== 'string' || !coverImage) return null;

  let url: URL;
  try {
    url = new URL(coverImage);
  } catch {
    return null;
  }

  if (!SUPABASE_HOST.test(url.hostname)) return null;
  if (!url.pathname.startsWith(PUBLIC_MEDIA)) return null;

  const path = decodeURIComponent(url.pathname.slice(PUBLIC_MEDIA.length));
  return path || null;
}
