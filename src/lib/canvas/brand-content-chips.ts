/**
 * IL MARKDOWN CHE UN BRAND PORTA — un colore o una piattaforma scritti in mezzo al testo non
 * restano lettere: diventano un chip trascinabile sulla tela. `content` (colonna `brands.content`,
 * vedi CLAUDE.md) è l'UNICO posto dove target, palette, concorrenti e handle vivono — niente
 * colonne o tabelle nuove — e questo file è la lettura che ci trova dentro un colore o un
 * `platform:@handle` senza che chi scrive il documento faccia niente di speciale.
 *
 * `SOCIAL_PLATFORMS` (`node-data.ts`) è la tabella, non una seconda lista: una piattaforma che il
 * nodo `social_account_feed` non accetta resta testo qui, non un chip che poi non si può
 * trascinare da nessuna parte.
 */
import { SOCIAL_PLATFORMS } from './node-data';
import { PLATFORM_META } from '../components/platform-meta';

export type ChipToken =
  | { kind: 'text'; value: string }
  | { kind: 'colour'; raw: string; hex: string }
  | { kind: 'handle'; raw: string; platform: string; handle: string };

const HEX_COLOUR = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/;
const RGB_COLOUR = /rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)/;
const PLATFORM_GROUP = SOCIAL_PLATFORMS.join('|');
const HANDLE = new RegExp(`(?:${PLATFORM_GROUP}):@[a-zA-Z0-9._-]+`);

const CHIP_TOKEN = new RegExp(`(${HANDLE.source})|(${HEX_COLOUR.source})|(${RGB_COLOUR.source})`, 'g');

/**
 * UNA RIGA DI TESTO, SPEZZATA NEI SUOI TOKEN — nell'ordine in cui compaiono, mai riordinati.
 * Il testo fra due token resta testo; un token che non combacia con nessuna delle tre forme (un
 * hex troppo corto, una piattaforma non in tabella, un handle senza `@`) non entra mai nel
 * risultato come chip: la regex stessa non lo cattura, quindi ricade nel testo attorno.
 */
export function tokenizeChips(line: string): ChipToken[] {
  if (!line) {
    return [];
  }

  const tokens: ChipToken[] = [];
  let last = 0;

  for (const match of line.matchAll(CHIP_TOKEN)) {
    const [raw, handleMatch, hexMatch, rgbMatch] = match;
    const index = match.index ?? 0;

    if (index > last) {
      tokens.push({ kind: 'text', value: line.slice(last, index) });
    }

    if (handleMatch) {
      const [platform, handle] = raw.split(':@');
      tokens.push({ kind: 'handle', raw, platform, handle });
    } else if (hexMatch || rgbMatch) {
      tokens.push({ kind: 'colour', raw, hex: raw });
    }

    last = index + raw.length;
  }

  if (last < line.length) {
    tokens.push({ kind: 'text', value: line.slice(last) });
  }

  return tokens;
}

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function chipHtml(token: ChipToken): string {
  if (token.kind === 'text') {
    return escapeHtml(token.value);
  }

  if (token.kind === 'colour') {
    const hex = escapeHtml(token.hex);
    return (
      `<span class="chip chip-colour" draggable="true" data-drag-kind="colour" data-hex="${hex}">` +
      `<span class="chip-swatch" style="background:${hex}"></span>${hex}</span>`
    );
  }

  const platform = escapeHtml(token.platform);
  const handle = escapeHtml(token.handle);
  const meta = PLATFORM_META[token.platform];
  const glyph = meta?.icon
    ? `<svg viewBox="0 0 24 24" fill="#fff"><path d="${meta.icon.path}"></path></svg>`
    : escapeHtml(meta?.short ?? platform.slice(0, 2));
  const bg = meta?.bg ?? '#999';

  return (
    `<span class="chip chip-handle" draggable="true" data-drag-kind="handle" data-platform="${platform}" data-handle="${handle}">` +
    `<span class="chip-platform" style="background:${bg}">${glyph}</span>@${handle}</span>`
  );
}

export type Rgb = { r: number; g: number; b: number };

const HEX3 = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/;
const HEX6 = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/;
const RGB_FN = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/;

/**
 * IL COLORE DI UN CHIP, IN BYTE — quel che serve per disegnare lo swatch da mettere sulla tela
 * (`sharp` vuole `{r,g,b}`, non una stringa CSS). Le stesse tre forme che `tokenizeChips`
 * riconosce nel testo, lette qui una volta sola invece che in ogni chiamante.
 */
export function parseChipColourRgb(raw: string): Rgb | null {
  const hex3 = HEX3.exec(raw);
  if (hex3) {
    return { r: parseInt(hex3[1] + hex3[1], 16), g: parseInt(hex3[2] + hex3[2], 16), b: parseInt(hex3[3] + hex3[3], 16) };
  }

  const hex6 = HEX6.exec(raw);
  if (hex6) {
    return { r: parseInt(hex6[1], 16), g: parseInt(hex6[2], 16), b: parseInt(hex6[3], 16) };
  }

  const rgb = RGB_FN.exec(raw);
  if (rgb) {
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
  }

  return null;
}

function inlineHtml(line: string): string {
  return tokenizeChips(line).map(chipHtml).join('');
}

type Block = { kind: 'h1' | 'h2' | 'h3'; text: string } | { kind: 'li'; text: string } | { kind: 'p'; text: string };

/**
 * UN RENDERER DI BLOCCO MINIMO, NON UN MOTORE COMMONMARK — `content` è un documento che il
 * wizard compone (titoli, elenchi puntati, paragrafi), non markdown arbitrario di chiunque:
 * le poche regole che servono restano una tabella, non una libreria che poi va convinta a
 * lasciar passare `<span data-drag-kind>` attraverso il suo escaping.
 */
function blocksOf(markdown: string): Block[] {
  const lines = markdown.split('\n');
  const blocks: Block[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      continue;
    }

    if (line.startsWith('### ')) {
      blocks.push({ kind: 'h3', text: line.slice(4) });
    } else if (line.startsWith('## ')) {
      blocks.push({ kind: 'h2', text: line.slice(3) });
    } else if (line.startsWith('# ')) {
      blocks.push({ kind: 'h2', text: line.slice(2) });
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      blocks.push({ kind: 'li', text: line.slice(2) });
    } else {
      blocks.push({ kind: 'p', text: line });
    }
  }

  return blocks;
}

export function renderBrandContentHtml(markdown: string): string {
  const blocks = blocksOf(markdown ?? '');
  const html: string[] = [];
  let inList = false;

  for (const block of blocks) {
    if (block.kind === 'li') {
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      html.push(`<li>${inlineHtml(block.text)}</li>`);
      continue;
    }

    if (inList) {
      html.push('</ul>');
      inList = false;
    }

    if (block.kind === 'p') {
      html.push(`<p>${inlineHtml(block.text)}</p>`);
    } else {
      html.push(`<${block.kind}>${inlineHtml(block.text)}</${block.kind}>`);
    }
  }

  if (inList) {
    html.push('</ul>');
  }

  return html.join('\n');
}
