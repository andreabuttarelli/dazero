#!/usr/bin/env bun
import { Command } from 'commander';
import { loadEnv, assertEnv } from './lib/config.ts';

await loadEnv();

const program = new Command();

// Validate required env vars before any command runs (not before --help).
program.hook('preAction', () => assertEnv());

program
  .name('feega')
  .description('CLI per gestire feega — social media AI autopilot')
  .version('0.1.0')
  .addHelpText('after', `
Esempi:
  $ feega brands                   Lista tutti i brand
  $ feega dashboard my-brand       Dashboard completa

Documentazione completa: cli/README.md
`);

program
  .command('login')
  .description('Accedi a feega (default: apre il browser)')
  .option('--email <email>', 'email per login non interattivo (richiede --password o --password-stdin)')
  .option('--password <password>', 'password per login non interattivo (richiede --email)')
  .option('--password-stdin', 'legge la password da stdin, fuori da history e process list')
  .action(async (options) => {
    const { cmdLogin } = await import('./commands/login.ts');
    await cmdLogin(options);
  });

program
  .command('logout')
  .description('Disconnettiti da feega')
  .action(async () => {
    const { cmdLogout } = await import('./commands/logout.ts');
    await cmdLogout();
  });

program
  .command('brands')
  .description('Elenca tutti i brand con status e autopilot')
  .action(async () => {
    const { cmdBrands } = await import('./commands/brands.ts');
    await cmdBrands();
  });

program
  .command('status <slug>')
  .description('Status dettagliato di un brand (post pending, quota, ultimi run)')
  .action(async (slug: string) => {
    const { cmdStatus } = await import('./commands/status.ts');
    await cmdStatus(slug);
  });

program
  .command('health')
  .description('Verifica lo stato delle API (Supabase, Gemini, Zernio)')
  .action(async () => {
    const { cmdHealth } = await import('./commands/health.ts');
    await cmdHealth();
  });

program
  .command('dashboard <slug>')
  .description('Dashboard completa di un brand: stats, pipeline, stato autopilot')
  .action(async (slug: string) => {
    const { cmdDashboard } = await import('./commands/dashboard.ts');
    await cmdDashboard(slug);
  });

program
  .command('products <slug> [action]')
  .description('Prodotti: list (elenca), sync (reimporta dal sito e-commerce)')
  .action(async (slug: string, action: string | undefined) => {
    const { cmdProducts } = await import('./commands/products.ts');
    await cmdProducts(slug, { action: action ?? 'list' });
  });

program
  .command('ads <slug>')
  .description('Ads via Zernio: list, propose boosts, remix competitor ads, approve spend')
  .option('--propose', 'Crea proposte di boost dai post organici migliori')
  .option('--remix', 'Remix competitor/trending ads → brief creativi in brand voice')
  .option('--approve <id>', 'Approva e lancia una campagna proposta (spende budget)')
  .option('--reject <id>', 'Rifiuta una proposta')
  .option('--duplicate <id>', 'Duplica una campagna live (copia in pausa, poi approva)')
  .option('--delete <id>', 'Elimina una campagna sulla piattaforma (storico conservato)')
  .option('--pause <id>', 'Metti in pausa una campagna attiva')
  .option('--resume <id>', 'Riattiva una campagna in pausa')
  .option('--ad <adId>', 'Singola creatività: con --pause/--resume agisce solo su quella ad')
  .option('--sync', 'Sincronizza ad account + metrics da Zernio')
  .option('--budget <amount>', 'Budget daily (con --approve o --create)')
  .option('--create', 'Crea proposta standalone (serve --name --headline)')
  .option('--platform <platform>', 'metaads|googleads|tiktokads|linkedinads|xads|pinterestads', 'metaads')
  .option('--name <name>', 'Nome campagna (--create)')
  .option('--headline <text>', 'Headline creative (--create)')
  .option('--body <text>', 'Body creative (--create)')
  .option('--url <url>', 'Landing page (--create)')
  .option('--image <url>', 'Image URL (--create)')
  .option('--goal <goal>', 'engagement|traffic|awareness|…')
  .action(async (slug: string, opts) => {
    const { cmdAds } = await import('./commands/ads.ts');
    await cmdAds(slug, opts);
  });

program
  .command('upgrade <slug>')
  .description('Upgrade piano — apre la pagina di checkout nel browser')
  .action(async (slug: string) => {
    const { cmdUpgrade } = await import('./commands/upgrade.ts');
    await cmdUpgrade(slug);
  });

program
  .command('update')
  .description('Aggiorna feega CLI all\'ultima versione')
  .action(async () => {
    const { cmdUpdate } = await import('./commands/update.ts');
    await cmdUpdate();
  });

program.parse();
