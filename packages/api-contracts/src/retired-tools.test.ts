import { describe, it, expect } from 'vitest';
import { BRAND_ENDPOINTS } from './index';

/**
 * I TOOL CHE I TRE GENERICI HANNO RESO INUTILI.
 *
 * `query`, `insert_row`, `update_row` e `delete_row` raggiungono ogni tabella dell'allowlist. Un
 * tool dedicato accanto a loro si giustifica solo se fa qualcosa in PIÙ della riga: pubblicare
 * davvero, spendere crediti, far partire una coda. Se si limita a scrivere una riga, è un secondo
 * modo di fare la stessa cosa — e ogni tool viaggia nel prompt di ogni turno, per sempre.
 *
 * Questo elenco è la decisione, scritta dove un ritorno indietro accidentale la fa fallire.
 * Rimetterne uno è legittimo: va tolto DA QUI, e allora si vede.
 */
const RETIRED = [
  'add_competitor',
  'delete_competitor',
  'delete_product',
  'remove_blog_term',
  'get_ads',
  'record_memory_used',
  'discard_plan',
  'approve_posts',
  'set_automation'
] as const;

/**
 * I TOOL CHE SCRIVEVANO TESTO CON UN MODELLO LORO.
 *
 * Chi chiama questi tool è già un agente che scrive, e scrive con il contesto della conversazione
 * e le skill del brand (`humanizer`, `stop-slop`) sotto mano. Chiamarne uno che rigenera il testo
 * dentro il prodotto paga il ragionamento DUE volte — una per decidere di chiamarlo, una dentro —
 * e il secondo modello non ha visto niente di quella conversazione: scrive peggio, e costa.
 *
 * Ogni riga qui ha accanto il tool che riceve il testo scritto fuori. La rotta REST resta, la
 * funzione che genera resta (l'autopilot la chiama su ogni brand con un piano attivo): sparisce
 * solo la voce nel registro dei tool.
 */
const RETIRED_GENERATORS: Record<string, string> = {
  generate_article: 'create_article deposita il markdown che hai scritto, update_article lo riscrive',
  optimize_article: 'update_article: la riscrittura SEO la fa chi chiama, che vede il testo',
  propose_plan: 'save_plan',
  revise_plan: 'save_plan, che sostituisce la proposta pendente',
  plan_week: 'save_week_seeds',
  replan_week: 'save_week_seeds, che rimpiazza il draft aperto',
  generate_captions: 'create_post per un post nuovo, edit_post per la copy di uno che c\'è già'
};

/**
 * Quelli che RESTANO benché somiglino a una scrittura, con la ragione accanto: senza, il prossimo
 * giro di pulizia li toglie per simmetria e rompe qualcosa che nessun test copre.
 */
const KEPT_ON_PURPOSE: Record<string, string> = {
  list_brands:
    'risponde a «quali brand esistono», cioè la domanda PRIMA dello slug: `query` è scoped su un brand e non può porsela',
  publish_post:
    'chiama `publishApprovedPost`, che consegna alle piattaforme: `update_row` darebbe post marcati pubblicati che non escono',
  publish_article:
    'scrive con il client admin — `brand_articles` è SELECT-only sotto RLS, quindi `update_row` verrebbe proprio rifiutato — e notifica IndexNow ed Exa',
  approve_post:
    'pubblica o schedula davvero, e distingue tre esiti che uno stato non contiene: schedulato, rifiutato dalla piattaforma, approvato-ma-senza-account collegato',
  approve_plan:
    'supersede il piano attivo, timbra le date di inizio settimana e risincronizza le preferenze del brand: tre scritture oltre allo stato',
  check_content:
    'compone sei moduli di regole — limiti di piattaforma, proof discipline, punteggio, conflitti di calendario, igiene hashtag — e ne versiona la composizione: nessuna riga da leggere esiste',
  save_week_seeds:
    'tiene UN solo draft per brand — aggiorna quello aperto invece di affiancarne un secondo, che sulla pagina piano nasconderebbe il primo: `insert_row` non sa cercare la riga da riusare. La normalizzazione NON è il motivo, perché non vive qui: `normalizeWeeklyStrategy` gira in LETTURA su ogni strada che consuma i seeds (pagina piano, scheduler, generate) e di nuovo dentro `executeWeekStrategy`, quindi un seed grezzo prende id, enum e clamp prima di essere prodotto',
  reject_post:
    'revoca la schedulazione su Zernio PRIMA di cancellare, e se la revoca fallisce non cancella: `delete_row` toglierebbe la riga lasciando viva la schedulazione — il post esce e non resta nulla che lo racconti (incidente luglio 2026)',
  make_video: 'genera e spende crediti',
  get_creation_kit: 'compone un brief da più fonti',
  get_writing_skills: 'restituisce file del repo, non righe',
  create_article:
    'è il passo di CREAZIONE che `generate_article` portava con sé: `brand_articles` ha una sola policy RLS, `for select`, quindi `insert_row` viene rifiutato da Postgres e senza questo tool un articolo scritto fuori non ha dove atterrare',
  update_article:
    'scrive il testo che arriva da fuori e non ne genera: è il gemello su cui poggia il ritiro di generate_article e optimize_article',
  create_post: 'deposita la copy scritta fuori come post in attesa: il gemello di generate_captions su un post che non esiste ancora',
  edit_post: 'riscrive la copy di un post che esiste, senza modello e senza crediti: l\'altra metà del gemello di generate_captions',
  save_plan: 'archivia il piano che hai scritto tu dove propose_plan lasciava quello generato',
  produce_week:
    'non scrive testo: prende i seed già decisi e compra le immagini e i video, cioè la parte che un agente esterno non può disegnare',
  generate_image: 'il modello interno è Nano Banana: un agente di testo non disegna',
  generate_video: 'il modello interno è Seedance/Kling: un agente di testo non gira clip',
  generate_carousel: 'rende le slide, non la copy che ci sta sopra',
  refine_media: 'modifica un\'immagine o una clip che esiste: pixel, non parole',
  render_post: 'trasforma un post in immagine finita',
  regenerate_post_media: 'ricompra il media di un post',
  regenerate_slide: 'ricompra una slide sola',
  enhance_prompt:
    'il testo che produce non lo legge una persona ma un modello di immagini, e la forma che serve a ciascuno (sezioni etichettate, paragrafo unico, comando) sta in una guida per modello che vive qui: un agente esterno non sa con quale modello stai per rendere né come vuole essere parlato. Rifiuta di suo le riscritture che inventano un soggetto, quindi non è una seconda stesura del brief',
  search_knowledge: 'cerca per embedding nei documenti del brand: legge, non scrive',
  research_competitors: 'va a prendere il mondo fuori (crawl), non compone contenuto'
};

