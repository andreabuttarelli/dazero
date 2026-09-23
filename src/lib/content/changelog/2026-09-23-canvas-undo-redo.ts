import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-23',
  title: 'Undo and redo on the canvas',
  items: [
    'Cmd+Z (Ctrl+Z on Windows) now undoes your last change on the canvas — creating, deleting, editing, or connecting nodes — and Shift+Cmd+Z redoes it.',
    'Duplicating, pasting, connecting a selection, and batch-editing several nodes at once each undo in a single step.',
    'If someone else changed the same node in the meantime, undo is skipped with a clear message instead of silently overwriting their work.'
  ]
} satisfies ChangelogEntry;
