export const GLYPH_SIZE = 5;

const BLANK = ['00000', '00000', '00000', '00000', '00000'];

const DOT = ['00000', '00000', '00100', '00000', '00000'];

const COLON = ['00000', '00100', '00000', '00100', '00000'];

const DASH = ['00000', '00000', '11111', '00000', '00000'];

const PLUS = ['00000', '00100', '01110', '00100', '00000'];

const AT = ['11111', '10001', '10101', '10011', '11111'];

const HASH = ['01010', '11111', '01010', '11111', '01010'];

const PERCENT = ['10001', '00010', '00100', '01000', '10001'];

const GLYPHS: Record<string, string[]> = {
	' ': BLANK,
	'.': DOT,
	':': COLON,
	'-': DASH,
	'+': PLUS,
	'@': AT,
	'#': HASH,
	'%': PERCENT
};

export function glyphFor(char: string): string[] {
	return GLYPHS[char] ?? BLANK;
}
