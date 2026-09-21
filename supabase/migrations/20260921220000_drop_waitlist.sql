-- LA BETA CHIUSA NON ESISTE PIÙ: via il cancello, la coda e chi la governava.
--
-- Il prodotto non si entra più dopo una call. `canEnter()` e `userCanEnter()` sono usciti dal
-- codice insieme a /waitlist, alla pagina di approvazione in /admin/users e al sollecito che
-- scriveva a chi aspettava. Queste righe sono ciò che quel codice chiamava.
--
-- PERCHÉ UN DROP E NON UN COMMENT. La regola di 20260921180000 — marcare invece di cancellare —
-- vale per una tabella il cui scrittore ha perso i chiamanti ma potrebbe riaverli. Qui la
-- funzionalità è stata rimossa, non sospesa: non resta un lettore, un writer o una rotta da
-- ripristinare, e lasciare il cancello in piedi significa che il prossimo che legge lo schema va
-- a cercare il codice che lo interroga, e non lo trova.
--
-- `profiles.approved_at` RESTA, e non per dimenticanza: `accept_brand_invite` ci scrive ancora
-- (`coalesce(approved_at, now())`), quindi toglierla romperebbe l'accettazione di un invito —
-- che col cancello non c'entra nulla. La colonna sopravvive come data di ingresso; nessuno la
-- legge più per decidere chi passa.
--
-- L'ORDINE CONTA. `can_enter()` chiama `is_approved()`, che chiama `is_user_approved(uuid)`:
-- si tolgono dall'esterno verso l'interno, o il drop di quella interna trascina le altre in
-- cascata oppure fallisce per dipendenza, a seconda di come è stata creata.
--
-- I deploy NON eseguono le migration: applicare a mano.

drop function if exists public.can_enter();

drop function if exists public.is_approved();

drop function if exists public.is_user_approved(uuid);

-- Diceva a chi era in coda quanti si erano iscritti prima di lui. Senza coda non ha una domanda
-- a cui rispondere.
drop function if exists public.waitlist_position();

-- Le sue due policy e `nudged_at` se ne vanno col drop della tabella: non serve toglierle prima.
drop table if exists public.waitlist;

delete from public.app_flags where key in ('closed_beta', 'waitlist');
