# Quick Reference — dazero CLI

## Comandi rapidi

```bash
# Panoramica
dazero brands                              # Lista brand
dazero dashboard <slug>                    # Dashboard completa
dazero status <slug>                       # Status dettagliato

# Contenuti
dazero content <slug>                      # Tutti i post
dazero content <slug> --status pending     # Solo pending
dazero approve <slug> --all                # Approva tutti

# Post (editing)
dazero post <slug> <id>                    # Dettaglio post
dazero post <slug> <id> edit --caption "..."  # Modifica caption
dazero post <slug> <id> approve            # Approva
dazero post <slug> <id> reject             # Elimina
dazero post <slug> <id> publish            # Pubblica ora
dazero post <slug> <id> reschedule --scheduledFor "2026-06-20T10:00"

# Piano editoriale
dazero plan <slug>                         # Visualizza
dazero plan <slug> propose                 # Genera primo piano
dazero plan <slug> approve                 # Approva proposta
dazero plan <slug> discard                 # Scarta proposta
dazero plan <slug> revise --feedback "..." # Richiedi revisione
dazero plan <slug> save-brief --week 0 --brief "..."
dazero plan <slug> replan --week 0 --brief "..."

# Piano settimanale
dazero weekly-plan <slug>                  # Visualizza
dazero weekly-plan <slug> plan --week 0    # Genera seeds
dazero weekly-plan <slug> produce --week 0 # Produci post

# GTM
dazero gtm <slug>                          # GTM Roadmap

# Voice
dazero voice <slug>                        # Voice rules

# AI Chat

# Analytics
dazero analytics <slug>                    # Analytics
dazero calendar <slug>                     # Calendario
dazero calendar <slug> --month 2026-07     # Mese specifico

# Studio
dazero studio <slug>                       # Mostra tutto
dazero studio <slug> kit-update --about "..."
dazero studio <slug> colors --colors "#hex,#hex"
dazero studio <slug> add-note --text "..."
dazero studio <slug> people-add --name "..."
dazero studio <slug> people-generate --name "..." --gender female
dazero studio <slug> add-competitor --name "..."
dazero studio <slug> research              # Ricerca AI
dazero studio <slug> sync-history          # Sync social

# Web / SEO / GEO
dazero seo <slug>                          # Grade, iniziative, audit
dazero seo <slug> run|plan|more            # Audit / piano / altre iniziative
dazero seo <slug> asset|article --id <id>  # Genera da un'iniziativa
dazero geo <slug>                          # Share of voice, citazioni
dazero geo <slug> run|fix                  # Audit / genera fix
dazero keywords <slug> [refresh]           # Keyword strategy
dazero web <slug> [--status draft]         # Articoli blog
dazero web <slug> generate --topic "..."   # Nuovo articolo
dazero web <slug> optimize|publish --id <id>
dazero ads <slug>                          # Campagne + metriche paid
dazero ads <slug> --propose                # Proposte boost dai top post
dazero ads <slug> --remix                  # Remix competitor ads → brief creativi
dazero ads <slug> --approve <id> [--budget N]
dazero ads <slug> --pause <id>             # Pausa campagna (tutte le creatività)
dazero ads <slug> --resume <id>            # Riattiva campagna
dazero ads <slug> --pause <id> --ad <adId> # Pausa UNA creatività (A/B)
dazero ads <slug> --resume <id> --ad <adId>
dazero ads <slug> --duplicate <id>          # Copia in pausa → nuova proposta
dazero ads <slug> --delete <id>             # Elimina sulla piattaforma (storico ok)
dazero ads <slug> --create --name "..." --headline "..." [--platform metaads|googleads]
```

## Status post

| Status | Colore | Significato |
|--------|--------|-------------|
| `pending_user` | 🟡 Giallo | In attesa di approvazione |
| `approved` | 🔵 Blu | Approvato, in attesa di scheduling |
| `scheduled` | 🟢 Verde | Schedulato per pubblicazione |
| `published` | 🟢 Verde | Pubblicato |
| `failed` | 🔴 Rosso | Pubblicazione fallita |

## Pipeline autopilot

```
● Ricerca ─ ◉ Strategia ─ ○ Generazione ─ ○ Pubblicazione ─ ○ Analisi
```

- `●` Completato
- `◉` Fase corrente
- `○` Futuro

## Score completeness

| Score | Stato |
|-------|-------|
| 80-100% | Eccellente |
| 50-79% | Buono |
| 0-49% | Incompleto |
