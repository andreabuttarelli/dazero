/**
 * NASCONDERE IL SITO DI MARKETING, TENERE L'APP.
 *
 * Su un'installazione self-hosted le pagine pubbliche di dazero.co non sono
 * mobili di casa propria. `HIDE_MARKETING=1` (anche `true` / `yes`) le tiene
 * fuori dal sitemap, così un crawler non le indicizza da un dominio che non è
 * il nostro.
 *
 * Si legge a ogni richiesta (`$env/dynamic/private`): si accende senza
 * ricostruire. Spento (default) il hosted product non cambia di una riga.
 */
import { env } from '$env/dynamic/private';

function truthy(raw: string | undefined): boolean {
	const v = raw?.trim().toLowerCase();
	return v === '1' || v === 'true' || v === 'yes';
}

/** True quando questa installazione non deve mostrare il sito commerciale. */
export function hideMarketing(): boolean {
	return truthy(env.HIDE_MARKETING);
}
