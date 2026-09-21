import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authenticate, loadBrandForUser, checkApiKeyWriteAccess } from '$lib/server/cli-auth';
import { createAdminClient } from '$lib/server/supabase-admin';
import { coverStoragePath } from '$lib/server/article-cover';
import { swallow } from '$lib/server/swallow';

// DELETE — remove the article. Costs nothing: write scope is enough.
export const DELETE: RequestHandler = async ({ request, params }) => {
  const { supabase, apiKey, error } = await authenticate(request);
  if (error) return error;
  const { brand, error: brandError } = await loadBrandForUser(supabase, params.slug, apiKey);
  if (brandError) return brandError;
  const writeDenied = checkApiKeyWriteAccess(apiKey);
  if (writeDenied) return writeDenied;

  const admin = createAdminClient();

  // La copertina si legge ORA: dopo la DELETE la riga che la nominava non c'è più, e con lei
  // l'unico modo di sapere quale file teneva in vita.
  const { data: article } = await admin
    .from('brand_articles')
    .select('cover_image')
    .eq('id', params.id)
    .eq('brand_id', brand.id)
    .maybeSingle();

  // brand_articles is SELECT-only under RLS — deletes go through the admin client.
  const { error: deleteError } = await admin
    .from('brand_articles')
    .delete()
    .eq('id', params.id)
    .eq('brand_id', brand.id);
  if (deleteError) return json({ error: deleteError.message }, { status: 500 });

  // E il file si toglie DOPO. Il verso opposto lascerebbe, se la DELETE fallisse, un articolo vivo
  // con la copertina rotta — che l'utente vede, mentre un file orfano no.
  const cover = coverStoragePath(article?.cover_image);
  if (cover) {
    // Lo stesso URL può essere la copertina di un altro articolo, o stare dentro il `body_md` di
    // uno pubblicato: il bucket `media` è pubblico e i suoi URL si copiano e si incollano. Toglierlo
    // senza guardare romperebbe una pagina viva, che è il danno che questo giro evita.
    // Due letture invece di una `.or()`: un URL contiene punti e virgole, che sono la sintassi di
    // un filtro PostgREST, e interpolarcelo dentro significa un filtro che dice altro.
    const stillCover = await admin
      .from('brand_articles')
      .select('id', { count: 'exact', head: true })
      .eq('cover_image', String(article?.cover_image ?? ''));
    const inBody = await admin
      .from('brand_articles')
      .select('id', { count: 'exact', head: true })
      .like('body_md', `%${cover}%`);

    if (!stillCover.count && !inBody.count) {
      try {
        await admin.storage.from('media').remove([cover]);
      } catch (error) {
        swallow('remove article cover', error);
      }
    }
  }

  return json({ ok: true });
};
