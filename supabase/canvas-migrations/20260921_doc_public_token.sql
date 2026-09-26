-- Doc pubblici: token, mai l'id (NEW_DATABASE_STRUCTURE.md, decisione 7).
-- Solo l'impronta SHA-256 resta sulla riga; il token in chiaro si mostra una volta sola.
-- L'indice parziale è unico: due documenti non possono condividere la stessa impronta, e la
-- lookup anonima per hash (rotta /d/[token]) è un index scan invece di una seqscan su nodes.

alter table public.nodes
  add column if not exists public_token_hash text,
  add column if not exists public_expires_at timestamptz;

create unique index if not exists nodes_public_token_hash_idx
  on public.nodes (public_token_hash)
  where public_token_hash is not null;
