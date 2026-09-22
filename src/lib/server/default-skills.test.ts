import { describe, it, expect } from 'vitest';
import { DEFAULT_SKILLS, defaultSkillEntries, defaultSkillsFor } from './default-skills';
import { TRANSITIONS_COOKBOOK, detectWowMechanisms } from '$lib/motion-video/transitions-cookbook';
import { compileMotionSource } from '$lib/motion-video/compile';
import { findStaticTails } from '$lib/motion-video/easing';
import { checkVoicePlacement } from '$lib/motion-video/voice-gate';

/**
 * La regola di questo file: una skill vale solo se il gate che dichiara boccia davvero il caso
 * sbagliato. Ogni skill è verificata in coppia col suo controllo; se il controllo smette di
 * rifiutare, il test lo dice — non il prossimo video in produzione.
 */

describe('default skills — form', () => {
	it('every skill opens with a "Use when" trigger line and has a unique slug key', () => {
		const keys = new Set<string>();
		for (const s of DEFAULT_SKILLS) {
			expect(s.value.split('\n')[0], s.key).toMatch(/^Use when /);
			expect(s.key).toMatch(/^[a-z0-9-]+$/);
			expect(keys.has(s.key), `duplicate key ${s.key}`).toBe(false);
			keys.add(s.key);
			// Il corpo si legge on demand (read_memory), ma resta un tool result: tetto largo.
			expect(s.value.length, s.key).toBeLessThan(8000);
		}
	});

	it('every cookbook entry a skill cites actually exists', () => {
		const names = new Set(TRANSITIONS_COOKBOOK.map((e) => e.name));
		for (const s of DEFAULT_SKILLS) {
			for (const ref of s.refs) {
				expect(names.has(ref), `${s.key} cites unknown cookbook entry ${ref}`).toBe(true);
				expect(s.value, `${s.key} lists ${ref} in refs but never mentions it`).toContain(ref);
			}
		}
	});

	it('every embedded tsx snippet compiles as-is — a skill must never teach broken code', () => {
		for (const s of DEFAULT_SKILLS) {
			for (const m of s.value.matchAll(/```tsx\n([\s\S]*?)```/g)) {
				expect(() => compileMotionSource(m[1]), s.key).not.toThrow();
			}
		}
	});
});

describe('default skills — scoping and read_memory shape', () => {
	it('shows each craft only to the agents that can execute it', () => {
		const keys = (agent: string | null) => defaultSkillsFor(agent).map((s) => s.key);
		expect(keys('content')).toHaveLength(DEFAULT_SKILLS.length);
		expect(keys('motion').every((k) => k.startsWith('motion-'))).toBe(true);
		expect(keys('motion').length).toBeGreaterThan(0);
		expect(defaultSkillsFor('analyst')).toHaveLength(0);
		expect(defaultSkillsFor('web')).toHaveLength(0);
		expect(defaultSkillsFor('ugc')).toHaveLength(0);
		// Agente null/legacy = set pieno di tool: vede tutto.
		expect(defaultSkillsFor(null)).toHaveLength(DEFAULT_SKILLS.length);
	});

	it('entries carry builtin: ids so nothing routes them into recordMemoryUsage or remove_memory', () => {
		for (const e of defaultSkillEntries()) {
			expect(e.id).toMatch(/^builtin:/);
			expect(e.category).toBe('skill');
			expect(e.source).toBe('system');
		}
	});
});

