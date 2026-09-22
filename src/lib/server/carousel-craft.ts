/**
 * IL MESTIERE DEL CAROSELLO, in un posto solo.
 *
 * Serve al tool `generate_carousel`. Riassumerlo avrebbe perso le parti che lo fanno funzionare —
 * «ripeti gli STESSI 2-3 gettoni ALLA LETTERA» non sopravvive a «mantieni uno stile coerente», e
 * nessun test se ne accorgerebbe.
 *
 * Il pezzo che decide se esce un carosello o N immagini scollegate sono i GETTONI DI CONTINUITA':
 * le stesse 2-3 parole, ripetute verbatim in ogni prompt di slide.
 */
import { env } from '$env/dynamic/private';
import { PLATFORM_IDS } from '$lib/platforms';

export const CAROUSEL_CRAFT =
  "CAROUSEL CRAFT (hard): the COVER must read at THUMBNAIL size — one subject, large simple shapes, high contrast, at most 4 quoted words of text; each later slide carries exactly ONE idea (a slide that needs two sentences to describe is two slides); and repeat the SAME 2-3 continuity tokens (palette words, recurring motif, lighting phrase) verbatim in EVERY slide prompt so the rendered series reads as one object, not N unrelated images.";

export const CAROUSEL_PLATFORMS: Set<string> = new Set([
  PLATFORM_IDS.instagram,
  PLATFORM_IDS.facebook,
  PLATFORM_IDS.linkedin
]);

/** Quante slide puo' avere: il minimo perche' sia una serie, il massimo della piattaforma. */
export const CAROUSEL_MIN_SLIDES = 3;
const CAROUSEL_HARD_MAX_SLIDES = 8;
export function carouselMaxSlides(): number {
  const n = Number(env.CAROUSEL_MAX_SLIDES ?? '6');
  return Math.max(CAROUSEL_MIN_SLIDES, Math.min(CAROUSEL_HARD_MAX_SLIDES, Number.isFinite(n) ? Math.floor(n) : 6));
}
