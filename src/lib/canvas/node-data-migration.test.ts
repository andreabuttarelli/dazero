import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NODE_TYPES, NODE_DATA_SCHEMAS } from './node-data';
import { SOCIAL_PLATFORMS } from './social-platforms';

const TYPE_MIGRATION_PATH = fileURLToPath(
  new URL('../../../supabase/canvas-migrations/20260925_effects_node.sql', import.meta.url)
);
const SHAPE_MIGRATION_PATH = fileURLToPath(
  new URL('../../../supabase/canvas-migrations/20260923_loop_nodes.sql', import.meta.url)
);

const typeMigration = readFileSync(TYPE_MIGRATION_PATH, 'utf8');
const shapeMigration = readFileSync(SHAPE_MIGRATION_PATH, 'utf8');

function checkBody(source: string, name: string): string {
  const start = source.indexOf(`add constraint ${name} check`);
  expect(start, `${name} missing from the latest migration`).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf(');', start));
}

describe('i CHECK sui nodi seguono il modello e lasciano nascere un nodo vuoto', () => {
  it('il CHECK sui tipi elenca ogni tipo del modello', () => {
    const typeCheck = checkBody(typeMigration, 'nodes_type_check');
    for (const type of NODE_TYPES) {
      expect(typeCheck).toContain(`'${type}'`);
    }
  });

  it('il CHECK sui dati non rende obbligatorio nessun campo: un nodo nasce vuoto e si riempie dopo', () => {
    const shapeCheck = checkBody(shapeMigration, 'nodes_data_shape_check');
    expect(shapeCheck).not.toMatch(/required/);
    expect(shapeCheck).toContain("jsonb_typeof(data) = 'object'");
  });

  it('gli enum del CHECK coincidono con quelli del modello', () => {
    const shapeCheck = checkBody(shapeMigration, 'nodes_data_shape_check');
    for (const platform of SOCIAL_PLATFORMS) {
      expect(shapeCheck).toContain(`'${platform}'`);
    }
    for (const kind of NODE_DATA_SCHEMAS.list.shape.item_kind.options) {
      expect(shapeCheck).toContain(`'${kind}'`);
    }
  });
});
