/**
 * LE SKILL DI DEFAULT DEL PRODOTTO — definite in codice, non seminate per brand.
 *
 * Il meccanismo delle skill (brand_memory, category='skill') esisteva completo — cap, indice,
 * sintesi, decadimento — ma al 22/8/2026 la produzione aveva ZERO righe skill su 1181 memorie:
 * una libreria mai riempita. Queste sono le prime skill che la riempiono, e vivono qui invece
 * che nel database per tre ragioni che sono la stessa ragione:
 *
 *  1. Non sono conoscenza DEL brand: sono tecnica del prodotto. Seminarle in ogni brand
 *     significherebbe N copie che invecchiano separatamente e consumano il cap (20) che
 *     appartiene alle procedure che il brand impara davvero.
 *  2. Si aggiornano col deploy, come craft.ts e il ricettario da cui citano il codice —
 *     nessuna migration, nessuna riconciliazione.
 *  3. Il contratto resta identico a una skill scritta dall'utente: trigger nell'indice del
 *     prompt (buildMemoryContext), corpo completo da read_memory(category="skill").
 *
 * LA REGOLA CHE QUESTO FILE NON PUÒ DIMENTICARE: una conoscenza vale solo se ha il suo
 * controllo in codice. Ogni skill dichiara in `gate` il check che rifiuta l'imitazione
 * (o dichiara esplicitamente di essere un consiglio giudicato dalla QC sui frame, quando un
 * check statico non esiste). Il test di questo file verifica la coppia skill↔gate su un caso
 * sbagliato: se il gate smette di bocciare, il test lo dice.
 *
 * IL CODICE NON STA QUI. Il ricettario intero arriva agli agenti che scrivono TSX come file
 * (`how/MAKE-MOTION-VIDEO.md`, composto in agent-files.ts da `MOTION_CRAFT_SPECS` +
 * `MOTION_TRANSITIONS_COOKBOOK_PROMPT`): una skill che ne incollasse di nuovo gli snippet sarebbe
 * la seconda copia che diverge — il difetto che questo sistema esiste per evitare. Le skill
 * restano quello che il ricettario non è: la PROCEDURA e il nome del gate che la rende
 * vincolante. Il codice si cita per nome, e il nome sta nel file.
 */
import { MOTION_STASIS_MAX_GAP_S } from '$lib/motion-video/easing';
import { VOICE_COVERAGE_MIN, VOICE_END_MARGIN_S } from '$lib/motion-video/voice-gate';

export type DefaultSkill = {
	/** Slug stabile — è l'id che il modello cita e che read_memory restituisce. */
	key: string;
	/** Prima riga "Use when …", poi i passi. Stesso contratto delle skill utente. */
	value: string;
	/**
	 * Gli agenti che vedono il trigger nell'indice del prompt. `null` = tutti. Un agente
	 * sconosciuto/legacy (null) vede tutto — è il set pieno di tool, può eseguire tutto.
	 */
	agents: readonly string[] | null;
	/**
	 * Il controllo in codice che rende la skill vincolante, per chi legge e per il test.
	 * 'qc_review' = nessun check statico: giudicata dalla QC sui frame renderizzati.
	 */
	gate: string;
	/** Voci del ricettario citate nel corpo — il test verifica che esistano davvero. */
	refs: readonly string[];
};

/** Gli hub che scrivono sorgente Remotion (chat): il Motion Specialist e il Content maker. */
const MOTION_WRITERS = ['motion', 'content'] as const;

