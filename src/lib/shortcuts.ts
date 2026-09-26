/**
 * L'utente sta scrivendo? Allora nessun tasto nudo è una scorciatoia: `n` dentro una caption
 * aprirebbe una chat nuova e il testo si perde. Contenteditable inclusi (l'editor degli articoli);
 * i campi che non accettano testo (checkbox, bottoni-input) esclusi apposta.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el !== 'object' || !('tagName' in el)) return false;
  const tag = String(el.tagName).toLowerCase();
  if (tag === 'textarea' || tag === 'select') return true;
  if (tag === 'input') {
    const type = String((el as HTMLInputElement).type ?? 'text').toLowerCase();
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(
      type
    );
  }
  return el.isContentEditable === true;
}
