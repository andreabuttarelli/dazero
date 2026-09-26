import { describe, expect, it } from 'vitest';
import type { Tool } from 'ai';
import { fakeDb } from '$lib/server/db/fake-db';
import { createProjectTools } from './project-tools';
import { projectToolSurface } from './tool-surface';

const ORG = '11111111-1111-1111-1111-111111111111';
const PROJECT = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';

const brandTool = (name: string) => ({ description: name }) as Tool;

function projectTools() {
  const { db } = fakeDb({});
  return createProjectTools({ db, orgId: ORG, projectId: PROJECT, userId: USER });
}

const BRAND_CATALOG = {
  create_post: brandTool('create_post'),
  query: brandTool('query'),
  insert_row: brandTool('insert_row')
};

/**
 * IL PRODOTTO È AGNOSTICO AL BRAND. Un tool di brand senza brand è un tool che promette e fallisce:
 * il modello lo vedrebbe, ci proverebbe, e il turno si riempirebbe di rifiuti. Meglio assente.
 */
describe('la superficie del modello mostra solo ciò che può usare', () => {
  it('senza brand i tool di brand non ci sono', () => {
    const surface = projectToolSurface(projectTools(), null);
    const names = Object.keys(surface);

    expect(names).not.toContain('create_post');
    expect(names).not.toContain('query');
    expect(names).not.toContain('insert_row');
  });

  it('senza brand i tool di progetto e tela restano tutti', () => {
    const surface = projectToolSurface(projectTools(), null);
    const names = Object.keys(surface);

    expect(names).toEqual(
      expect.arrayContaining([
        'list_canvases',
        'list_nodes',
        'create_node',
        'update_node',
        'move_node',
        'connect_nodes',
        'delete_node',
        'list_assets',
        'run_node',
        'list_runs'
      ])
    );
    expect(names).toHaveLength(10);
  });

  it('col brand i tool di brand ci sono, accanto a quelli di progetto', () => {
    const surface = projectToolSurface(projectTools(), BRAND_CATALOG);
    const names = Object.keys(surface);

    expect(names).toContain('create_post');
    expect(names).toContain('query');
    expect(names).toContain('list_nodes');
    expect(names).toContain('run_node');
  });

  it('il brand non toglie nessun tool di progetto', () => {
    const without = Object.keys(projectToolSurface(projectTools(), null)).sort();
    const withBrand = Object.keys(projectToolSurface(projectTools(), BRAND_CATALOG)).sort();

    for (const name of without) {
      expect(withBrand).toContain(name);
    }
  });
});
