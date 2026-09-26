import { describe, expect, it } from 'vitest';
import { tokenizeChips, renderBrandContentHtml, parseChipColourRgb } from './brand-content-chips';

describe('tokenizeChips: colore e handle dentro una riga di testo', () => {
  it('una riga senza token torna un unico segmento di testo', () => {
    expect(tokenizeChips('Solo testo, niente da trovare.')).toEqual([
      { kind: 'text', value: 'Solo testo, niente da trovare.' }
    ]);
  });

  it('riconosce un hex a 6 cifre', () => {
    expect(tokenizeChips('Primario #1a2b3c per i bottoni')).toEqual([
      { kind: 'text', value: 'Primario ' },
      { kind: 'colour', raw: '#1a2b3c', hex: '#1a2b3c' },
      { kind: 'text', value: ' per i bottoni' }
    ]);
  });

  it('riconosce un hex a 3 cifre', () => {
    expect(tokenizeChips('#f0a')).toEqual([{ kind: 'colour', raw: '#f0a', hex: '#f0a' }]);
  });

  it('riconosce rgb(...) con spazi opzionali', () => {
    expect(tokenizeChips('sfondo rgb(255, 0, 128)')).toEqual([
      { kind: 'text', value: 'sfondo ' },
      { kind: 'colour', raw: 'rgb(255, 0, 128)', hex: 'rgb(255, 0, 128)' }
    ]);
  });

  it('un hex troppo corto o troppo lungo non è un colore', () => {
    expect(tokenizeChips('#ab')).toEqual([{ kind: 'text', value: '#ab' }]);
    expect(tokenizeChips('#1a2b3c4')).toEqual([{ kind: 'text', value: '#1a2b3c4' }]);
  });

  it('riconosce platform:@handle per ogni piattaforma ammessa dal nodo feed', () => {
    expect(tokenizeChips('instagram:@acme')).toEqual([
      { kind: 'handle', raw: 'instagram:@acme', platform: 'instagram', handle: 'acme' }
    ]);
    expect(tokenizeChips('facebook:@acme.brand')).toEqual([
      { kind: 'handle', raw: 'facebook:@acme.brand', platform: 'facebook', handle: 'acme.brand' }
    ]);
  });

  it('una piattaforma non ammessa resta testo, non genera un token handle', () => {
    expect(tokenizeChips('snapchat:@acme')).toEqual([{ kind: 'text', value: 'snapchat:@acme' }]);
  });

  it('senza @ dopo la piattaforma non è un handle', () => {
    expect(tokenizeChips('instagram:acme')).toEqual([{ kind: 'text', value: 'instagram:acme' }]);
  });

  it('più token nella stessa riga, in ordine', () => {
    expect(tokenizeChips('#111 e instagram:@acme insieme')).toEqual([
      { kind: 'colour', raw: '#111', hex: '#111' },
      { kind: 'text', value: ' e ' },
      { kind: 'handle', raw: 'instagram:@acme', platform: 'instagram', handle: 'acme' },
      { kind: 'text', value: ' insieme' }
    ]);
  });

  it('una riga vuota torna un array vuoto', () => {
    expect(tokenizeChips('')).toEqual([]);
  });
});

describe('parseChipColourRgb: il colore di un chip come byte rgb, per disegnare lo swatch', () => {
  it('un hex a 6 cifre torna i suoi tre byte', () => {
    expect(parseChipColourRgb('#1a2b3c')).toEqual({ r: 0x1a, g: 0x2b, b: 0x3c });
  });

  it('un hex a 3 cifre raddoppia ogni cifra', () => {
    expect(parseChipColourRgb('#f0a')).toEqual({ r: 0xff, g: 0x00, b: 0xaa });
  });

  it('rgb(...) legge i tre numeri', () => {
    expect(parseChipColourRgb('rgb(255, 0, 128)')).toEqual({ r: 255, g: 0, b: 128 });
  });

  it('un valore che non è nessuna delle due forme torna null', () => {
    expect(parseChipColourRgb('non un colore')).toBeNull();
  });
});

describe('renderBrandContentHtml: il markdown del brand con i chip dentro', () => {
  it('un titolo diventa h2, un paragrafo resta testo scappato', () => {
    const html = renderBrandContentHtml('# Acme\n\nUn brand <script>.');
    expect(html).toContain('<h2>Acme</h2>');
    expect(html).toContain('Un brand &lt;script&gt;.');
    expect(html).not.toContain('<script>');
  });

  it('un colore diventa uno swatch draggable, con il payload del drag già dentro', () => {
    const html = renderBrandContentHtml('Primario: #1a2b3c');
    expect(html).toContain('class="chip chip-colour"');
    expect(html).toContain('data-drag-kind="colour"');
    expect(html).toContain('data-hex="#1a2b3c"');
    expect(html).toContain('#1a2b3c');
  });

  it('un handle diventa un chip con piattaforma e handle nel dataset, e l\'icona della piattaforma dentro', () => {
    const html = renderBrandContentHtml('instagram:@acme');
    expect(html).toContain('class="chip chip-handle"');
    expect(html).toContain('data-drag-kind="handle"');
    expect(html).toContain('data-platform="instagram"');
    expect(html).toContain('data-handle="acme"');
    expect(html).toContain('@acme');
    expect(html).toContain('<svg');
  });

  it('una piattaforma senza icona in PLATFORM_META mostra comunque una sigla, mai un chip vuoto', () => {
    const html = renderBrandContentHtml('linkedin:@acme');
    expect(html).toContain('class="chip-platform"');
    expect(html).toContain('>in<');
  });

  it('una riga che comincia con "-" diventa un elemento di lista, i chip dentro restano vivi', () => {
    const html = renderBrandContentHtml('- facebook:@acme');
    expect(html).toContain('<li>');
    expect(html).toContain('class="chip chip-handle"');
  });

  it('righe vuote separano i paragrafi, non ne creano di vuoti', () => {
    const html = renderBrandContentHtml('Uno\n\n\nDue');
    expect(html.match(/<p>/g)?.length).toBe(2);
  });
});
