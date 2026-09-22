import { describe, expect, it } from 'vitest';
import {
  HUB_TABS,
  NAV_SECTION,
  NAV_TEAM_SPACES,
  NAV_OFF_SIDEBAR,
  WORKBENCH_HUBS
} from './workbench-paths';

/**
 * La nav è un cambio di GERARCHIA, non di inventario: due garanzie, entrambe qui.
 *
 * 1. HUB_TABS resta l'INVENTARIO delle pagine del brand, inchiodato a un letterale. Non
 *    disegna più niente — la sidebar è una sola — ma dice quali destinazioni esistono, ed è
 *    contro quella lista che si misura se il nuovo albero ne ha perso una.
 * 2. Ogni destinazione di quell'inventario resta raggiungibile da Spazi + fuori sidebar. Si
 *    cammina la lista vera, non un elenco ricopiato a mano.
 */
describe('la nav del brand', () => {
  it("HUB_TABS è l'inventario delle pagine, inchiodato (pin)", () => {
    expect(HUB_TABS).toEqual({
      brand: [{ key: 'identity', path: '/settings/brand' }],
      publish: [
        { key: 'calendar', path: '/calendar' },
        { key: 'manualPosting', path: '/manual-posting' }
      ],
      ads: [
        { key: 'social', path: '/ads/social', adsOnly: true },
        { key: 'library', path: '/ads/library', adsOnly: true }
      ],
      designer: [{ key: 'mediaLibrary', path: '/assets' }]
    });
  });

  it("ogni destinazione dell'inventario resta linkata nell'albero", () => {
    const inventory = WORKBENCH_HUBS.flatMap((hub) => (HUB_TABS[hub] ?? []).map((t) => t.path));
    const newTree = new Set([...NAV_TEAM_SPACES, ...NAV_OFF_SIDEBAR].map((t) => t.path));
    for (const path of inventory) {
      expect(newTree, `href orfano: ${path}`).toContain(path);
    }
  });

  it('il nuovo albero non inventa hub: ogni voce usa chiavi i18n esistenti o nav2', () => {
    const icons = new Set<string>();
    for (const t of [...NAV_TEAM_SPACES, ...NAV_OFF_SIDEBAR]) {
      expect(t.labelKey).toMatch(/^app\.(hub|nav2)\./);
      expect(t.path === '' || t.path.startsWith('/')).toBe(true);
      expect(t.icon, `icona mancante: ${t.path}`).toBeTruthy();
      icons.add(t.icon);
    }
    // Un token per riga, non un indice: SPACE_ICONS[i] si slittava da solo a ogni voce aggiunta.
    expect(icons.size).toBe(8);
    // La home apre gli Spazi, ed è la sola voce senza segmento: `path` vuoto = `/p/<projectId>`.
    expect(NAV_TEAM_SPACES[0].path).toBe('');
    // Sanità: le liste non si sovrappongono (una pagina, una casa).
    const spaces = NAV_TEAM_SPACES.map((t) => t.path);
    const tools = NAV_OFF_SIDEBAR.map((t) => t.path);
    expect(spaces.filter((p) => tools.includes(p))).toEqual([]);
    expect(WORKBENCH_HUBS.length).toBe(4);
  });

  /**
   * La sidebar per intero: quattro righe, in quest'ordine, più l'ingranaggio in fondo (che non è
   * una voce e quindi non sta qui). È l'unica cosa che un test può tenere ferma di una barra —
   * l'inventario lo sorveglia il caso qui sopra, l'aspetto nessuno.
   */
  it('gli Spazi sono le voci della sidebar, in ordine', () => {
    expect(NAV_TEAM_SPACES.map((t) => [t.path, t.labelKey])).toEqual([
      ['', 'app.nav2.home'],
      ['/assets', 'app.nav2.materials'],
      ['/brands', 'app.nav2.brands'],
      ['/calendar', 'app.hub.publish.calendar'],
      ['/settings/brand', 'app.hub.brand.identity']
    ]);
  });

  /**
   * Le destinazioni senza riga in sidebar: esistono, hanno un'etichetta, si aprono da ⌘K e dai
   * link degli agenti, ma **nessuna riga della sidebar ci porta**.
   *
   * Il test non giudica: inchioda. Aggiungerne una senza toccare questa lista fa fallire la
   * suite, che è l'unico modo perché una pagina non perda la sua porta in silenzio.
   */
  it('sa esattamente quali destinazioni hanno perso la riga in sidebar', () => {
    expect(NAV_OFF_SIDEBAR.map((t) => t.path)).toEqual([
      '/manual-posting',
      '/ads/social',
      '/ads/library'
    ]);
  });

  it('la Panoramica non è più una voce: ci si arriva dalla home', () => {
    const everywhere = [...NAV_TEAM_SPACES, ...NAV_OFF_SIDEBAR];
    expect(everywhere.map((t) => t.path)).not.toContain('/workbench');
    expect(NAV_TEAM_SPACES[0].also).toContain('/workbench');
  });

  it('le sezioni della nav progetto si chiamano Tele e Pagine', () => {
    expect(NAV_SECTION).toEqual({
      boards: 'Tele',
      pages: 'Pagine',
      boardsEmpty: 'Nessuna tela'
    });
  });
});
