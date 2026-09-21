import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { IFRAME_SANDBOX } from './iframe-node';

/**
 * OGNI IFRAME DELLA TELA È IN SANDBOX, E NESSUNO SI SCRIVE I PERMESSI DA SÉ.
 *
 * Il difetto che questo test esiste per impedire non è di oggi: è quello del giorno in cui un
 * embed non si vedrà, qualcuno proverà ad aggiungere `allow-same-origin` «solo per questo caso»,
 * e la sandbox smetterà di essere una sandbox — con `allow-scripts` accanto, il documento
 * incorporato si toglie l'attributo da solo. Su `srcdoc` quel documento è HTML scritto da un
 * membro del brand o dall'agente, e i brand sono condivisi: XSS depositato sull'origine dell'app.
 *
 * Si legge il SORGENTE e non si monta il componente: montarlo direbbe che non è esploso, non che
 * ogni `<iframe>` porta gli attributi giusti — che è esattamente la cosa da verificare.
 */
const dir = dirname(fileURLToPath(import.meta.url));
const component = readFileSync(
  join(dir, '..', 'components', 'canvas', 'IframeNode.svelte'),
  'utf8'
);

const iframeTags = [...component.matchAll(/<iframe[\s\S]*?><\/iframe>/g)].map((m) => m[0]);

describe('gli iframe della tela', () => {
  it('ce ne sono: il componente disegna davvero una pagina incorporata', () => {
    expect(iframeTags.length).toBeGreaterThan(0);
  });

  it('nessuno si scrive i permessi a mano: vengono tutti dalla costante', () => {
    // Un `sandbox="allow-scripts allow-same-origin"` scritto nel markup sfuggirebbe al test che
    // sorveglia la costante. Qui si impone che la costante sia l'unica strada.
    for (const tag of iframeTags) {
      expect(tag).toMatch(/sandbox=\{IFRAME_SANDBOX\}/);
    }
  });

  it('nessuno concede allow-same-origin, in nessuna forma', () => {
    // Si guarda il VALORE degli attributi, non il testo del file: il commento in cima spiega
    // perché quel permesso non si dà, e nominarlo per spiegarlo non è darlo. Un test che non
    // sapesse distinguere le due cose costringerebbe a togliere la spiegazione per farlo tacere
    // — cioè a pagare con l'unica cosa che impedisce di rifare l'errore.
    const attributes = [...component.matchAll(/sandbox=(?:"([^"]*)"|\{([^}]*)\})/g)];

    expect(attributes.length).toBeGreaterThan(0);
    for (const [, literal, expression] of attributes) {
      expect(literal ?? expression).not.toMatch(/allow-same-origin/);
    }
  });

  it('e la costante che tutti usano non lo concede', () => {
    // L'altra metà: gli attributi rimandano alla costante, quindi è lei che va guardata. Il test
    // vive accanto a `iframe-node.ts` e lo ripete di proposito — se qualcuno la cambia là, sono
    // due i rossi che lo dicono.
    expect(IFRAME_SANDBOX).not.toMatch(/allow-same-origin/);
  });

  it('ognuno dichiara da chi arriva e si carica solo quando serve', () => {
    for (const tag of iframeTags) {
      expect(tag).toMatch(/referrerpolicy=\{IFRAME_REFERRER_POLICY\}/);
      expect(tag).toMatch(/loading="lazy"/);
    }
  });

  it('ognuno ha un titolo: un riquadro senza nome non si annuncia a chi non vede', () => {
    for (const tag of iframeTags) {
      expect(tag).toMatch(/title="/);
    }
  });
});

describe('la via d uscita quando il sito rifiuta di farsi incorporare', () => {
  it('il link «apri in una scheda» c è, e non si apre sulla nostra finestra', () => {
    // `noopener` non è cerimonia: senza, la pagina aperta riceve `window.opener` e può cambiare
    // l'indirizzo della scheda da cui è stata aperta.
    expect(component).toMatch(/target="_blank"/);
    expect(component).toMatch(/rel="noopener noreferrer"/);
  });
});
