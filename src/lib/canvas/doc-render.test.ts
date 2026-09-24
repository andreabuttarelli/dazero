import { describe, expect, it } from 'vitest';
import { renderDocHtml } from './doc-render';

describe('il markdown generato da un modello si rende, mai si esegue', () => {
  it('un tag HTML grezzo nel testo esce come testo, non come markup vivo', () => {
    const html = renderDocHtml('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('un link javascript: diventa un ancora inerte, non un href eseguibile', () => {
    const html = renderDocHtml('[clic](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="#"');
  });

  it('un link https resta un link vero', () => {
    const html = renderDocHtml('[dazero](https://dazero.co)');
    expect(html).toContain('href="https://dazero.co"');
  });

  it('markdown comune si rende — grassetto, elenco, titolo', () => {
    const html = renderDocHtml('# Titolo\n\n- uno\n- due\n\n**forte**');
    expect(html).toContain('<h1>Titolo</h1>');
    expect(html).toContain('<li>uno</li>');
    expect(html).toContain('<strong>forte</strong>');
  });
});
