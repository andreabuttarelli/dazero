import type { SupabaseClient, Session, User } from '@supabase/supabase-js';
import type { Db } from '$lib/server/db/client';

declare global {
  namespace App {
    interface Locals {
      supabase: SupabaseClient;
      safeGetSession: () => Promise<{ session: Session | null; user: User | null }>;
      session: Session | null;
      user: User | null;
      /**
       * Il client tipizzato sul database NUOVO, con il JWT dell'utente: Postgres valuta la RLS
       * riga per riga. Null quando non c'è una sessione — un percorso che lo vuole ha già
       * verificato che ci sia. `locals.supabase` resta accanto finché il vecchio schema vive.
       */
      db: () => Promise<Db | null>;
    }
    interface PageData {
      session: Session | null;
    }
    interface PageState {
      /**
       * Un foglio flottante aperto sopra la tela (Ads/Settings — Calendar quando torna, vedi
       * `src/lib/shell-nav.ts`), via shallow routing. `path` è l'URL che il foglio mostra; `data`
       * è quel che il `load` di quella rotta ha restituito — `preloadData` lo porta prima del
       * `pushState`, così il foglio non nasce vuoto.
       */
      sheet?: { path: string; data: Record<string, unknown> } | null;
    }
    // interface Error {}
    // interface Platform {}
  }
}

export {};
