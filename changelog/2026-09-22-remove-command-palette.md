# La palette (⌘K) se ne va, morta da tempo

Zero mount point in tutto il prodotto — l'unica menzione di `CommandPalette` fuori dal suo
stesso file era il file stesso. Cancellata, e con lei tutto ciò che esisteva solo per lei.

## Cancellato

- `src/lib/components/CommandPalette.svelte` (723 righe).
- Da `src/lib/shortcuts.ts`: `matchShortcut`, `BASE_SHORTCUTS`, `buildShortcuts`, `GO_TARGETS`,
  `goTargetLabelKey`, `SECTION_LETTERS`, `SEQUENCE_TIMEOUT_MS`, `resolveSequence`, `seqLetter`,
  `paletteOpen`. Resta solo `isTypingTarget`: la usa anche `src/lib/canvas/shortcuts.ts` (72 casi
  testati) — non è la stessa cosa, è la tastiera della tela, e non si tocca.
- L'import morto di `paletteOpen` in `DashboardSidebar.svelte` (mai letto, mai scritto).
- i18n: `app.shell.cmdTitle/cmdPlaceholder/cmdEmpty/cmdGroupActions/cmdGroupPages/
  cmdGroupSettings/cmdGroupAgents/cmdGroupThreads/cmdGroupMessages/cmdSwitchBrand/cmdNav/cmdOpen`,
  `app.shell.scPalette/scFocusPrompt/scHelp/scClose/scGoNote`, `app.nav.hireAgent` — zero `$_()`
  fuori dal componente cancellato. `app.nav.settings` resta: lo leggono PageRail e
  SettingsSidebar.

## Sedici componenti a zero importer

`PerfCards`, `HubOverview`, `HubOverviewCard`, `BrandsSidebar`, `BrandsMobileNav`, `StatsTiles`,
`StrategyHistory`, `PromptHistoryButton`, `PromptHistoryDrawer`, `TopbarCta`, `AiSurfaceGlyph`,
`HeroUrlCta`, `TopPostCard`, `EditorialPlanCards`, `SocialPostMockup`, `AgentStack3D` — nessuno
importato da niente, nessuno una route (`+page`/`+layout`), nessuno raggiunto da un import
dinamico. La cancellazione ha orfanato tre moduli in più, cancellati nello stesso giro:
`ai-surfaces.ts` (solo `AiSurfaceGlyph` lo usava), `platform-mix.ts` e `PlatformMixBars.svelte`
(solo `EditorialPlanCards` li usava, con i rispettivi test).

## Export morti in file vivi

`src/lib/agent-owners.ts`: `JOB_OWNERS` e `TEAM_AGENT_IDS` restano (li leggono job-roster.ts,
agent-team.ts, brand-skills.ts, e il contratto CLI writing-skills.ts). Cancellati
`parseRoutineOwner`, `routineOwnerKey`, `looksLikeARole`, `agentForTask`, `JOB_HOME`,
`AGENT_HOME`, `TEAM_SPECIALIST_IDS`, `RoutineOwner`, `TRADE_TERMS`, `ROLE_WORDS`: zero chiamanti
fuori dal proprio test. Il test si riduce a coprire solo ciò che resta.

`src/lib/agent-icons.ts` e `src/lib/agent-computer.ts`: zero chiamanti in tutto il repo,
cancellati con i loro test.

## Trovato ma non toccato

`src/lib/workbench-paths.ts` ha ancora una riga di nav per `/studio` (icona `palette`, non
correlata alla ricerca) — la rotta sotto `p/[projectId]/studio/` è demolizione di un altro agente
in corso in questa stessa sessione; la riga di nav non è mia da toccare finché quel giro non
chiude. `src/lib/workbench-paths.ts:workbenchTabLabel` diventa orfana con la cancellazione della
palette (era il suo unico chiamante oltre al proprio file) ma vive nello stesso file: stesso
motivo, non toccato.
