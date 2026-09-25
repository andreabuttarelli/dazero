import { describe, expect, it } from 'vitest';
import { clampDuration, controlFor, defaultParamsFor, setLayoutParam } from './composition-editor';
import type { LayoutParam } from './composition/types';

describe('controlFor', () => {
  it('builds a slider for a range param, falling back to its default', () => {
    const param: LayoutParam = { name: 'columns', label: 'Colonne', kind: 'range', min: 1, max: 8, step: 1, default: 4 };
    expect(controlFor(param, undefined)).toEqual({ kind: 'slider', min: 1, max: 8, step: 1, value: 4 });
    expect(controlFor(param, 6)).toEqual({ kind: 'slider', min: 1, max: 8, step: 1, value: 6 });
  });

  it('builds a select, rejecting a value outside the options', () => {
    const param: LayoutParam = {
      name: 'direction',
      label: 'Direzione',
      kind: 'select',
      options: [{ value: 'up', label: 'Su' }, { value: 'down', label: 'Giù' }],
      default: 'up'
    };
    expect(controlFor(param, 'down')).toEqual({ kind: 'select', options: param.options, value: 'down' });
    expect(controlFor(param, 'sideways')).toEqual({ kind: 'select', options: param.options, value: 'up' });
  });

  it('builds a color control', () => {
    const param: LayoutParam = { name: 'tint', label: 'Tinta', kind: 'color', default: '#000000' };
    expect(controlFor(param, '#ff0000')).toEqual({ kind: 'color', value: '#ff0000' });
  });

  it('builds a seed control', () => {
    const param: LayoutParam = { name: 'seed', label: 'Seed', kind: 'seed', default: 1 };
    expect(controlFor(param, 42)).toEqual({ kind: 'seed', value: 42 });
  });
});

describe('setLayoutParam', () => {
  it('sets one param without touching the others', () => {
    expect(setLayoutParam({ a: 1, b: 2 }, 'a', 9)).toEqual({ a: 9, b: 2 });
  });
});

describe('defaultParamsFor', () => {
  it('maps a param table to its defaults', () => {
    expect(defaultParamsFor([{ name: 'a', default: 1 }, { name: 'b', default: 'x' }])).toEqual({ a: 1, b: 'x' });
  });
});

describe('clampDuration', () => {
  it('never returns zero or negative', () => {
    expect(clampDuration(0)).toBe(0.5);
    expect(clampDuration(-5)).toBe(0.5);
    expect(clampDuration(6)).toBe(6);
  });
});
