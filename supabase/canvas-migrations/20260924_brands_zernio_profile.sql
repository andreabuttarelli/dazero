-- Un brand pubblica attraverso UN profilo Zernio: le credenziali OAuth di ogni account collegato
-- vivono lì, non da noi (CLAUDE.md, "Zernio è la fonte di verità"). Il connect pipeline aveva
-- bisogno di un posto dove trovarlo di nuovo, e scriveva `brands.zernio_profile_id` — colonna che
-- sullo schema nuovo non esiste (schema-drift-check.mjs, `brands.zernio_profile_id` fra le assenti
-- di 0001_foundations.sql). Risultato: ogni tentativo di collegare un account falliva scrivendo su
-- una colonna fantasma, quindi nessun brand poteva pubblicare — il difetto che questa migration
-- chiude.
--
-- `social_accounts.zernio_profile_id` esiste già (0005_social_accounts.sql, mai applicata da
-- sola: la tabella è stata ricreata sullo schema nuovo con quella colonna dentro), ma serve un
-- profilo PRIMA che il primo account esista: `ensureBrandProfile` lo conia in coda a nessuna riga
-- social_accounts, quindi un puntatore per-account non basta a coniare il primo. Il profilo è
-- 1:1 col brand — ogni account che il brand collega pubblica attraverso lo stesso — quindi il
-- posto naturale è qui: una riga sola, mai una copia che può disallinearsi da un'altra.

begin;

alter table public.brands
  add column if not exists zernio_profile_id text;

-- Scritta SOLO dal codice server (service role), mai da una sessione utente: è l'identità con cui
-- il brand pubblica, e un valore forgiato da un membro org dirotterebbe la pubblicazione sul
-- profilo Zernio di qualcun altro. Stesso posto unico del vincolo, non un `if` sparso in ogni
-- rotta che tocca `brands`.
create or replace function public.guard_brands_zernio_profile_id() returns trigger
  language plpgsql as $$
begin
  if new.zernio_profile_id is distinct from old.zernio_profile_id and auth.role() <> 'service_role' then
    raise exception 'zernio_profile_id is server-managed' using errcode = '42501';
  end if;
  return new;
end; $$;

drop trigger if exists trg_guard_brands_zernio_profile_id on public.brands;
create trigger trg_guard_brands_zernio_profile_id
  before update on public.brands
  for each row execute function public.guard_brands_zernio_profile_id();

commit;
