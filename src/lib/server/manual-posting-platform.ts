import { PROOF_DISCIPLINE_RULE } from '$lib/server/proof-discipline';

export type ContentPrefs = {
  mood?: string;
  tone?: string;
  frequency?: string;
  goal?: string;
  /** One-line personality from the approved editorial plan — leads over HOUSE_VOICE when set. */
  personality?: string;
  language?: string;
  platformInstructions?: Record<string, string>;
  // Brand-approved hashtags per platform (internal key → list, each incl. leading '#'). When set for
  // a platform, the copywriter may ONLY use these and must never invent new ones.
  platformHashtags?: Record<string, string[]>;
  // Operational rule: words/phrases the brand bans from its copy (Strategia operativa page).
  avoid?: string[];
  // Il modello accetta 1–15 e fattura al secondo: è la leva principale sul costo video. Sempre
  // via clampVideoDuration, così un valore stantio o editato a mano non raggiunge il provider.
  videoDuration?: number;
  /** '480p' (default/recommended) | '720p' — Settings → Video. */
  videoResolution?: string;
  /** Which kie video model renders clips — Settings → Media models. */
  videoModel?: string;
  /** Which image model renders visuals — Settings → Media models. Unset = renderer decides. */
  imageModel?: string;
  // Steers the CLIP (recitazione e movimento) via buildVideoPrompt, non la caption — quella la
  // copre già platformInstructions.
  videoInstructions?: string;
  // Real past social posts (captions only) the AI uses to learn and match the brand's voice/style.
  voiceExamples?: string[];
  // Le riscritture MANUALI del proprietario (prima → dopo): il suo gusto come esempi concreti e
  // non solo come regole astratte in brand_memory. Jsonb esistente — le migration non girano al
  // deploy — e sempre sanificato da ownerCaptionEditPairs prima dell'uso.
  captionEditPairs?: Array<{ before: string; after: string; at?: string }>;
  // Strategia operativa: 'manual' injects the structured voice framework below into every
  // caption; 'auto' (default) lets the planner read voice from the Studio as always.
  voiceMode?: 'auto' | 'manual';
  voiceFramework?: {
    purpose?: string;
    audience?: string;
    tone?: string;
    register?: number; // 0 (informal) → 100 (formal)
    emotion?: string;
    character?: string;
    syntax?: string;
    terminology?: string;
  };
};

export function platformKey(platform: string | null | undefined): string {
  const p = String(platform ?? '').toLowerCase().trim();
  return p === 'twitter' ? 'x' : p;
}

// Senza steering esplicito il copywriter collassa a una o due frasi corte OVUNQUE: giusto per X,
// troppo magro per LinkedIn. Sovrascrivibili via content_prefs.platformInstructions.
const PLATFORM_GUIDE: Record<string, string> = {
  linkedin:
    'LinkedIn — write LONG-FORM, never one or two lines: open with a strong one-line hook, then 3–6 short paragraphs (mostly single-sentence lines with a blank line between them) that tell a story or unpack a concrete insight, and close on a clear takeaway or a question. Aim for ~700–1500 characters. Professional but human and first-person; no fluff. At most 3 hashtags at the very end, often none.',
  instagram:
    'Instagram — a scroll-stopping first line that works as a preview, then 2–4 short lines of story or value, an emoji or two where natural, and a clear CTA. Aim for ~300–700 characters. 3–5 relevant hashtags.',
  facebook:
    'Facebook — conversational and concrete: a hook plus 2–4 short sentences. Light on hashtags (0–2). Aim for ~200–500 characters.',
  x: 'X — one sharp, self-contained thought under 280 characters. No filler; at most 1–2 hashtags, often none.',
  threads:
    'Threads — casual and conversational, like talking to a friend: 1–3 short sentences, minimal or no hashtags, under ~400 characters.',
  tiktok:
    'TikTok — a short, hooky caption (often a question or bold claim) that complements the video. One or two lines, 2–4 trend-relevant hashtags.',
  youtube:
    'YouTube — video-only (one clip per post). Shorts vs long-form is auto-detected by YouTube: a clip ≤3 minutes AND 9:16 vertical is a Short; longer or 16:9 is a regular video. There is no separate Shorts channel. Write a punchy TITLE (max 100 chars) plus a description (the caption, up to ~5000 chars) with a hook in the first two lines, then context, then 3–8 search-relevant hashtags. We produce short vertical UGC that YouTube classifies as Shorts.',
  bluesky:
    'Bluesky — a microblog like X: one sharp, authentic, self-contained thought under ~300 characters. Casual and human, no marketing tone; minimal or no hashtags.',
  reddit:
    'Reddit — community-native and NON-promotional: write like a real member, not a brand. Reddit posts MUST have a title (max 300 chars, plain and honest, cannot be edited after posting). TEXT posts: title + a body of 2-6 paragraphs in Markdown (genuine value, a real question, or a useful guide — NO marketing). LINK posts: title + a URL to a useful resource (a blog article, a tool, a guide) — the title says what the link is about, the body adds context. IMAGE posts: title + a single on-brand image. NO hashtags, NO emoji spam, NO marketing phrasing (Reddit punishes it). Respect the subreddit\'s norms.'
};

