import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * TRASCINARE FUNZIONA SOLO QUANDO LA LISTA È SULLO STESSO SCHERMO DELLA TELA.
 *
 * `/p/<progetto>/assets` e `/p/<progetto>/c/<tela>` sono due rotte diverse: un `dragstart` lì e
 * un `ondrop` qui non si parlano attraverso una navigazione di pagina. La sidebar
 * (`DashboardSidebar`, pannello "assets") sta invece SEMPRE accanto alla tela aperta — è lì che
 * un trascinamento reale deve poter partire, non solo sulla pagina dedicata.
 *
 * Il vecchio pannello (`brand-agent/AssetsPanel`) è del brand, non del progetto — un progetto può
 * non averne uno (CLAUDE.md) — e non è draggabile: era lo scaffale della vecchia chat di brand.
 * `ProjectDragPanel` lo sostituisce nella sidebar del progetto con materiale che si trascina
 * davvero, con lo stesso pacchetto (`assetDrag`/`brandFieldDrag`) delle pagine dedicate.
 *
 * Si legge il sorgente: montare la sidebar intera per verificare un `import` è più peso che
 * risposta.
 */
const dir = dirname(fileURLToPath(import.meta.url));
const sidebar = readFileSync(join(dir, '..', 'DashboardSidebar.svelte'), 'utf8');
const panel = readFileSync(join(dir, 'ProjectDragPanel.svelte'), 'utf8');

describe('il pannello "assets" della sidebar di progetto', () => {
  it('monta ProjectDragPanel, non il vecchio scaffale del brand', () => {
    expect(sidebar).toMatch(/ProjectDragPanel/);
    expect(sidebar).not.toMatch(/brand-agent\/AssetsPanel/);
  });

  it('gli riceve il progetto, non il brand: un progetto può non averne uno', () => {
    expect(sidebar).toMatch(/<ProjectDragPanel[^>]*projectId/);
  });

  it('costruisce il pacchetto pieno con lo stesso builder delle pagine dedicate', () => {
    expect(panel).toMatch(/assetDrag/);
    expect(panel).toMatch(/brandFieldDrag/);
  });

  it('porta entrambi i MIME al dragstart, pieno e il fallback vuoto', () => {
    expect(panel).toMatch(/CANVAS_DRAG_FILLED_NODE/);
    expect(panel).toMatch(/CANVAS_DRAG_MEDIUM/);
  });
});
