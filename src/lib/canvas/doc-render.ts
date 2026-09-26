import { Marked } from 'marked';

// Il codice grezzo si ESCAPE, non si filtra: le denylist sono aggirabili, e una pagina pubblica
// servita con {@html} non deve passare markup di chi ha scritto il nodo. Stessa scelta di blog-site.
const escapeHtmlText = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const SAFE_HREF = /^(https?:|mailto:|tel:|#|\/)/i;

const docMarked = new Marked({
  renderer: {
    html(token) {
      return escapeHtmlText(typeof token === 'string' ? token : (token.text ?? token.raw ?? ''));
    },
    link(token) {
      const href = String(token.href ?? '');
      const safe = SAFE_HREF.test(href.trim()) ? href : '#';
      const title = token.title ? ` title="${escapeHtmlText(String(token.title))}"` : '';
      const label = this.parser.parseInline(token.tokens ?? []);
      return `<a href="${escapeHtmlText(safe)}"${title}>${label}</a>`;
    }
  }
});

export function renderDocHtml(md: string): string {
  return docMarked.parse(md) as string;
}
