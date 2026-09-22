import { loadSession } from '../lib/auth.ts';
import { api } from '../lib/api.ts';
import { section, statusBadge, formatDate, autopilotBadge, c, info } from '../lib/display.ts';

export async function cmdDashboard(slug: string) {
  const session = await loadSession();
  if (!session) { console.error('Sessione scaduta o non trovata. Esegui: dazero login'); process.exit(1); }

  const detail = await api.getBrand(session.access_token, slug);
  const brand = detail.brand;

  section(`${brand.name}  (${brand.slug})`);

  // Stats
  console.log(`  Prodotti:        ${c.bold(String(detail.productCount))}   Account: ${c.bold(String(detail.accountCount))}   In approvazione: ${detail.pendingCount > 0 ? c.yellow(String(detail.pendingCount)) : c.dim('0')}   Piano: ${c.bold(brand.plan ?? '—')}`);

  // Pipeline
  const stages = [
    { label: 'Ricerca', detail: 'Studio e brand kit', done: !!detail.kit?.about },
    { label: 'Generazione', detail: 'Contenuti in coda', done: detail.pendingCount > 0 || detail.scheduledCount > 0 || detail.publishedCount > 0 },
    { label: 'Pubblicazione', detail: 'Scheduling e post', done: detail.scheduledCount > 0 || detail.publishedCount > 0 },
    { label: 'Analisi', detail: 'Metriche e ottimizzazione', done: detail.hasHistory },
  ];
  const firstIncomplete = stages.findIndex(s => !s.done);
  if (firstIncomplete >= 0) stages[firstIncomplete].done = false;

  section('Autopilot Pipeline');
  const pipelineStr = stages.map((s, i) => {
    const isCurrent = i === firstIncomplete || (firstIncomplete === -1 && i === stages.length - 1);
    const icon = s.done ? c.green('●') : isCurrent ? c.yellow('◉') : c.dim('○');
    const label = s.done ? c.green(s.label) : isCurrent ? c.yellow(s.label) : c.dim(s.label);
    return `${icon} ${label}`;
  }).join(` ${c.dim('─')} `);
  console.log(`  ${pipelineStr}`);
  if (firstIncomplete >= 0) console.log(`  ${c.dim(stages[firstIncomplete].detail)}`);

  // Status
  section('Stato');
  console.log(`  Status:    ${statusBadge(brand.status ?? '')}`);
  if (detail.runs[0]) {
    const runErr = detail.runs[0].status === 'failed' ? c.red(`  ✗ ${detail.runs[0].error ?? ''}`) : '';
    console.log(`  Ultimo run: ${formatDate(detail.runs[0].created_at)} — ${detail.runs[0].posts_created} post${runErr}`);
  }
  console.log();
}
