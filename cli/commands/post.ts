import { requireSession } from '../lib/auth.ts';
import { api, type Post, type PostPatch } from '../lib/api.ts';
import { c, ok, warn, info, fail } from '../lib/display.ts';
import { parseKeyValuePairs } from '../lib/select.ts';

type Opts = {
  action?: string;
  caption?: string; imagePrompt?: string; platforms?: string; contentType?: string;
  format?: string; slot?: string; product?: string; scheduledFor?: string;
  title?: string; link?: string; subreddit?: string; firstComment?: string;
  media?: string; platformCaption?: string[];
};

export async function cmdPost(slug: string, postId: string, opts: Opts) {
  const { access_token: t } = await requireSession();
  const action = opts.action ?? 'show';

  switch (action) {
    case 'show': return showPost(t, slug, postId);
    case 'edit': return editPost(t, slug, postId, opts);
    case 'approve': return api.approvePost(t, slug, postId).then(() => ok('Post approvato e schedulato.'));
    case 'reject': return api.deletePost(t, slug, postId).then(() => ok('Post eliminato.'));
    case 'publish': return publishNow(t, slug, postId);
    case 'reschedule': return reschedulePost(t, slug, postId, opts.scheduledFor);
    case 'render': return renderImage(t, slug, postId);
    default:
      fail(`Azione sconosciuta: ${action}`);
      printHelp();
      process.exit(1);
  }
}

function printHelp() {
  console.log(`
${c.bold('Azioni Post:')}

  ${c.green('show')}                    Dettaglio post

  ${c.green('edit')}                    Modifica i campi (nessun render, nessun credito)
    --caption "..."             Caption
    --title "..."               Titolo (Reddit, carosello, link post)
    --link "https://..."        URL del link post ("" per rimuoverlo)
    --subreddit "r/..."         Subreddit di destinazione
    --firstComment "..."        Primo commento (hashtag / CTA)
    --imagePrompt "..."         Prompt immagine
    --media "https://..."       Media URL ("" per renderlo text-only)
    --format carousel           single_image | carousel | text_post | link_post | video
    --platforms "ig,linkedin"   Piattaforme di cross-post
    --platformCaption x="..."   Caption dedicata a una piattaforma (ripetibile)
    --slot "2026-06-20T10:00"   Slot orario
    --product "Nome"            Prodotto associato

  ${c.green('render')}                  Genera l'immagine mancante dal prompt
  ${c.green('approve')}                 Approva e schedula
  ${c.green('publish')}                 Pubblica subito
  ${c.green('reject')}                  Elimina (solo pending)
  ${c.green('reschedule')}              Riprogramma  --scheduledFor "2026-06-20T10:00"
`);
}

async function findPost(t: string, slug: string, postId: string): Promise<Post> {
  const posts = await api.getPosts(t, slug);
  const found = posts.find((p) => p.id === postId || p.id.startsWith(postId));
  if (!found) { fail(`Post non trovato: ${postId}`); process.exit(1); }
  return found;
}

async function showPost(t: string, slug: string, postId: string) {
  const s = await findPost(t, slug, postId);

  console.log(`
${c.bold('Post')} ${c.dim(s.id)}

  Status:      ${s.status}
  Platform:    ${s.platform ?? '—'}${s.platforms?.length ? c.dim(` (+ ${s.platforms.join(', ')})`) : ''}
  Format:      ${s.format ?? '—'}${s.content_type ? c.dim(` / ${s.content_type}`) : ''}
  Caption:     ${s.caption ?? c.dim('—')}
  Media:       ${s.media_url ?? c.dim('— (nessuna immagine)')}`);
  if (s.image_prompt) console.log(`  Prompt:      ${c.dim(s.image_prompt.slice(0, 120))}`);
  console.log();
}

async function editPost(t: string, slug: string, postId: string, opts: Opts) {
  const patch: PostPatch = {};
  if (opts.caption !== undefined) patch.caption = opts.caption;
  if (opts.title !== undefined) patch.title = opts.title;
  if (opts.imagePrompt !== undefined) patch.image_prompt = opts.imagePrompt;
  if (opts.contentType !== undefined) patch.content_type = opts.contentType;
  if (opts.format !== undefined) patch.format = opts.format;
  if (opts.slot !== undefined) patch.slot = opts.slot;
  if (opts.product !== undefined) patch.product_name = opts.product;
  if (opts.firstComment !== undefined) patch.first_comment = opts.firstComment;
  if (opts.subreddit !== undefined) patch.subreddit = opts.subreddit;
  if (opts.platforms !== undefined) patch.platforms = opts.platforms.split(',').map((s) => s.trim()).filter(Boolean);
  // Empty string is the explicit "clear it" signal for both — null makes the post text-only.
  if (opts.link !== undefined) patch.link_url = opts.link || null;
  if (opts.media !== undefined) patch.media_url = opts.media || null;

  // --platformCaption x="testo", repeatable. No pairs → don't touch the column.
  if (opts.platformCaption?.length) {
    const overrides = parseKeyValuePairs(opts.platformCaption);
    if (!overrides) { fail('--platformCaption vuole platform=testo (es. x="testo breve")'); process.exit(1); }
    patch.platform_captions = Object.keys(overrides).length ? overrides : null;
  }

  if (Object.keys(patch).length === 0) {
    fail('Specifica almeno un campo da modificare');
    printHelp();
    process.exit(1);
  }

  await api.updatePost(t, slug, postId, patch);
  ok(`Post aggiornato (${Object.keys(patch).join(', ')}).`);
}

async function publishNow(t: string, slug: string, postId: string) {
  info('Pubblicazione in corso…');
  await api.publishPost(t, slug, postId);
  ok('Post pubblicato.');
}

async function reschedulePost(t: string, slug: string, postId: string, scheduledFor?: string) {
  if (!scheduledFor) { fail('--scheduledFor è obbligatorio (formato: 2026-06-20T10:00)'); process.exit(1); }
  await api.reschedulePost(t, slug, postId, scheduledFor);
  ok(`Post riprogrammato per ${scheduledFor}.`);
}

async function renderImage(t: string, slug: string, postId: string) {
  info('Generazione immagine in corso…');
  const result = await api.renderPost(t, slug, postId);
  if (result.url) ok(`Immagine generata: ${result.url}`);
  else if (result.error) warn(`Immagine non generata: ${result.error}`);
  else warn('Immagine non generata (potrebbe essere un post text-only).');
}
