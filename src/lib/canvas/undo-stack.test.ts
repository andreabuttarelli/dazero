import { describe, expect, it } from 'vitest';
import { createUndoStack } from './undo-stack';
import type { Gesture } from './undo-plan';

const gestureFor = (nodeId: string): Gesture => ({
  items: [{ kind: 'node.create', nodeId, after: { type: 'text' } }]
});

describe('createUndoStack: uno stack per scheda, undo e redo', () => {
  it('non ha niente da annullare o rifare appena creato', () => {
    const stack = createUndoStack();
    expect(stack.canUndo()).toBe(false);
    expect(stack.canRedo()).toBe(false);
    expect(stack.popUndo()).toBeNull();
    expect(stack.popRedo()).toBeNull();
  });

  it('un push rende il gesto disponibile a popUndo, in ordine LIFO', () => {
    const stack = createUndoStack();
    stack.push(gestureFor('a'));
    stack.push(gestureFor('b'));

    expect(stack.popUndo()).toEqual(gestureFor('b'));
    expect(stack.popUndo()).toEqual(gestureFor('a'));
    expect(stack.canUndo()).toBe(false);
  });

  it('popUndo NON sposta da solo nel redo: tocca a chi chiama, dopo la conferma del server', () => {
    const stack = createUndoStack();
    stack.push(gestureFor('a'));

    stack.popUndo();
    expect(stack.canRedo()).toBe(false);
  });

  it('pushRedo mette a disposizione di ⇧⌘Z il gesto che il SERVER ha restituito, non quello tolto', () => {
    const stack = createUndoStack();
    stack.push(gestureFor('a'));

    const popped = stack.popUndo()!;
    const fromServer: Gesture = { items: [{ kind: 'node.delete', nodeId: 'a', before: popped.items[0] }] };
    stack.pushRedo(fromServer);

    expect(stack.canRedo()).toBe(true);
    expect(stack.popRedo()).toEqual(fromServer);
  });

  it('pushUndo, il simmetrico dopo un redo riuscito', () => {
    const stack = createUndoStack();
    stack.push(gestureFor('a'));
    stack.popUndo();
    stack.pushRedo(gestureFor('a'));

    const popped = stack.popRedo()!;
    stack.pushUndo(popped);

    expect(stack.canUndo()).toBe(true);
    expect(stack.popUndo()).toEqual(popped);
  });

  it('un gesto nuovo svuota il redo: quel che era stato annullato non torna più con ⇧⌘Z', () => {
    const stack = createUndoStack();
    stack.push(gestureFor('a'));
    stack.popUndo();
    stack.pushRedo(gestureFor('a'));
    expect(stack.canRedo()).toBe(true);

    stack.push(gestureFor('b'));
    expect(stack.canRedo()).toBe(false);
    expect(stack.popRedo()).toBeNull();
  });
});
