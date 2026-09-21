-- LE TABELLE CHE NESSUN CODICE RAGGIUNGIBILE SCRIVE PIÙ, DETTE DOVE SI RITROVANO.
--
-- Trentaquattro tabelle su 157 hanno zero righe, e «vuota» da sola non dice niente di utile:
-- `radar_jobs` ha 530 inserimenti storici ed è vuota perché è una CODA — vuota significa «niente
-- in attesa adesso» — e `org_usage` è vuota perché nessuno ha ancora sfiorato il tetto dei
-- crediti, mentre `credits.ts` ci scrive il claim anti-spam degli avvisi. Marcarle morte sarebbe
-- una bugia che il prossimo lettore paga.
--
-- IL CRITERIO È UN ALTRO: esiste codice che ci scrive, e quel codice è raggiungibile da un
-- percorso vivo? Delle trentaquattro, trentadue hanno un writer che una rotta o un cron chiama.
-- Restano queste due, e per ciascuna la prova è che il suo unico scrittore non ha più chiamanti.
--
-- PERCHÉ UN COMMENTO E NON UN DROP. Qui i deploy non eseguono le migrazioni, quindi una tabella
-- tolta dal file e presente in produzione è pura divergenza; e una tabella che torna utile si
-- ripopola, mentre una cancellata si riscrive. `COMMENT ON TABLE` è metadato puro: non può
-- rompere una query, una policy o una foreign key, e `obj_description` lo interroga.
--
-- IL FORMATO È UNO SOLO, e questa è la ragione per cui la forma sta scritta qui:
--
--   DEPRECATED <YYYY-MM-DD>: <perché è morta>. <cosa usare al suo posto, o che non c'è nulla>.
--
-- Un commento in prosa libera non si può interrogare — chi vuole sapere quante tabelle sono
-- deprecate finisce a leggerle una per una. Con una forma sola la domanda è una `like`.
-- Scartato: una tabella `deprecated_tables` con le righe, che sarebbe un secondo posto dove la
-- stessa verità invecchia per conto suo, e uno schema `graveyard` in cui spostarle, che rompe
-- ogni foreign key per ottenere quello che un commento ottiene senza toccare un dato.
--
-- `src/lib/server/deprecated-tables.test.ts` tiene l'elenco: toglierne una è togliere una riga
-- da lì, quindi si vede nel diff invece di accadere in silenzio.

-- I suoi due scrittori sono `agent_kit_wait_for_approval` e `decide_agent_kit_approval`, funzioni
-- plpgsql che nessun `.rpc(...)` chiama da `98b18453`: la UI delle approvazioni è uscita e
-- `20260905120000_secdef_least_privilege.sql` ha già revocato l'execute a `authenticated`
-- proprio perché la tabella è vuota e nessuno la raggiunge.
comment on table public.agent_kit_approval_requests is
  'DEPRECATED 2026-09-21: le funzioni che la scrivevano non hanno piu chiamanti da quando la UI delle approvazioni e uscita. Nessun sostituto: le approvazioni dei tool passano dal turno in corso.';

-- Nata con `0108_post_design.sql` insieme a `posts.design`, che invece è vivo. Dei due solo la
-- colonna ha trovato un lettore: della tabella non esiste una sola `.from('brand_design_templates')`
-- in tutto l'albero, né un `.rpc` che la sfiori. Il design di un post vive nel post.
comment on table public.brand_design_templates is
  'DEPRECATED 2026-09-21: nessun codice la legge o la scrive dalla 0108 che la crea. Il design di un post vive in posts.design.';
