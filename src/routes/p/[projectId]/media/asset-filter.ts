import type { AssetSource } from '$lib/server/repos/assets';

/**
 * IL FILTRO DELLA LIBRERIA: TRE STATI, NON UN BOOLEANO.
 *
 * Nessun parametro è "tutti", non un filtro mancante da trattare come un caso a parte — ed è per
 * questo che la funzione torna `undefined` invece di un default che `listProjectAssets`
 * dovrebbe poi interpretare. Un valore che non è dei tre si comporta come "tutti": la libreria
 * non ha una quarta categoria da mostrare vuota.
 */
export function parseAssetSourceFilter(raw: string | null): AssetSource | undefined {
  return raw === 'generated' || raw === 'upload' ? raw : undefined;
}
