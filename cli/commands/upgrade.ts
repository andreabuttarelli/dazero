import { loadSession } from '../lib/auth.ts';
import { api } from '../lib/api.ts';
import { c, info } from '../lib/display.ts';

export async function cmdUpgrade(slug: string) {
  const session = await loadSession();
  if (!session) { console.error('Sessione scaduta o non trovata. Esegui: feega login'); process.exit(1); }

  const detail = await api.getBrand(session.access_token, slug);
  const brand = detail.brand;

  console.log(c.bold(`\nUpgrade — ${brand.name}\n`));

  const url = `${process.env.PUBLIC_APP_URL}/app/billing`;
  console.log(`  Apertura pagina di upgrade…`);
  console.log(`  ${c.dim(url)}`);

  const { default: open } = await import('open');
  await open(url);

  info('\n  Dopo il pagamento, la CLI aggiornerà automaticamente il piano.');
  console.log();
}
