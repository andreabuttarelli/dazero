import { describe, expect, it } from 'vitest';
import { projectAgentPrompt } from './system-prompt';

describe('il prompt dichiara lo scope, non un brand obbligatorio', () => {
  const project = { id: 'p1', name: 'Lancio autunno' };
  const canvases = [{ id: 'c1', name: 'Bozze' }];

  it('senza brand dice che i tool di pubblicazione non ci sono', () => {
    const prompt = projectAgentPrompt({ project, canvases, brand: null });

    expect(prompt).toContain('No brand is attached');
    expect(prompt).toContain('not available');
    expect(prompt).toContain('do not ask for a brand');
    expect(prompt).not.toContain('pass slug');
  });

  it('col brand nomina lo slug e perché è in scope', () => {
    const prompt = projectAgentPrompt({
      project,
      canvases,
      brand: { name: 'Acme', slug: 'acme' }
    });

    expect(prompt).toContain('Brand in scope: "Acme"');
    expect(prompt).toContain('pass slug "acme"');
    expect(prompt).toContain('publishing tools are available');
  });

  it('non inventa un bisogno di brand per lavorare sul progetto', () => {
    const prompt = projectAgentPrompt({ project, canvases, brand: null });

    expect(prompt).toContain('THIS project only');
    expect(prompt.toLowerCase()).not.toContain('you need a brand');
    expect(prompt.toLowerCase()).not.toContain('select a brand');
  });
});
