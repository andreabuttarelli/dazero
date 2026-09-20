/**
 * IL MESTIERE FOTOGRAFICO, NEL PROMPT CHE RENDE DAVVERO L'IMMAGINE.
 *
 * Il buco che questo file chiude è lo stesso che `graphic-craft.ts` ha chiuso per le grafiche, un
 * livello più in là. Il mestiere esisteva già scritto — `agent-docs/how/WRITE-IMAGE-PROMPTS.md` —
 * ma arriva solo agli AGENTI DI CHAT, via `AGENT_FILES`. Il renderer, che è il punto da cui passa
 * ogni immagine del prodotto, non l'ha mai visto: riceveva `HOUSE_LOOK`, due righe.
 *
 * E il posto dove avrebbe dovuto stare era vuoto. `craftFloor` esisteva, con la sua posizione già
 * decisa nel prompt, ma era alimentato SOLO dal digest ambientale del wall — che non si rigenera
 * più da quando il muro pubblico è spento, e che scade dopo 30 giorni. Nessun test diventava rosso:
 * un pavimento che sparisce non rompe niente, rende solo le immagini un po' peggiori. È il modo più
 * silenzioso di perdere qualità, ed è già costato una volta quando il critico è stato tolto.
 *
 * DUE PAVIMENTI, NON UNO. Questo è il pavimento di PRODOTTO: come si fa una fotografia, e non ha
 * ragione di scadere. Il digest del wall resta il pavimento AMBIENTALE — «cosa funziona in questo
 * momento nel campo» — e si somma sopra quando c'è. Uno non sostituisce l'altro: se il digest
 * tornasse domani, si aggiungerebbe, e se resta spento il mestiere regge lo stesso.
 *
 * OGNI REGOLA NOMINA IL DIFETTO CHE EVITA. Una regola che dice «usa una buona luce» non si può né
 * applicare né verificare. Una che dice «l'ombra di contatto va chiesta per nome, e la sua assenza
 * è il motivo più comune per cui un prodotto sembra incollato» dice cosa scrivere e cosa si rompe
 * senza. È la stessa disciplina delle skill in `default-skills.ts`, dove la regola senza il suo
 * controllo è «una riga pagata a ogni turno che nessuno applica».
 *
 * Client-safe di proposito (`$lib/design/`, non `$lib/server/`), come `GRAPHIC_CRAFT_SPECS` e
 * `MOTION_CRAFT_SPECS`: la UI deve poter mostrare le stesse regole che il modello riceve.
 *
 * FONTI. La forma, l'ordine e le quattro regole non negoziabili vengono da
 * `agent-docs/how/WRITE-IMAGE-PROMPTS.md`, che è già nostro. Le regole che nominano un difetto di
 * resa — l'ombra di contatto, la sorgente che non sta in scena, il gloss da togliere, lo stato del
 * prodotto, la terza mano — sono riscritte da `photographic-craft.md` di SuperCMO Skills
 * (Copyright (c) 2026 Kshitiz Kumar, Apache-2.0): concetti ripresi, testo riscritto con i nostri
 * vincoli e il nostro vocabolario, come già fatto per le due skill di design in `default-skills.ts`.
 */

/**
 * Il pavimento del mestiere fotografico. Entra in OGNI render come blocco a sé, dopo il soggetto e
 * prima dello stile del brand: il brand kit e il brief restano il soffitto, questo è il minimo
 * sotto cui non si scende.
 */
