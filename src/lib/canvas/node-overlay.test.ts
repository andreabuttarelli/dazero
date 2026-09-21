import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * LE PROPRIETÀ COMPAIONO QUANDO SERVONO.
 *
 * Erano una fascia fissa sopra ogni nodo: su una tela con dieci nodi sono dieci file di menù a
 * tendina addosso a quel che si sta guardando, e il contenuto — l'immagine, il video, il prompt —
 * resta schiacciato sotto. Ora la fascia c'è solo sul nodo SELEZIONATO, e fuori dal suo corpo:
 * galleggia sopra, così il nodo non cambia misura quando la si apre.
 *
 * `selected` lo passa SvelteFlow a ogni nodo (`NodeProps`): è l'unica fonte che sa davvero cosa è
 * selezionato, e tenerne una nostra vorrebbe dire due verità che divergono al primo clic sullo
 * sfondo.
 */
const dir = dirname(fileURLToPath(import.meta.url));
const read = (name: string) =>
  readFileSync(join(dir, '..', 'components', 'canvas', name), 'utf8');

const tile = read('CanvasTile.svelte');
const gen = read('GenNode.svelte');

describe("l'overlay delle proprietà", () => {
  it('la tile porta dentro la selezione di SvelteFlow, che è chi la conosce', () => {
    expect(tile).toMatch(/selected/);
  });

  it('il nodo mostra le proprietà solo quando è selezionato', () => {
    expect(gen).toMatch(/\{#if selected\}/);
  });

  it('la fascia galleggia sopra il nodo invece di stargli dentro', () => {
    // Dentro il corpo, aprirla cambierebbe la misura del nodo e farebbe saltare quel che c'è
    // sotto ogni volta che lo si seleziona.
    expect(gen).toMatch(/position:\s*absolute/);
  });

  it('e non rimane cliccabile quando non si vede', () => {
    // Un pannello nascosto ma ancora nel flusso intercetta i clic diretti al nodo sotto.
    expect(gen).toMatch(/\{#if selected\}[\s\S]*?\{\/if\}/);
  });
});
