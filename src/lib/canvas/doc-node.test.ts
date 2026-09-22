import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  docNodeSize,
  docShareLive,
  hashShareToken,
  mintShareToken,
  newDocNodeAt,
  renderDocHtml,
  shareUrlOf
} from './doc-node';

const NOW = new Date('2026-09-21T12:00:00.000Z');
const PAST = '2026-09-20T00:00:00.000Z';
const FUTURE = '2026-12-01T00:00:00.000Z';

describe('il documento che nasce pieno', () => {
  it('ha il contenuto e nient\'altro da decidere al posto di chi scrive', () => {
    const tile = newDocNodeAt({ x: 100, y: 50 });
    const { w, h } = docNodeSize();

    expect(tile).toMatchObject({
      x: 100 - w / 2,
      y: 50 - h / 2,
      content: '',
      public: false,
      connectable: true
    });
  });

  it('nasce abbastanza largo da leggere, come una pagina incorporata', () => {
    expect(docNodeSize().w).toBeGreaterThanOrEqual(400);
    expect(docNodeSize().h).toBeGreaterThanOrEqual(300);
  });
});

describe('il token di un link pubblico', () => {
  it('è opaco, ad alta entropia e non si ripete', async () => {
    const a = await mintShareToken();
    const b = await mintShareToken();

    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43,}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.token_hash).not.toBe(b.token_hash);
  });

  it("non è ricavabile dall'impronta che il database conserva", async () => {
    const { token, token_hash } = await mintShareToken();

    expect(token_hash).not.toContain(token);
    expect(token_hash).toBe(await hashShareToken(token));
    expect(await hashShareToken(`${token}x`)).not.toBe(token_hash);
  });
});

describe('quando un link pubblico vale', () => {
  const row = (over: Partial<{ public_token_hash: string | null; public_expires_at: string | null }> = {}) => ({
    content: '# Ciao',
    public_token_hash: 'impronta',
    public_expires_at: null,
    ...over
  });

  it('vale con un\'impronta e senza scadenza', () => {
    expect(docShareLive(row(), NOW)).toEqual(row());
  });

  it('vale finché la scadenza non è passata', () => {
    expect(docShareLive(row({ public_expires_at: FUTURE }), NOW)).toEqual(row({ public_expires_at: FUTURE }));
  });

  it('revocato, scaduto e mai esistito sono la stessa risposta', () => {
    const results = [
      docShareLive(row({ public_token_hash: null }), NOW),
      docShareLive(row({ public_expires_at: PAST }), NOW),
      docShareLive(null, NOW)
    ];

    expect(results).toEqual([null, null, null]);
    expect(new Set(results.map((r) => JSON.stringify(r))).size).toBe(1);
  });
});

describe('il markdown di un documento', () => {
  it('si legge come HTML, e il codice grezzo non passa', () => {
    const html = renderDocHtml('# Titolo\n\n<script>alert(1)</script>');

    expect(html).toContain('<h1');
    expect(html).toContain('Titolo');
    expect(html).not.toContain('<script>');
  });

  it('un link javascript: non resta cliccabile', () => {
    expect(renderDocHtml('[x](javascript:alert(1))')).not.toContain('javascript:');
  });
});

describe("l'URL monouso di un link pubblico", () => {
  it('si mostra solo quando il token c\'è', () => {
    expect(shareUrlOf('https://tela.test', '/d/abc')).toBe('https://tela.test/d/abc');
  });

  it('senza path non si inventa un indirizzo: il token andrebbe perduto in silenzio', () => {
    expect(shareUrlOf('https://tela.test', null)).toBeNull();
    expect(shareUrlOf('https://tela.test', '')).toBeNull();
    expect(shareUrlOf('https://tela.test', undefined)).toBeNull();
  });
});

describe('lo stile del markdown scritto', () => {
  const css = readFileSync(join(__dirname, '..', 'styles', 'doc-prose.css'), 'utf8');
  const doc = readFileSync(join(__dirname, '..', 'components', 'canvas', 'DocNode.svelte'), 'utf8');
  const sheet = readFileSync(
    join(__dirname, '..', '..', 'routes', 'd', '[token]', '+page.svelte'),
    'utf8'
  );

  it('veste ogni blocco che renderDocHtml sa produrre', () => {
    for (const tag of [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'ul', 'ol', 'li',
      'blockquote', 'pre', 'code', 'a',
      'strong', 'em', 'del', 'hr', 'img', 'table', 'th', 'td'
    ]) {
      expect(css, tag).toMatch(new RegExp(`(^|[\\s,{])${tag}(\\b|[\\s{,])`));
    }
  });

  it("i link leggono l'accento da testo, non l'accento grezzo", () => {
    expect(css).toMatch(/\.doc-prose[^{]*\ba\b[^{]*\{[^}]*--accent-ink/);
  });

  it('le liste tornano elenchi anche sotto il reset di Tailwind', () => {
    expect(css).toMatch(/list-style:\s*disc/);
    expect(css).toMatch(/list-style:\s*decimal/);
  });

  it('il nodo e la pagina pubblica condividono lo stesso foglio', () => {
    expect(doc).toMatch(/doc-prose\.css/);
    expect(doc).toMatch(/doc-prose/);
    expect(sheet).toMatch(/doc-prose\.css/);
    expect(sheet).toMatch(/doc-prose/);
  });
});
