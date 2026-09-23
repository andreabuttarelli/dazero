import { loadSession } from '../lib/auth.ts';
import { api } from '../lib/api.ts';
import { section, c } from '../lib/display.ts';

export async function cmdDashboard(slug: string) {
  const session = await loadSession();
  if (!session) { console.error('Sessione scaduta o non trovata. Esegui: dazero login'); process.exit(1); }

  const detail = await api.getBrand(session.access_token, slug);
  const brand = detail.brand;

  section(`${brand.name}  (${brand.slug})`);

  console.log(`  Prodotti:        ${c.bold(String(detail.productCount))}   Account: ${c.bold(String(detail.accountCount))}   In approvazione: ${detail.pendingCount > 0 ? c.yellow(String(detail.pendingCount)) : c.dim('0')}`);
  console.log();
}
