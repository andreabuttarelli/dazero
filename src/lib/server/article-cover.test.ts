import { describe, expect, it } from 'vitest';
import { coverStoragePath } from './article-cover';

describe('il path di una copertina dentro il suo URL pubblico', () => {
  it('riconosce un URL del bucket `media` e ne estrae la chiave', () => {
    expect(
      coverStoragePath('https://kszazivzwievqixcnanp.supabase.co/storage/v1/object/public/media/u1/blog/cover-a.png')
    ).toBe('u1/blog/cover-a.png');
  });

  it('non estrae niente da un URL di un ALTRO bucket', () => {
    expect(
      coverStoragePath('https://x.supabase.co/storage/v1/object/public/wall/tiktok/a.webp')
    ).toBe(null);
  });

  it('non estrae niente da un URL esterno, che è di qualcun altro', () => {
    expect(coverStoragePath('https://images.unsplash.com/photo-123.jpg')).toBe(null);
    expect(coverStoragePath('https://cdn.example.com/storage/v1/object/public/media/x.png')).toBe(null);
  });

  it('non estrae niente da un valore vuoto o non-stringa', () => {
    expect(coverStoragePath(null)).toBe(null);
    expect(coverStoragePath('')).toBe(null);
    expect(coverStoragePath(42 as never)).toBe(null);
  });

  it('non restituisce un path vuoto quando l\'URL finisce sul bucket', () => {
    expect(coverStoragePath('https://x.supabase.co/storage/v1/object/public/media/')).toBe(null);
  });
});
