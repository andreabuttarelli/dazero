import { describe, expect, it } from 'vitest';
import {
  moveMediaUp,
  moveMediaDown,
  removeMedia,
  defaultScheduleTime,
  saveReasonFor,
  scheduleReasonFor,
  type ComposerReadiness
} from './create-post-composer';

describe('moveMediaUp', () => {
  it('sposta un elemento di una posizione più in alto', () => {
    expect(moveMediaUp(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
  });

  it('il primo elemento non si sposta oltre', () => {
    expect(moveMediaUp(['a', 'b', 'c'], 'a')).toEqual(['a', 'b', 'c']);
  });

  it('un id assente non cambia l\'ordine', () => {
    expect(moveMediaUp(['a', 'b', 'c'], 'z')).toEqual(['a', 'b', 'c']);
  });
});

describe('moveMediaDown', () => {
  it('sposta un elemento di una posizione più in basso', () => {
    expect(moveMediaDown(['a', 'b', 'c'], 'b')).toEqual(['a', 'c', 'b']);
  });

  it('l\'ultimo elemento non si sposta oltre', () => {
    expect(moveMediaDown(['a', 'b', 'c'], 'c')).toEqual(['a', 'b', 'c']);
  });

  it('un id assente non cambia l\'ordine', () => {
    expect(moveMediaDown(['a', 'b', 'c'], 'z')).toEqual(['a', 'b', 'c']);
  });
});

describe('removeMedia', () => {
  it('toglie l\'id indicato', () => {
    expect(removeMedia(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });

  it('un id assente non cambia niente', () => {
    expect(removeMedia(['a', 'b', 'c'], 'z')).toEqual(['a', 'b', 'c']);
  });
});

function localDatetimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

describe('defaultScheduleTime', () => {
  it('è un\'ora dopo now, nel formato di datetime-local', () => {
    const now = new Date(2026, 8, 24, 10, 0, 0);
    const expected = new Date(2026, 8, 24, 11, 0, 0);
    expect(defaultScheduleTime(now)).toBe(localDatetimeValue(expected));
  });

  it('avanza anche di giorno quando l\'ora attraversa la mezzanotte', () => {
    const now = new Date(2026, 8, 24, 23, 30, 0);
    const expected = new Date(2026, 8, 25, 0, 30, 0);
    expect(defaultScheduleTime(now)).toBe(localDatetimeValue(expected));
  });
});

const READY: ComposerReadiness = { hasBrand: true, hasContent: true, hasConnectedAccounts: true };

describe('saveReasonFor', () => {
  it('is null when a brand and content both exist', () => {
    expect(saveReasonFor(READY)).toBeNull();
  });

  it('asks for a brand first when both are missing', () => {
    expect(saveReasonFor({ ...READY, hasBrand: false, hasContent: false })).toBe('Create or pick a brand first.');
  });

  it('asks for content when only the brand is missing content', () => {
    expect(saveReasonFor({ ...READY, hasContent: false })).toBe('Add media or a caption first.');
  });

  it('ignores connected accounts', () => {
    expect(saveReasonFor({ ...READY, hasConnectedAccounts: false })).toBeNull();
  });
});

describe('scheduleReasonFor', () => {
  it('is null when everything is ready', () => {
    expect(scheduleReasonFor(READY)).toBeNull();
  });

  it('asks for a brand before accounts', () => {
    expect(scheduleReasonFor({ ...READY, hasBrand: false, hasConnectedAccounts: false })).toBe(
      'Create or pick a brand first.'
    );
  });

  it('asks for connected accounts once brand and content are ready', () => {
    expect(scheduleReasonFor({ ...READY, hasConnectedAccounts: false })).toBe(
      'Connect an account for this brand first.'
    );
  });
});
