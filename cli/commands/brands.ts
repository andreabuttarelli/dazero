import { loadSession } from '../lib/auth.ts';
import { api } from '../lib/api.ts';
import { table, statusBadge, c } from '../lib/display.ts';

export async function cmdBrands() {
  const session = await loadSession();
  if (!session) { console.error('Sessione scaduta o non trovata. Esegui: dazero login'); process.exit(1); }

  const brands = await api.listBrands(session.access_token);

  if (!brands.length) {
    console.log(c.dim('Nessun brand trovato.'));
    return;
  }

  console.log(c.bold(`\n${brands.length} brand\n`));

  table(
    ['Brand', 'Slug', 'Piano', 'Status', 'Pending'],
    brands.map((b) => [
      c.bold(b.name),
      c.dim(b.slug),
      b.plan ?? '—',
      statusBadge(b.status ?? ''),
      b.pendingCount > 0 ? c.yellow(String(b.pendingCount)) : c.dim('0'),
    ])
  );
}
