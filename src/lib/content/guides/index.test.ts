import { describe, expect, test } from 'vitest';
import { guideEntries, guideBySlug } from './index';
import { renderDocHtml } from '$lib/canvas/doc-render';

describe('guide della tela', () => {
  test('ci sono sette guide, ognuna con titolo e contenuto', () => {
    expect(guideEntries.length).toBe(7);
    for (const guide of guideEntries) {
      expect(guide.title.trim().length).toBeGreaterThan(0);
      expect(guide.content.trim().length).toBeGreaterThan(0);
    }
  });

  test('ogni slug è unico', () => {
    const slugs = guideEntries.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  test('guideBySlug trova ogni guida per il suo slug e torna null altrimenti', () => {
    for (const guide of guideEntries) {
      expect(guideBySlug(guide.slug)?.title).toBe(guide.title);
    }
    expect(guideBySlug('non-esiste')).toBeNull();
  });

  test('ogni guida si rende in HTML senza lanciare', () => {
    for (const guide of guideEntries) {
      expect(() => renderDocHtml(guide.content)).not.toThrow();
      expect(renderDocHtml(guide.content).length).toBeGreaterThan(0);
    }
  });
});
