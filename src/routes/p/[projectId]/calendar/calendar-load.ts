import type { Db } from '$lib/server/db/client';
import type { SocialPublisher } from '$lib/server/publishing/port';
import type { Brand } from '$lib/server/repos/brands';
import type { SocialAccount } from '$lib/server/repos/social-accounts';
import type { Post } from '$lib/server/repos/posts';
import type { AccountDeliveryStatus } from '$lib/server/repos/post-delivery';

/**
 * IL CALENDARIO LEGGE ZERNIO DAL VIVO — non una copia. Ogni post porta le sue `deliveries`,
 * chieste a Zernio una per una tramite `posts.zernio_post_ids` (decisione utente, 2026-09-22): se
 * Zernio non risponde, la pagina lo dice invece di mostrare una settimana vuota o vecchia (vedi
 * `+page.server.ts`, che intercetta l'errore).
 */
export type CalendarPost = Post & { deliveries: AccountDeliveryStatus[] };

export type CalendarData = {
  brand: Brand | null;
  brands: Brand[];
  accounts: SocialAccount[];
  posts: CalendarPost[];
};

type CalendarRepos = {
  listOrgBrands: (db: Db, orgId: string) => Promise<Brand[]>;
  listBrandAccounts: (db: Db, input: { orgId: string; brandId: string }) => Promise<SocialAccount[]>;
  listPosts: (db: Db, scope: { orgId: string; brandId: string }) => Promise<Post[]>;
  deliveryStatus: (
    db: Db,
    publisher: SocialPublisher,
    input: { orgId: string; postId: string }
  ) => Promise<AccountDeliveryStatus[]>;
};

/**
 * Senza brand, il progetto non ha un calendario — solo la scelta fra i brand dell'org (o crearne
 * uno, in Settings → Brand). `brandId` arriva già risolto da `+page.server.ts`, che sa come farlo
 * senza incappare nelle colonne del vecchio schema (`brand-shell.ts`).
 */
export async function buildCalendarData(
  repos: CalendarRepos,
  input: { orgId: string; brandId: string | null; db: Db; publisher: SocialPublisher }
): Promise<CalendarData> {
  if (!input.brandId) {
    const brands = await repos.listOrgBrands(input.db, input.orgId);
    return { brand: null, brands, accounts: [], posts: [] };
  }

  const [brands, accounts, posts] = await Promise.all([
    repos.listOrgBrands(input.db, input.orgId),
    repos.listBrandAccounts(input.db, { orgId: input.orgId, brandId: input.brandId }),
    repos.listPosts(input.db, { orgId: input.orgId, brandId: input.brandId })
  ]);

  const brand = brands.find((b) => b.id === input.brandId) ?? null;

  const withDeliveries = await Promise.all(
    posts.map(async (post) => ({
      ...post,
      deliveries: await repos.deliveryStatus(input.db, input.publisher, { orgId: input.orgId, postId: post.id })
    }))
  );

  return { brand, brands, accounts, posts: withDeliveries };
}
