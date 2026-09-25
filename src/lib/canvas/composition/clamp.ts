import type { LayoutParam, LayoutParams } from './types';

export function clampParams(defs: LayoutParam[], params: LayoutParams): LayoutParams {
	const result: LayoutParams = {};

	for (const def of defs) {
		const value = params[def.name];
		result[def.name] = clampOne(def, value);
	}

	return result;
}

function clampOne(def: LayoutParam, value: unknown): number | string {
	if (def.kind === 'range') {
		const num = typeof value === 'number' ? value : def.default;
		return Math.min(def.max, Math.max(def.min, num));
	}

	if (def.kind === 'select') {
		return def.options.some((option) => option.value === value) ? (value as string) : def.default;
	}

	if (def.kind === 'color') {
		return typeof value === 'string' ? value : def.default;
	}

	return typeof value === 'number' ? value : def.default;
}
