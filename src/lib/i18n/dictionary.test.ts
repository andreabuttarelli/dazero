import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from './locales/en.json';

const SOURCE_ROOT = 'src';
const LOCALES_DIR = join('src', 'lib', 'i18n', 'locales');
const QUOTED_KEY = /(['"`])([A-Za-z][\w-]*(?:\.[\w-]+)*\.?)(?=\1|\$\{)/g;
const TEMPLATE_PREFIX = /`([A-Za-z][\w-]*(?:\.[\w-]+)*\.)\$\{/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return path === LOCALES_DIR ? [] : sourceFiles(path);
    }
    return /\.(svelte|ts|js)$/.test(entry.name) ? [path] : [];
  });
}

function referencedStrings(): Set<string> {
  const found = new Set<string>();
  for (const file of sourceFiles(SOURCE_ROOT)) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(QUOTED_KEY)) {
      found.add(match[2].replace(/\.$/, ''));
    }
    for (const match of text.matchAll(TEMPLATE_PREFIX)) {
      found.add(match[1].replace(/\.$/, ''));
    }
  }
  return found;
}

function leafKeys(tree: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === 'object' ? leafKeys(value as Record<string, unknown>, path) : [path];
  });
}

function isReferenced(key: string, referenced: Set<string>): boolean {
  const segments = key.split('.');
  for (let length = segments.length; length >= 2; length--) {
    if (referenced.has(segments.slice(0, length).join('.'))) {
      return true;
    }
  }
  return false;
}

describe('en.json ships only strings the app can show', () => {
  it('has no key that no code names, literally or as a namespace prefix: every page downloads the whole file before hydrating', () => {
    const referenced = referencedStrings();
    const unreferenced = leafKeys(en).filter((key) => !isReferenced(key, referenced));
    expect(unreferenced).toEqual([]);
  });
});

describe('the docs strings travel only with the docs', () => {
  it('app pages resolve their strings with no docs dictionary loaded, and the docs loader adds it', async () => {
    const { get } = await import('svelte/store');
    const { dictionary, locale, waitLocale } = await import('svelte-i18n');
    const { loadDocsMessages } = await import('./index');
    await waitLocale();
    const current = get(locale) ?? 'en';

    expect(get(dictionary)[current]?.['docs']).toBeUndefined();
    expect(Object.keys(get(dictionary)[current] ?? {}).length).toBeGreaterThan(0);

    await loadDocsMessages();
    expect(get(dictionary)[current]?.['docs']).toBeDefined();
  });
});
