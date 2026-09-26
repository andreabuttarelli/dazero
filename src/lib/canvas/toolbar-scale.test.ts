import { describe, expect, it } from 'vitest';
import { TOOLBAR_MAX_SCALE, TOOLBAR_MIN_SCALE, TOOLBAR_HIDE_BELOW_ZOOM, toolbarScale } from './toolbar-scale';

describe('il fattore con cui la barra della selezione segue lo zoom', () => {
  it('segue lo zoom entro la fascia leggibile', () => {
    expect(toolbarScale(0.75)).toBeCloseTo(0.75);
  });

  it('non supera 1: ingrandita coprirebbe più nodo di quanto ne selezioni', () => {
    expect(toolbarScale(2)).toBe(TOOLBAR_MAX_SCALE);
    expect(toolbarScale(1.5)).toBe(TOOLBAR_MAX_SCALE);
  });

  it('non scende sotto la soglia minima: sotto resterebbe illeggibile mentre i nodi lo sono già', () => {
    expect(toolbarScale(0.1)).toBe(TOOLBAR_MIN_SCALE);
    expect(toolbarScale(0)).toBe(TOOLBAR_MIN_SCALE);
  });

  it('regge uno zoom assente o assurdo dando la scala piena invece di NaN', () => {
    expect(toolbarScale(Number.NaN)).toBe(TOOLBAR_MAX_SCALE);
    expect(toolbarScale(-1)).toBe(TOOLBAR_MIN_SCALE);
  });
});

describe('la soglia sotto la quale la barra si nasconde', () => {
  it('è più bassa della scala minima: la barra clampa prima di sparire del tutto', () => {
    expect(TOOLBAR_HIDE_BELOW_ZOOM).toBeLessThan(TOOLBAR_MIN_SCALE);
  });
});