export const DEFAULT_SKILLS: readonly DefaultSkill[] = [
	{
		key: 'motion-voiceover-fit',
		agents: MOTION_WRITERS,
		gate: 'assertMotionVoiceGate (render_motion_video refuses: piece_exceeds_beat, voice_past_end, coverage, truncated tail)',
		refs: [],
		value: `Use when a motion video has (or should have) a voice-over.
1. Write every spoken line first, then call generate_voiceover ONCE with all of them — separate generations come back as different voices.
2. Cut the take with cut_voiceover at the pause timestamps the tool returned — never guess seconds. A clip that does not match its line: cut again, it is free.
3. Place each clip inside the <Sequence> of the beat that speaks it. The beat must be at least as long as its clip (the tool gives you frames) — lengthen the beat, and durationInFrames, never trim the words.
4. Clips never overlap, not by one frame: a clip starting at frame F lasting D occupies F..F+D; the next starts at F+D or later. Beats that overlap for a transition SHARE frames — push the clip in by at least the transition length.
5. The last spoken word must end at least ${VOICE_END_MARGIN_S}s before the video ends, and at least ${Math.round(VOICE_COVERAGE_MIN * 100)}% of the take must actually be placed — beats left silent while the script exists are thrown-away lines.
6. If the lines do not fit the target length, RAISE durationInFrames and say so in one line. A video a few seconds long is invisible; a line cut off mid-word is the first thing anyone notices.
ENFORCED IN CODE: the render is refused by the voice gate on any of these (a clip exceeding its beat, voice past the end margin, low take coverage, a clip cut mid-word). Working around the wording does not ship.`
	},
	{
		key: 'motion-alive-scenes',
		agents: MOTION_WRITERS,
		gate: 'findStaticTails + findLinearMotion (finish refused); stagger step checked by detectWowMechanisms',
		refs: ['STAGGER_REVEAL'],
		value: `Use when writing or reviewing any motion-video beat (Remotion TSX).
1. Something moves in EVERY frame: give each beat a slow drift/pan/breathing accent whose interpolate input range runs to the beat's LAST frame — through the exit transition included.
2. If every interpolation ends more than ~${MOTION_STASIS_MAX_GAP_S}s before the beat ends, the beat is a freeze-frame with an intro. Extend an input range; do not bolt on a new element.
3. A GROUP (list rows, cards, badges, bullet lines) never enters on one frame: per-index delay of 0.15–0.35s that shifts the interpolate clock (interpolate(frame - delay, ...)), and the group keeps drifting until the beat's end. Copy the STAGGER_REVEAL pattern below.
4. Every interpolate carries an easing (expo in-out for travel, overshoot only on the last pose) and clamps both sides — an interpolate with NO easing field IS linear, and linear is the defect.
ENFORCED IN CODE: finish is refused on static tails and on linear interpolates (the input ranges are read from your TSX). A stagger with step 0, or a cascade that freezes after entering, fails QC — the marker comment alone counts as nothing.
The code: STAGGER_REVEAL, in the TRANSITIONS COOKBOOK already in your prompt. Copy it from there.`
	},
	{
		key: 'motion-screenshot-legibility',
		agents: MOTION_WRITERS,
		gate: 'qc_review',
		refs: ['SCRIM_PLATE', 'MASK_REVEAL_TYPE', 'FULL_CANVAS_SCALE'],
		value: `Use when text sits over a screenshot or photo, or a beat swaps one screenshot for another.
1. A screenshot is the busiest texture there is — it is full of its own text. Display type over it needs a scrim it actually WINS against: a plate/band at ≥ 0.65 alpha under the text (SCRIM_PLATE pattern below), or the screenshot dimmed to ≤ 0.35 opacity over a solid ground. A 0.2 wash is decoration, not a scrim.
2. The scrim animates WITH its text: same window, same easing. A scrim that pops in after its headline is a flash of unreadable frames.
3. NEVER crossfade two full-bleed screenshots — for the overlap the viewer sees both interfaces at once, the single ugliest frame a product video can produce. Swap behind a cut, a slide, a mask (MASK_REVEAL_TYPE) or a full-canvas move (FULL_CANVAS_SCALE); never through opacity.
4. Contrast intent, WCAG-shaped: ≥ 4.5:1 for body/UI text, ≥ 3:1 for display type. If you cannot say which pixels sit behind a line, it needs a scrim.
JUDGED, NOT STATICALLY GATED: QC watches the rendered frames — legibility is a scored dimension and fails the review — but no source check can see pixels. The stills are the gate; render them (render_stills, or the storyboard render_motion_video hands you) and look.
The code: SCRIM_PLATE, MASK_REVEAL_TYPE and FULL_CANVAS_SCALE, in the TRANSITIONS COOKBOOK already in your prompt. Copy them from there.`
	},
	{
		key: 'motion-transition-mechanism',
		agents: MOTION_WRITERS,
		gate: 'detectWowMechanisms (craft QC fails a 4+ beat composition without the code shapes; the // wow: marker alone is ignored)',
		refs: ['MATCH_CUT_DOT', 'ELEMENT_CARRYOVER', 'SCENE_SHRINK_TO_DOT', 'FULL_CANVAS_SCALE', 'MASK_REVEAL_TYPE', 'WORD_ZOOM_CUT'],
		value: `Use when a motion video has 4 or more beats.
1. Ready-made presentations (slide/iris/wipe) are the FLOOR. A 4+ beat composition must ALSO contain at least ONE match-cut / shared-element transition (MATCH_CUT_DOT, ELEMENT_CARRYOVER or SCENE_SHRINK_TO_DOT) and at least ONE full-canvas scale move (FULL_CANVAS_SCALE, MASK_REVEAL_TYPE or WORD_ZOOM_CUT). slide() between every beat is the named failure: a slideshow with easing.
2. Copy the closest cookbook entry and adapt copy, palette and coordinates — do not re-invent the mechanism. Keep its \`// wow:\` marker comment.
3. The marker is NOT the mechanism: a marker on a plain fade, a scale that only travels 1→0.94, or a "carryover" whose only flight is the cursor counts as nothing. The element must actually cross the cut; the scale must blow past the camera (≥ 2.5×) or collapse to a point (≤ 0.08).
4. Pick the transform-origin / collapse point from the ELEMENT that motivates the cut — a badge, a word, the logo — never the geometric centre by default.
ENFORCED IN CODE: QC reads the TSX and fails a 4+ beat composition without these code shapes, marker or no marker.
The code for every mechanism named here is in the TRANSITIONS COOKBOOK already in your prompt — MATCH_CUT_DOT, ELEMENT_CARRYOVER, SCENE_SHRINK_TO_DOT, FULL_CANVAS_SCALE, MASK_REVEAL_TYPE, WORD_ZOOM_CUT. Copy the closest one from there.`
	},
];

/** Le skill di default visibili a un agente ('motion', 'content', …). Null/undefined = tutte. */
export function defaultSkillsFor(agent?: string | null): readonly DefaultSkill[] {
	if (!agent) return DEFAULT_SKILLS;
	return DEFAULT_SKILLS.filter((s) => !s.agents || s.agents.includes(agent));
}

/**
 * Le skill di default nella forma che read_memory restituisce. Id prefissato `builtin:` così
 * nessuno le passa a recordMemoryUsage (che aggiorna per uuid) e il modello capisce che
 * remove_memory non le tocca — si aggiornano col deploy, non con un tool.
 */
export function defaultSkillEntries(agent?: string | null) {
	return defaultSkillsFor(agent).map((s) => ({
		id: `builtin:${s.key}`,
		category: 'skill' as const,
		key: s.key,
		value: s.value,
		source: 'system' as const,
		layer: 'project' as const,
		confidence: 1,
		pinned: false
	}));
}
