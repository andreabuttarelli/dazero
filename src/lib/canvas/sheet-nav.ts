import { goto, preloadData, pushState, replaceState } from '$app/navigation';
import { sheetEntryForPath } from '$lib/shell-nav';

type PreloadResult = Awaited<ReturnType<typeof preloadData>>;

export type SheetOutcome =
  | { kind: 'open'; href: string; data: Record<string, unknown> }
  | { kind: 'navigate'; href: string };

/**
 * COSA FARE DEL RISULTATO DI `preloadData`, isolato dalla chiamata: un `redirect` (es.
 * `/settings` → `/settings/connected-accounts`) o un `load` fallito non hanno un `data` da
 * mostrare in un foglio — si naviga per davvero, fuori dalla tela. Solo un `loaded` con 200 apre
 * il foglio.
 */
export function sheetOutcomeOf(href: string, result: PreloadResult): SheetOutcome {
  if (result.type === 'redirect') {
    return { kind: 'navigate', href: result.location };
  }
  if (result.type !== 'loaded' || result.status !== 200) {
    return { kind: 'navigate', href };
  }
  return { kind: 'open', href, data: result.data };
}

/**
 * APRIRE UN FOGLIO SOPRA LA TELA. `preloadData` fa girare il `load` della rotta vera (Calendar,
 * Ads, Settings — ognuna la sua) PRIMA di cambiare l'URL: senza, il foglio nascerebbe vuoto per
 * un istante. `pushState` poi cambia l'URL visibile nella barra dell'indirizzo — è quello che fa
 * risolvere correttamente i form `action="?/…"` di quelle pagine, che non sanno di essere dentro
 * un foglio (`history.pushState` è reale, solo `page.url` di SvelteKit resta quello della tela) —
 * ma NON smonta la tela: CanvasFlow non perde selezione, zoom o pan.
 */
/**
 * `mode: 'replace'` è per muoversi FRA le sezioni di un foglio già aperto (es. Settings → Team):
 * niente voce nuova nella storia, o Esc dovrebbe attraversare ogni sezione visitata invece di
 * tornare alla tela in un colpo solo.
 */
export async function openSheet(
  projectId: string,
  path: string,
  mode: 'push' | 'replace' = 'push'
): Promise<void> {
  const entry = sheetEntryForPath(path);
  if (!entry) return;

  const href = `/p/${projectId}${path}`;
  const outcome = sheetOutcomeOf(href, await preloadData(href));

  if (outcome.kind === 'navigate') {
    await goto(outcome.href);
    return;
  }

  const state = { sheet: { path, data: outcome.data } };
  if (mode === 'replace') {
    replaceState(outcome.href, state);
    return;
  }
  pushState(outcome.href, state);
}

export function closeSheet(): void {
  history.back();
}
