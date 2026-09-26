import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * IL BOTTONE ERA COLLEGATO ALLO STATO E A NESSUN GENERATORE.
 *
 * «Genera» si accendeva e si spegneva come doveva, e premerlo non faceva niente: il workbench
 * montava `GenNode` SENZA la prop `onrun`, e `onrun?.()` con la prop assente è un no-op silenzioso.
 * Nessun test lo vedeva, perché ognuno dei due pezzi passava da solo — il nodo chiamava quel che
 * gli avevano dato, la pagina montava un componente che non esplodeva.
 *
 * È lo stesso difetto di `connect-wiring.test.ts` — un filo staccato fra due parti giuste — e si
 * guarda allo stesso modo: leggendo il SORGENTE. Montare il componente direbbe che si disegna,
 * non che premendo parte qualcosa.
 */
const dir = dirname(fileURLToPath(import.meta.url));

const page = readFileSync(
  join(dir, '..', '..', 'routes', 'p', '[projectId]', 'c', '[canvasId]', '+page.svelte'),
  'utf8'
);
const server = readFileSync(
  join(dir, '..', '..', 'routes', 'p', '[projectId]', 'c', '[canvasId]', '+page.server.ts'),
  'utf8'
);

describe('premere Genera fa partire qualcosa', () => {
  it('il nodo riceve `onrun`: senza, il bottone chiama il vuoto', () => {
    expect(page).toMatch(/onrun=\{/);
  });

  it('e riceve come disegnare quel che è uscito, o il risultato resta invisibile', () => {
    // `refId` scritto e nessuno snippet `result` è un nodo che dice «Fatto» sopra un riquadro
    // vuoto: il difetto sarebbe mezzo chiuso, che è il modo peggiore di chiuderlo.
    expect(page).toMatch(/\{#snippet result\(/);
  });

  it('la chiamata arriva a una action che esiste', () => {
    expect(page).toMatch(/post\('run'/);
    expect(server).toMatch(/\brun:\s*async/);
  });
});

describe('un giro non si paga due volte', () => {
  it('la pagina alza `running` prima di chiamare, non dopo', () => {
    // Dopo la chiamata resterebbe aperta proprio la finestra in cui si clicca due volte, e due
    // render sono due addebiti veri di cui uno viene sovrascritto dall altro atterrando.
    const body = page.slice(page.indexOf('async function run('));
    const raised = body.indexOf('startRun(');
    const called = body.indexOf("post('run'");

    expect(raised).toBeGreaterThan(-1);
    expect(called).toBeGreaterThan(-1);
    expect(raised).toBeLessThan(called);
  });

  it('e lo riabbassa comunque: un nodo lasciato in corso non si rilancia più', () => {
    const body = page.slice(page.indexOf('async function run('));
    expect(body).toMatch(/running: false/);
  });
});

describe('spendere passa dal cancello dei crediti', () => {
  it('la action che genera lo chiede; le altre, che non spendono, no', () => {
    expect(server).toMatch(/gateOrgAiAction|gateAiAction/);

    const run = server.slice(server.indexOf('run: async'), server.indexOf('restore: async'));
    expect(run).toMatch(/creditsDenied|gateOrgAiAction|gateAiAction/);
  });
});

describe('la storia non si perde', () => {
  it('la pagina la carica all apertura, o riaprire mostra solo l ultimo risultato', () => {
    expect(server).toMatch(/loadGenRuns/);
    expect(page).toMatch(/data\.runs/);
  });

  it('e si può tornare a una generazione di prima', () => {
    expect(page).toMatch(/onshow=\{/);
    expect(server).toMatch(/\brestore:\s*async/);
  });
});

describe('un nodo bloccato si può sbloccare', () => {
  it('la pagina offre unlock e il nodo mostra l errore', () => {
    expect(page).toMatch(/onunlock=/);
    expect(page).toMatch(/unlock\(/);
  });

  it('il server che fallisce abbassa running: senza, il nodo resta in corsa per sempre', () => {
    const generate = readFileSync(
      join(dir, '..', '..', 'lib', 'server', 'canvas', 'generate.ts'),
      'utf8'
    );
    expect(generate).toMatch(/running: false/);
    expect(generate).toMatch(/error:/);
  });
});
