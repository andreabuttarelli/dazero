import { describe, expect, it } from 'vitest';
import { PROJECT_BRAND_SHELL_SELECT, projectBrandShellOf } from './brand-shell';

/**
 * org_id era assente sia dal SELECT sia dalla forma restituita: ogni chiamante che aveva bisogno
 * dell'org del brand (billing, inviti, API key) leggeva `brand.org_id === undefined` in silenzio
 * — mai un errore, solo una query filtrata su un org_id che non esiste.
 */
describe('ProjectBrandShell porta org_id', () => {
	it('il SELECT chiede org_id', () => {
		expect(PROJECT_BRAND_SHELL_SELECT.split(',').map((s) => s.trim())).toContain('org_id');
	});

	it('projectBrandShellOf porta org_id nella riga a chi la chiama', () => {
		const shell = projectBrandShellOf({
			id: 'brand-1',
			org_id: 'org-1',
			name: 'Acme',
			slug: 'acme',
			website: null
		});

		expect(shell.org_id).toBe('org-1');
	});
});
