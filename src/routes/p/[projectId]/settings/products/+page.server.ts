import type { PageServerLoad } from './$types';

const PRODUCT_COLUMNS = 'id, title, price, currency, images, available, store_url, platform';

export const load: PageServerLoad = async ({ parent, locals: { supabase } }) => {
  const { brand } = await parent();
  if (!brand) {
    return { products: [] };
  }

  const { data } = await supabase
    .from('products')
    .select(PRODUCT_COLUMNS)
    .eq('brand_id', brand.id)
    .order('title', { ascending: true });

  return { products: data ?? [] };
};
