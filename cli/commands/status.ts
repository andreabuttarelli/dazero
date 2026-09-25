import { loadSession } from '../lib/auth.ts';
import { api } from '../lib/api.ts';
import { section, c } from '../lib/display.ts';

export async function cmdStatus(slug: string) {
  const session = await loadSession();
  if (!session) { console.error('Sessione scaduta o non trovata. Esegui: feega login'); process.exit(1); }

  const detail = await api.getBrand(session.access_token, slug);
  const brand = detail.brand;

  section(`${brand.name}  (${brand.slug})`);
  console.log(`  In approvazione: ${c.yellow(String(detail.pendingCount))}`);

  section('Quota');
  console.log(`  Prodotti: ${detail.productCount}   Account: ${detail.accountCount}`);
  console.log();
}