export const PHOTO_CRAFT_SPECS = `PHOTOGRAPHIC CRAFT (the floor — the brief and the brand style always win over it):

LIGHT IS FIVE DECISIONS, NEVER ONE ADJECTIVE
- Direction: where the key sits relative to lens and subject. On its own it decides whether a round object reads as round.
- Size: how large the source reads beside the subject. Narrow gives hard edges and tight speculars; several times wider wraps and flatters.
- Temperature, as a number: 2000K candle, 3200K tungsten, 5500K daylight, 6500K and up for overcast and open shade.
- Contrast: how much detail survives on the shadow side.
- Separation: what lifts the subject's edge off the background.
- NOTHING THAT MAKES THE LIGHT IS IN THE FRAME. Name position and size, never the fixture: a softbox, strip, dish or stand written into a prompt is an object, and it gets drawn standing there. A source that belongs to the scene — window, lamp, candle, screen, fire — is set dressing, can be named, and settles the temperature for everything else.
- A source large enough to flatter skin smooths the pores off it, so ask for visible skin texture alongside it.

SHADOW
- ASK FOR THE CONTACT SHADOW BY NAME: the dark seam where the object meets what it rests on. No model adds it unprompted, and its absence is the commonest reason a product reads as pasted onto the scene.
- Every shadow falls away from the key you named. One leaning back toward it reads as broken instantly.
- Give each shadow a direction, a length and an edge. Missing any of the three, it renders as a grey smear pooled underneath.
- Never ask for a soft key and a crisp-edged shadow at once. That is two setups, and asking for both gets neither.

MATERIAL — READ A SURFACE BY WHAT IT DOES WITH LIGHT
- Reflective shows its surroundings rather than itself: describe the reflection as a field running bright to dark. One flat value reads as plastic.
- Matte only shows its structure under light raking across it. Lit frontally it collapses to a single tone.
- Transmissive reads by what passes through it and by its edges, so light it from behind or the side.
- Name the micro-detail that proves the material — weave, grain, tool marks, pores, a scratch. A category name on its own renders nothing.
- ASK FOR THE GLOSS TO COME OFF. These models coat everything in one uniform sheen, and naming the real texture is what removes it. Quality words will not.
- The surface underneath is a material too: it sets the contact shadow, and on anything glossy it is half of what the subject reflects.

OPTICS
- Focal length is a look before it is a number: short takes in the surroundings and bends the edges, long compresses depth and lifts the subject clear of what stands behind it. State the length and what it should do to the frame together.
- Aperture is the other half: wide holds one plane and dissolves the rest, stopped down holds front to back.
- Name the exact point that must be sharpest, and what is allowed to dissolve.

COLOUR
- Choose the environment's colours against the subject's own: harmonise, complement or contrast, and decide which. A background picked without reference to the subject is why a frame reads as stock.
- Two or three dominant tones, named in words rather than codes, and say how they contrast.
- Bind every colour to the object carrying it. A colour named loose drifts onto whatever is nearest.

WHAT THE MODEL ADDS WHEN YOU ARE NOT LOOKING
- NOTHING CAN BE WRITTEN AS ABSENT. A thing named is a thing rendered, whether object, action or sound. Describe the scene you want, not the one you are avoiding.
- Introduce something that is already in the frame and the model renders a second one: an extra hand, a duplicate arm, a doubled person.
- Describe a third job — hold one thing, work a second, point at a third — and a third hand appears. Two hands, two jobs.
- Do not reserve empty space for text nobody asked for. A region requested as emptiness comes back as an untextured block. If type is coming later, say where it sits and what tonal range it needs, never that the area is empty.
- Do not transcribe what a label says. Spelling out the printing invites the model to redraw it, and redrawn text comes back warped.

THE SUBJECT'S STATE DOES NOT CHANGE
- A product arrives in a state — closed, sealed, assembled, fastened, full — and it leaves in the same one. Never write an action that changes it: no cap set down beside the bottle, no lid off, no box opened, nothing poured out.
- A frame can be mid-use without the product being mid-opened: a hand reaching toward it, a cloth beside it, crumbs on the counter. All of those read as a thing in use and none of them touch it.
- The only exception is the brief asking for the change outright. "Show it open" is an instruction; "show it being used" is not.

WORDS THAT RENDER NOTHING
- Praise adjectives carry no rendering instruction. Convert each one into the optical fact that would make a viewer reach for the word: a source size, a contrast ratio, a surface finish.
- A vibe is a list of signature props, not a mood word. "2000s bedroom" renders as nothing; a CD player, a beaded door curtain, a cluttered vanity of lip glosses renders as 2003.
- Candid beats posed: "looking slightly away from the camera, holding a cup, relaxed" outperforms any amount of "authentic, natural, genuine".`;

/** Il craft come blocco di prompt: spaziato per entrare in coda a un'altra sezione senza incollarsi. */
export const PHOTO_CRAFT_FLOOR = `\n\n${PHOTO_CRAFT_SPECS}\n`;
