# Quick Reference — dazero CLI

## Comandi rapidi

```bash
# Panoramica
dazero brands                              # Lista brand
dazero dashboard <slug>                    # Dashboard completa
dazero status <slug>                       # Status dettagliato
dazero health                              # Stato API (Supabase, Gemini, Zernio)

# Contenuti
dazero content <slug>                      # Tutti i post
dazero content <slug> --status pending_user  # Solo pending
dazero content <slug> --clear pending_user # Elimina in blocco per status
dazero approve <slug> --all                # Approva tutti
dazero calendar <slug>                     # Calendario
dazero calendar <slug> --month 2026-07     # Mese specifico

# Post (editing)
dazero post <slug> <id>                    # Dettaglio post
dazero post <slug> <id> edit --caption "..."  # Modifica caption
dazero post <slug> <id> render             # Genera l'immagine mancante
dazero post <slug> <id> approve            # Approva
dazero post <slug> <id> reject             # Elimina (solo pending)
dazero post <slug> <id> publish            # Pubblica ora
dazero post <slug> <id> reschedule --scheduledFor "2026-06-20T10:00"

# Prodotti
dazero products <slug>                     # Lista
dazero products <slug> sync                # Re-importa dallo store collegato

# Ads
dazero ads <slug>                          # Campagne + metriche paid
dazero ads <slug> --sync                   # Sincronizza account + metriche
dazero ads <slug> --propose                # Proposte boost dai top post organici
dazero ads <slug> --remix                  # Remix competitor ads → brief creativi
dazero ads <slug> --approve <id> [--budget N]
dazero ads <slug> --reject <id>
dazero ads <slug> --pause <id>             # Pausa campagna (tutte le creatività)
dazero ads <slug> --resume <id>            # Riattiva campagna
dazero ads <slug> --pause <id> --ad <adId> # Pausa UNA creatività (A/B)
dazero ads <slug> --resume <id> --ad <adId>
dazero ads <slug> --duplicate <id>          # Copia in pausa → nuova proposta
dazero ads <slug> --delete <id>             # Elimina sulla piattaforma (storico ok)
dazero ads <slug> --create --name "..." --headline "..." [--platform metaads|googleads] [--budget N]

# Account e billing
dazero upgrade <slug>                      # Apri checkout piano
dazero update                              # Aggiorna la CLI
```

## Status post

| Status | Colore | Significato |
|--------|--------|-------------|
| `pending_user` | 🟡 Giallo | In attesa di approvazione |
| `approved` | 🔵 Blu | Approvato, in attesa di scheduling |
| `scheduled` | 🟢 Verde | Schedulato per pubblicazione |
| `published` | 🟢 Verde | Pubblicato |
| `failed` | 🔴 Rosso | Pubblicazione fallita |
