import { clampParams } from './clamp';
import type { LayoutParam, LayoutParams, Transform } from './types';

export const params: LayoutParam[] = [
  { name: 'columns', label: 'Colonne', kind: 'range', min: 2, max: 6, step: 1, default: 3 },
  { name: 'rows', label: 'Righe visibili', kind: 'range', min: 2, max: 8, step: 1, default: 3 },
  { name: 'gapX', label: 'Spazio orizzontale', kind: 'range', min: 1, max: 6, step: 0.1, default: 2.7 },
  { name: 'gapY', label: 'Spazio verticale', kind: 'range', min: 1, max: 6, step: 0.1, default: 2.3 },
  { name: 'slant', label: 'Obliquità', kind: 'range', min: -0.6, max: 0.6, step: 0.02, default: 0.18 },
  { name: 'speed', label: 'Velocità', kind: 'range', min: -2, max: 2, step: 1, default: 1 },
  { name: 'scale', label: 'Scala', kind: 'range', min: 0.2, max: 2, step: 0.05, default: 0.92 }
];

export function transforms(count: number, rawParams: LayoutParams, t: number): Transform[] {
  if (count <= 0) {
    return [];
  }

  const values = clampParams(params, rawParams);
  const columns = Math.round(Number(values.columns));
  const rows = Math.round(Number(values.rows));
  const gapX = Number(values.gapX);
  const gapY = Number(values.gapY);
  const slant = Number(values.slant);
  const baseSpeed = Number(values.speed);
  const scale = Number(values.scale);
  const totalHeight = rows * gapY;

  return Array.from({ length: count }, (_, index) => {
    const column = Math.floor(index / rows) % columns;
    const row = index % rows;
    const columnSpeed = baseSpeed * (1 + column % 2);
    const phase = modulo(row / rows + t * columnSpeed, 1);
    const y = (phase - 0.5) * totalHeight;
    const edgeDistance = Math.abs(phase - 0.5) * 2;
    const centeredColumn = column - (columns - 1) / 2;

    return {
      position: {
        x: centeredColumn * gapX + y * slant,
        y,
        z: -Math.abs(centeredColumn) * 0.12
      },
      rotation: { x: 0, y: 0, z: -slant * 0.45 },
      scale: { x: scale, y: scale, z: scale },
      opacity: edgeOpacity(edgeDistance)
    };
  });
}

function edgeOpacity(distance: number): number {
  const progress = Math.min(1, Math.max(0, (distance - 0.72) / 0.28));
  return 1 - progress * progress * (3 - 2 * progress);
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