/**
 * Non tutti i tool nascono dal registro: quelli che risolvono un id da un prefisso — `approve_post`,
 * `publish_post`, `reject_post` — sono registrati a mano nel server MCP, e un test che guardasse
 * solo `BRAND_ENDPOINTS` li direbbe assenti mentre esistono, cioè coprirebbe metà della superficie
 * credendo di coprirla tutta. Va tenuto allineato a `cli/mcp/tools/brand-content.ts`.
 */
const HAND_REGISTERED = [
  'approve_post',
  'publish_post',
  'reject_post',
  'list_brands',
  'produce_week'
];

describe('i tool ritirati in favore dei quattro generici', () => {
  const names = new Set([...BRAND_ENDPOINTS.map((e) => e.tool), ...HAND_REGISTERED]);

  it.each(RETIRED)('%s non è più un tool', (tool) => {
    expect(names.has(tool)).toBe(false);
  });

  it.each(Object.keys(KEPT_ON_PURPOSE))('%s resta, e il motivo è scritto', (tool) => {
    expect(names.has(tool)).toBe(true);
    expect(KEPT_ON_PURPOSE[tool].length).toBeGreaterThan(20);
  });

  it('i quattro generici ci sono tutti: senza, il ritiro toglie e basta', () => {
    for (const tool of ['query', 'insert_row', 'update_row', 'delete_row']) {
      expect(names.has(tool)).toBe(true);
    }
  });
});

describe('i tool che scrivevano testo con un modello proprio', () => {
  const names = new Set([...BRAND_ENDPOINTS.map((e) => e.tool), ...HAND_REGISTERED]);

  it.each(Object.keys(RETIRED_GENERATORS))('%s non è più un tool', (tool) => {
    expect(names.has(tool)).toBe(false);
  });

  /**
   * Un ritiro senza il gemello non sposta il lavoro fuori: lo toglie e basta. Il gemello va
   * nominato e deve esistere, altrimenti il testo scritto dall'agente non ha dove atterrare.
   */
  it.each(Object.entries(RETIRED_GENERATORS))('%s ha un gemello che esiste', (_tool, twin) => {
    const mentioned = [...names].filter((name) => twin.includes(name));
    expect(mentioned.length).toBeGreaterThan(0);
  });

  /**
   * Il buco vero che questo giro ha dovuto colmare. `update_article` chiede un id, quindi copre
   * la RISCRITTURA e non la NASCITA, che era l'altra metà di `generate_article`. `insert_row` non
   * la copre: `brand_articles` ha una sola policy RLS, `for select`, e Postgres rifiuta l'insert.
   */
  it('la creazione di un articolo resta raggiungibile senza il generativo', () => {
    expect(names.has('create_article')).toBe(true);
  });

  it('create_article prende il testo già scritto, e non pubblica', () => {
    const create = BRAND_ENDPOINTS.find((e) => e.tool === 'create_article');
    expect(create?.input.safeParse({ title: 'Un titolo', body_md: '## Un corpo' }).success).toBe(true);
    expect(create?.input.safeParse({ title: 'Un titolo' }).success).toBe(false);
    expect(create?.input.safeParse({ body_md: 'solo corpo' }).success).toBe(false);
    expect(create?.destructive).toBe(false);
  });
});