// Default + optional brand-specific guidance for ONE platform. '' when neither exists.
export function guidanceFor(platform: string, prefs: ContentPrefs): string {
  const key = platformKey(platform);
  const base = PLATFORM_GUIDE[key] ?? '';
  const custom = prefs.platformInstructions?.[key]?.trim();
  let out = base;
  if (custom) {
    // Le istruzioni del brand vincono sul default dove i due sono in conflitto.
    out = base
      ? `${base} Brand-specific instructions for ${key} (these take priority): ${custom}`
      : `${key} — brand-specific instructions (authoritative): ${custom}`;
  }
  // Vincolo duro: il writer sceglie SOLO da qui, non inventa.
  const tags = (prefs.platformHashtags?.[key] ?? []).filter(Boolean);
  if (tags.length) {
    out += ` HASHTAGS for ${key}: use ONLY these brand-approved hashtags, exactly as written — ${tags.join(' ')} — including the ones relevant to this post (respect the platform's typical count). NEVER invent, alter, translate or add any hashtag outside this set.`;
  }
  return out.trim();
}

// Solo le piattaforme usate in questo batch, così il writer dimensiona ogni caption sulla sua
// rete invece di riusare un unico blurb. '' quando nessuna ha guidance.
export function platformPlaybook(platforms: string[], prefs: ContentPrefs): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const p of platforms) {
    const key = platformKey(p);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const g = guidanceFor(p, prefs);
    if (g) lines.push(`- ${g}`);
  }
  return lines.length
    ? `\nPLATFORM PLAYBOOK (write each caption to fit its platform's length and register — do NOT write the same short blurb for every platform; in particular LinkedIn must be long-form, not one or two sentences):\n${lines.join('\n')}\n`
    : '';
}

// Pavimento di qualità su ogni caption. Quando il brand ha una personalità approvata, quella
// GUIDA: un unico registro d'agenzia per tutti appiattisce i feed in cloni.
const HOUSE_BAR = `HOUSE BAR — quality floor only (never change the LANGUAGE or any facts):
Kill every marketing cliché and hype word ("unlock", "elevate", "game-changer", "level up", "dive in", "in today's fast-paced world", "we're thrilled/excited to", "say goodbye to"). If a line could run verbatim on any other brand's feed, rewrite it sharper and more specific to THIS brand. Stay kind toward the customer — never smug or mean. Prefer concrete detail over abstract claims.
HASHTAG: solo tag di nicchia in cui il brand compete davvero. Mai tag acchiappa-reach (#viral, #fyp, #perte, #explorepage, #instagood, #followforfollow): portano un pubblico che non ha nessun rapporto con il brand e sulle piattaforme attuali sono un segnale di spam, non di distribuzione. Meglio tre tag specifici che dieci generici.

${PROOF_DISCIPLINE_RULE}`;

const HOUSE_VOICE_DEFAULT = `HOUSE VOICE — apply on top of the brand's voice when no explicit personality is set (never change the LANGUAGE or any facts):
write with a fairly cynical, faintly world-weary edge and a genuinely original point of view. Wit is bone-dry and ALWAYS subtle — deadpan understatement and clever turns, never puns, slapstick, emoji-spam or exclamation-mark hype. Be confident and a little unimpressed by the usual noise, but never smug or mean toward the customer.
${HOUSE_BAR}`;

/** Prefer brand personality over the default dry house register. */
export function houseVoiceFor(prefs: ContentPrefs = {}): string {
  const personality = prefs.personality?.trim();
  if (personality) {
    return `BRAND PERSONALITY (authoritative — this is how the brand sounds; do NOT overwrite it with a generic agency cynicism): ${personality}
${HOUSE_BAR}
Wit and register must follow the personality above — only use dry/cynical edge when that personality asks for it.`;
  }
  return HOUSE_VOICE_DEFAULT;
}
