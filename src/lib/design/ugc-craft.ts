/**
 * IL MESTIERE DELLA RESA UGC: come si scrive una battuta perché il modello la renda davvero.
 *
 * Il buco che chiude. `ugc-craft.ts` (il server) ha l'architettura giusta — un agente sul tier pro
 * che riscrive il brief deterministico, con le RULE tenute verbatim e il ripiego sul brief di
 * template se sbaglia — e un'istruzione che è un segnaposto: «riscrivilo come farebbe un vero
 * regista». Chiedere mestiere a un modello senza dirgli quale è il modo esatto in cui si ottiene
 * la media di quello che ha visto in addestramento.
 *
 * NON GLI ARCHI, CHE CI SONO GIÀ. `$lib/ugc-formats` tiene le otto forme con le loro battute in
 * percentuale, `productEarly`, `failsWhen`: quella è la DRAMMATURGIA e non si tocca. Qui c'è
 * l'altra cosa — come si scrive una battuta perché esca dal generatore come è stata pensata. Due
 * registri degli stessi archi divergerebbero al primo formato nuovo, e un test verifica che questo
 * file non nomini nessun id di formato.
 *
 * OGNI RIGA NOMINA UN DIFETTO DI RESA, NON UN GUSTO. «Dai a ogni battuta un momento con la bocca
 * chiusa» non è una preferenza di regia: il labiale è la cosa più debole che questi modelli
 * rendono, e il parlato continuo lo sbava per tutta la clip. Una regola che non dice cosa si rompe
 * senza di lei è una riga che il modello salta.
 *
 * Client-safe come gli altri craft di `$lib/design/`.
 *
 * FONTE. `writing-video-prompts/SKILL.md` e `generating-ugc-videos/references/mode-review.md` di
 * SuperCMO Skills (Copyright (c) 2026 Kshitiz Kumar, Apache-2.0), riscritti: presi i difetti di
 * resa e la dottrina dell'autenticità, non il testo.
 */

export const UGC_CRAFT_SPECS = `UGC CRAFT — how to write a beat so the generator actually renders it:

THE PERSON
- COUNT THE HANDS AT EVERY MOMENT. A phone held at arm's length takes one hand, so only one is free to act; a locked-off shot leaves both. Describe a third job — hold one thing, work a second, point at a third — and a third hand appears in the frame. Where the hands do not matter to the beat, leave them out rather than inventing business for them.
- PITCH EVERY PERFORMANCE ONE STEP HIGHER than the level you want on screen: the model plays performance back flatter than it is written. Give each beat several small movements and at least one thing that CHANGES — weight shifting forward, a breath landing, a grin breaking after a pause. A beat with nothing changing inside it renders as a frozen frame.
- Vary the expression from beat to beat, and where they speak let the delivery slip and recover once somewhere in the clip. Unbroken competence reads as an advert.

SPEECH
- GIVE EVERY BEAT A MOMENT WITH THE MOUTH CLOSED while the hands work. Lip movement is the weakest thing these models render, and speech running unbroken across a clip smears it.
- Split a spoken line across the beats at natural phrase breaks, in proportion to their lengths. The words are exact: no rewording, no insertions, nothing heard twice.

WHAT RENDERS AND WHAT DOES NOT
- ONE ACTION PER BEAT — one continuous motion at one object. Chained verbs get dropped or mangled.
- NOTHING BELOW LIMB SCALE. Moving, holding, tilting, lifting, gesturing and walking render. Unscrewing a cap, pulling a drawstring, pumping a pump head, working a zip or a clasp do not. Where a beat needs the thing in a new state, OPEN the beat with it already in that state.
- Interactions respect the physical chain: nobody drinks from a sealed bottle. Where the whole chain will not fit in the clip, start further along it.
- POSITIONS HOLD THROUGH A BEAT. Where a thing is, how it is held, how it is worn stays put unless a visible movement changes it — an unstated change renders as a teleport, and once changed it stays changed.
- NOTHING CAN BE WRITTEN AS ABSENT. A thing named is a thing rendered, whether object, action or sound. Describe the frame you want, never the one you are avoiding.
- Describe only what the attached media actually show. Texture, back panels, interiors and hidden mechanisms outside the frame come back invented.

SOUND
- Ambience is room tone plus what the beat's action really makes: name the source and the surface, two or three sounds at most. A sound named in a beat whose action does not produce it makes the model add the action to match.
- Do not repeat the spoken words in the ambience line, and never name music unless it was asked for.

WHAT A CREATOR VIDEO HAS TO EARN
- Viewers assume the creator was paid to say this. Praising the product harder only makes them surer of it. What earns trust is the sense that the creator would have said so if the product were bad — so a claim is made, tested on camera, and only then ruled on. The verdict is worth something because the viewer watched the test.
- A concession — a real limit, taken from what the product actually is — buys back more than another superlative. Never invent one, and never let it land on the thing the video is selling.
- Where the order of the beats could be shuffled without anyone noticing, it is a list and not a story.`;