describe('default skills — each declared gate refuses the wrong case', () => {
	it('motion-voiceover-fit: a clip longer than its beat is a placement violation', () => {
		const src = `
const BeatOne = () => (
	<AbsoluteFill>
		<Audio src="https://x.supabase.co/storage/v1/object/public/voiceover/line-1.wav" />
	</AbsoluteFill>
);
export default function V() {
	return (
		<Series>
			<Series.Sequence durationInFrames={60}><BeatOne /></Series.Sequence>
		</Series>
	);
}`;
		const found = checkVoicePlacement(
			src,
			[{ url: 'https://x.supabase.co/storage/v1/object/public/voiceover/line-1.wav', seconds: 5 }],
			{ fps: 30, durationInFrames: 300 }
		);
		expect(found.map((v) => v.rule)).toContain('piece_exceeds_beat');
	});

	it('motion-alive-scenes: a beat whose interpolations all end early is a static tail', () => {
		const frozen = `
export const fps = 30;
function BeatHook() {
	const frame = useCurrentFrame();
	const rise = interpolate(frame, [0, 24], [40, 0], { easing: E });
	return <div style={{ transform: 'translateY(' + rise + 'px)' }} />;
}
export default function V() {
	return (
		<Series>
			<Series.Sequence durationInFrames={5 * fps}><BeatHook /></Series.Sequence>
		</Series>
	);
}`;
		expect(findStaticTails(frozen).length).toBeGreaterThan(0);
	});

	it('motion-alive-scenes: the STAGGER_REVEAL marker with no per-index delay counts as nothing', () => {
		const watered = `// wow: STAGGER_REVEAL
export const fps = 30;
const rows = items.map((item, index) => {
	const o = interpolate(frame, [0, 10], [0, 1], { easing: E });
	return <div style={{ opacity: o }} />;
});`;
		expect(detectWowMechanisms(watered).stagger).toBe(false);
	});

	it('motion-transition-mechanism: 4 slide-only beats have no wow mechanism in source', () => {
		const slideshow = `
export const fps = 30;
export default function V() {
	return (
		<TransitionSeries>
			<TransitionSeries.Sequence durationInFrames={3 * fps}><A /></TransitionSeries.Sequence>
			<TransitionSeries.Transition presentation={slide({ direction: 'from-right' })} timing={t} />
			<TransitionSeries.Sequence durationInFrames={3 * fps}><B /></TransitionSeries.Sequence>
			<TransitionSeries.Transition presentation={slide({ direction: 'from-right' })} timing={t} />
			<TransitionSeries.Sequence durationInFrames={3 * fps}><C /></TransitionSeries.Sequence>
			<TransitionSeries.Transition presentation={slide({ direction: 'from-right' })} timing={t} />
			<TransitionSeries.Sequence durationInFrames={3 * fps}><D /></TransitionSeries.Sequence>
		</TransitionSeries>
	);
}`;
		const wow = detectWowMechanisms(slideshow);
		expect(wow.beats).toBeGreaterThanOrEqual(4);
		expect(wow.fullCanvasScale).toBe(false);
		expect(wow.sharedElement).toBe(false);
	});

	// Il codice non è più incollato nella skill (sta nel ricettario, che il prompt dei due agenti
	// Remotion porta intero): la skill lo cita per NOME. Quindi il test verifica la coppia vera —
	// ogni nome che la skill promette come match-cut passa davvero il gate che quel nome deve
	// passare. Una voce rinominata o annacquata nel ricettario fa fallire qui, non in produzione.
	it('motion-transition-mechanism: every mechanism the skill names passes the gate it promises', () => {
		const skill = DEFAULT_SKILLS.find((s) => s.key === 'motion-transition-mechanism')!;
		const entry = (name: string) => TRANSITIONS_COOKBOOK.find((e) => e.name === name)!.code;
		for (const name of ['MATCH_CUT_DOT', 'ELEMENT_CARRYOVER', 'SCENE_SHRINK_TO_DOT']) {
			expect(skill.value, `skill no longer names ${name}`).toContain(name);
			expect(detectWowMechanisms(entry(name)).sharedElement, name).toBe(true);
		}
		for (const name of ['FULL_CANVAS_SCALE', 'MASK_REVEAL_TYPE', 'WORD_ZOOM_CUT']) {
			expect(skill.value, `skill no longer names ${name}`).toContain(name);
			expect(detectWowMechanisms(entry(name)).fullCanvasScale, name).toBe(true);
		}
	});

	it('motion-screenshot-legibility declares itself judged, not statically gated', () => {
		// Nessun check statico vede i pixel: la skill lo dice, e questo test è il promemoria che
		// se un giorno il gate statico arriva, la dichiarazione va aggiornata.
		const skill = DEFAULT_SKILLS.find((s) => s.key === 'motion-screenshot-legibility')!;
		expect(skill.gate).toBe('qc_review');
		expect(skill.value).toContain('JUDGED, NOT STATICALLY GATED');
	});
});
