import { describe, it, expect } from 'vitest';
import { brandVisualDirective, platformPlaybook, attachBrandMoodImages, extractVisualPlaybook, carouselMaxPerBatch, carouselMaxSlides, clampCarousels, resolveSeedWithRubrics, faceBrandMode, scrubPersonAppearance, aspectRatioFor, buildImageRequest, enforceHookComponents, detectCaptionTells, detectCtaEcho, findJudgeDuplicates, ownerCaptionEditPairs, ownerEditPairsBlock, postQcPayload, sealOnImageText, BLOG_IMAGE_MODEL, type PostSeed, type PreviewPost } from './content-preview';
import { defaultImageModel } from './content-preview/default-image-model';

import type { Rubric } from './rubrics';

describe('resolveSeedWithRubrics (rubric format is AUTHORITATIVE over Pass 1)', () => {
  const mkSeed = (over: Partial<PostSeed> = {}): PostSeed => ({
    platform: 'reddit', platforms: ['reddit'], pillar: 'p', format: 'single_image', media: 'image',
    day: 'Monday', time: '09:00', title: '', link_url: '', subreddit: '', product: '', person: '',
    angle: 'a', subject: 's', setting: '', props: '', ...over
  });
  const mkRubric = (over: Partial<Rubric> = {}): Rubric => ({
    id: 'r-link', name: 'Formula Km 0', promise: 'p', strategic_role: 'traffic',
    format: 'link_post', cadence: '2/month', differentiation: 'd', rationale: 'r', ...over
  });

  // THE case: the rubric says link_post, Pass 1 proposed carousel (media image). If Pass 1 won
  // here, rubrics would have recreated the exact drift they exist to prevent.
  it('link_post rubric beats a Pass-1 carousel proposal (format AND media)', () => {
    const seed = mkSeed({ platform: 'reddit', platforms: ['reddit'], format: 'carousel', slide_count: 5, media: 'image', rubric: 'Formula Km 0', link_url: 'https://b.co/a' });
    const out = resolveSeedWithRubrics(seed, [mkRubric()]);
    expect(out.format).toBe('link_post');
    expect(out.media).toBe('link');
    expect(out.rubric_id).toBe('r-link');
    expect(out.slide_count).toBeUndefined(); // no carousel remnants
  });

  it('carousel rubric beats a Pass-1 single_image proposal (gets a slide_count)', () => {
    const out = resolveSeedWithRubrics(
      mkSeed({ platform: 'instagram', platforms: ['instagram'], format: 'single_image', media: 'image', rubric: 'Serie C' }),
      [mkRubric({ id: 'r-car', name: 'Serie C', format: 'carousel' })]
    );
    expect(out.format).toBe('carousel');
    expect(out.media).toBe('image');
    expect(out.slide_count).toBe(5);
  });

  it('text_post rubric beats a Pass-1 image proposal on X', () => {
    const out = resolveSeedWithRubrics(
      mkSeed({ platform: 'x', platforms: ['x'], format: 'single_image', media: 'image', rubric: 'Serie T' }),
      [mkRubric({ id: 'r-txt', name: 'Serie T', format: 'text_post' })]
    );
    expect(out.format).toBe('text_post');
    expect(out.media).toBe('text');
  });

  // Residual divergence is PLATFORM PHYSICS, not Pass 1 winning: a link_post episode cannot
  // exist on Instagram (links aren't clickable) — it degrades, and keeps the rubric linkage
  // so the degradation is traceable (and logged by resolveSeedWithRubrics).
  it('degrades a link_post episode on Instagram (platform capability, traceable)', () => {
    const out = resolveSeedWithRubrics(
      mkSeed({ platform: 'instagram', platforms: ['instagram'], format: 'carousel', media: 'image', rubric: 'Formula Km 0' }),
      [mkRubric()]
    );
    expect(out.format).toBe('single_image');
    expect(out.media).toBe('image');
    expect(out.rubric_id).toBe('r-link'); // linkage survives → the mismatch is visible downstream
  });
});

describe('carousel guardrail config', () => {
  // Il tetto per batch era 1 e faceva la scelta editoriale al posto di chi pianifica: una rubrica a
  // fumetti usciva di rado perché il numero le stava davanti, non perché costasse troppo. Il vincolo
  // vero ora è il budget (un carosello costa quante slide ha, un video ne vale sedici) e questo resta
  // un freno d'emergenza. Il tetto alle SLIDE invece è fisico: oltre non si pubblica.
  it('non decide più quanti caroselli, ma tiene il tetto fisico alle slide', () => {
    expect(carouselMaxPerBatch()).toBeGreaterThan(1);
    expect(carouselMaxSlides()).toBe(6);
  });
});

describe('brandVisualDirective', () => {
  // Un poster tipografico è tornato con "#E86A5C" e "#3B6FB6" stampati dentro: al renderer i codici
  // sono arrivati come testo, e un design fatto di testo li ha letterizzati.
  it('vieta di stampare i codici colore dentro l\'immagine', () => {
    const d = brandVisualDirective(['#E86A5C', '#3B6FB6'], null);
    expect(d).toMatch(/never (?:draw|render|letter)[^.]*code/i);
  });

  it('builds a palette + typography directive', () => {
    const d = brandVisualDirective(['#0099FF', '#111111'], ['Inter', 'Söhne']);
    expect(d).toMatch(/BRAND IDENTITY/);
    expect(d).toContain('#0099FF');
    expect(d).toContain('#111111');
    expect(d).toContain('Inter');
    expect(d).toContain('Söhne');
  });

  it('returns empty when there are no colours or fonts', () => {
    expect(brandVisualDirective([], [])).toBe('');
    expect(brandVisualDirective(null, null)).toBe('');
    expect(brandVisualDirective(undefined, undefined)).toBe('');
  });

  it('caps the palette at 6 and fonts at 3', () => {
    const colors = ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777'];
    const fonts = ['Inter', 'Roboto', 'Lato', 'Poppins'];
    const d = brandVisualDirective(colors, fonts);
    expect(d).toContain('#666666');
    expect(d).not.toContain('#777777');
    expect(d).toContain('Lato');
    expect(d).not.toContain('Poppins');
  });

  it('works with only colours (no fonts)', () => {
    const d = brandVisualDirective(['#0099FF'], []);
    expect(d).toContain('#0099FF');
    expect(d).not.toMatch(/Typography/);
  });
});

describe('platformPlaybook', () => {
  it('steers LinkedIn toward long-form copy', () => {
    const out = platformPlaybook(['linkedin'], {});
    expect(out).toMatch(/PLATFORM PLAYBOOK/);
    expect(out).toMatch(/LinkedIn/);
    expect(out).toMatch(/LONG-FORM/);
  });

  it('dedupes platforms and maps twitter → x', () => {
    const out = platformPlaybook(['x', 'twitter', 'x'], {});
    // One bullet only, despite three (equivalent) entries.
    expect(out.match(/^- /gm)?.length).toBe(1);
    expect(out).toMatch(/280 characters/);
  });

  it('layers brand-specific instructions on top of the default, marked authoritative', () => {
    const out = platformPlaybook(['linkedin'], {
      platformInstructions: { linkedin: 'Always end with a poll.' }
    });
    expect(out).toMatch(/LONG-FORM/); // default still present
    expect(out).toContain('Always end with a poll.');
    expect(out).toMatch(/take priority/);
  });

  it('returns empty when no listed platform has guidance', () => {
    expect(platformPlaybook([], {})).toBe('');
    expect(platformPlaybook(['', '   '], {})).toBe('');
    // An unknown platform with no custom instructions contributes nothing.
    expect(platformPlaybook(['myspace'], {})).toBe('');
  });

  it('includes an unknown platform when the brand supplies custom instructions', () => {
    const out = platformPlaybook(['myspace'], { platformInstructions: { myspace: 'Keep it retro.' } });
    expect(out).toContain('Keep it retro.');
  });

  it('constrains hashtags to the brand-approved set when provided', () => {
    const out = platformPlaybook(['instagram'], { platformHashtags: { instagram: ['#brand', '#promo'] } });
    expect(out).toContain('#brand #promo');
    expect(out).toContain('use ONLY these brand-approved hashtags');
    // No approved set for a platform → no hashtag constraint line.
    expect(platformPlaybook(['x'], { platformHashtags: { instagram: ['#brand'] } })).not.toContain('use ONLY these');
  });

  it('documents YouTube as video-only with auto Shorts detection', () => {
    const out = platformPlaybook(['youtube'], {});
    expect(out).toMatch(/YouTube/i);
    expect(out).toMatch(/video-only/i);
    expect(out).toMatch(/Short/i);
  });
});

describe('attachBrandMoodImages (site-image fallback)', () => {
  // Minimal supabase stub: brand_documents query resolves to the given rows.
  const supabaseWithMoodDocs = (rows: { file_url: string }[]) =>
    ({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({ limit: async () => ({ data: rows }) })
            })
          })
        })
      }),
      storage: {
        from: () => ({
          createSignedUrls: async (paths: string[]) => ({
            data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}` }))
          })
        })
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

  it('falls back to the brand site imagery when there are no uploaded mood docs', async () => {
    const profile = { images: ['https://site/a.jpg', 'https://site/b.jpg', 'https://site/c.jpg', 'https://site/d.jpg'] };
    await attachBrandMoodImages(profile, supabaseWithMoodDocs([]), 'brand-1');
    // Capped at MOOD_REF_IMAGES (3) and taken in site order.
    expect((profile as { moodImages?: string[] }).moodImages).toEqual([
      'https://site/a.jpg', 'https://site/b.jpg', 'https://site/c.jpg'
    ]);
  });

  it('prefers uploaded mood docs over site imagery', async () => {
    const profile = { images: ['https://site/a.jpg'] };
    await attachBrandMoodImages(profile, supabaseWithMoodDocs([{ file_url: 'u/mood.png' }]), 'brand-1');
    expect((profile as { moodImages?: string[] }).moodImages).toEqual(['https://signed/u/mood.png']);
  });

  it('leaves an already-populated moodImages untouched', async () => {
    const profile = { moodImages: ['keep.png'], images: ['https://site/a.jpg'] };
    await attachBrandMoodImages(profile, supabaseWithMoodDocs([]), 'brand-1');
    expect((profile as { moodImages?: string[] }).moodImages).toEqual(['keep.png']);
  });
});

describe('extractVisualPlaybook', () => {
  const playbook =
    'WHAT WORKS VISUALLY (from the brand\'s best-performing posts — repeat these patterns):\n- Close-up product textures\n- Warm natural light';

  it('pulls the WHAT WORKS VISUALLY section out of a composite ai_context', () => {
    const ctx = `Voice brief here.\n\n${playbook}\n\nCOMPETITIVE DELTA (how to stand out):\nLean into: X.`;
    expect(extractVisualPlaybook(ctx)).toBe(playbook);
  });

  it('works when the block is the last section', () => {
    const ctx = `Voice brief here.\n\n${playbook}`;
    expect(extractVisualPlaybook(ctx)).toBe(playbook);
  });

  it('returns empty when the block is absent or input is not a string', () => {
    expect(extractVisualPlaybook('Just a voice brief.')).toBe('');
    expect(extractVisualPlaybook(undefined)).toBe('');
    expect(extractVisualPlaybook(null)).toBe('');
  });
});

describe('scrubPersonAppearance', () => {
  it('strips gendered physique invented for androgenous names', () => {
    expect(scrubPersonAppearance('A young man named Andrea smiling in a studio')).toMatch(/the person/i);
    expect(scrubPersonAppearance('A young man named Andrea smiling in a studio')).not.toMatch(/\bman\b/i);
    expect(scrubPersonAppearance('Portrait of a woman in a navy blazer at a desk')).toMatch(/navy blazer/i);
    expect(scrubPersonAppearance('Portrait of a woman in a navy blazer at a desk')).not.toMatch(/\bwoman\b/i);
  });
});

describe('faceBrandMode', () => {
  it('returns none with no people', () => {
    expect(faceBrandMode({ name: 'Acme', people: [] } as any)).toBe('none');
  });

  it('treats a single person as face (monopersonal default)', () => {
    expect(faceBrandMode({ name: 'Studio X', people: [{ name: 'Marco' }] } as any)).toBe('face');
  });

  it('detects personal site via name overlap (e.g. andreabuttarelli.com)', () => {
    expect(
      faceBrandMode({
        name: 'Andrea Buttarelli',
        site_type: 'portfolio',
        people: [{ name: 'Andrea Buttarelli' }]
      } as any)
    ).toBe('face');
  });

  it('treats 3+ people as ensemble even on a personal archetype', () => {
    expect(
      faceBrandMode({
        name: 'Acme',
        site_type: 'creator',
        people: [{ name: 'A' }, { name: 'B' }, { name: 'C' }]
      } as any)
    ).toBe('ensemble');
  });

  it('keeps a 2-person company as ensemble without personal signals', () => {
    expect(
      faceBrandMode({
        name: 'Acme Co',
        site_type: 'saas',
        about: 'We build tools for teams.',
        people: [{ name: 'Alice' }, { name: 'Bob' }]
      } as any)
    ).toBe('ensemble');
  });
});

describe('aspectRatioFor', () => {
  it('keeps stills feed-safe per platform', () => {
    expect(aspectRatioFor('instagram')).toBe('4:5');
    expect(aspectRatioFor('x')).toBe('16:9');
    expect(aspectRatioFor('tiktok')).toBe('9:16');
    expect(aspectRatioFor('youtube')).toBe('9:16');
    expect(aspectRatioFor('reddit')).toBe('1:1');
  });

  it('forces 9:16 for video covers on every platform — the clip inherits the cover ratio', () => {
    expect(aspectRatioFor('instagram', 'video')).toBe('9:16');
    expect(aspectRatioFor('x', 'video')).toBe('9:16');
    // legacy free-form formats normalise to 'video' too
    expect(aspectRatioFor('instagram', 'reel')).toBe('9:16');
    expect(aspectRatioFor('instagram', 'short video')).toBe('9:16');
  });

  it('leaves non-video formats on the platform ratio', () => {
    expect(aspectRatioFor('instagram', 'carousel')).toBe('4:5');
    expect(aspectRatioFor('instagram', 'single_image')).toBe('4:5');
  });
});

describe('buildImageRequest (image model tier)', () => {
  const img = { inlineData: { mimeType: 'image/png', data: 'x' } };
  // Non un id scritto a mano: il default lo decide la famiglia dello slot, e un id copiato qui
  // dentro sarebbe la seconda voce in capitolo — esattamente cio' che `defaultImageModel` toglie
  // di mezzo. Il test dice la REGOLA, che non e' cambiata: un ramo solo, per tutti.
  const DEFAULT = defaultImageModel();

  it('un default solo, con o senza riferimenti da riprodurre', () => {
    expect(buildImageRequest('p', { personImages: [img] }).model).toBe(DEFAULT);
    expect(buildImageRequest('p', { referenceImages: [img] }).model).toBe(DEFAULT);
    expect(buildImageRequest('p', { userRefImages: [img] }).model).toBe(DEFAULT);
    expect(buildImageRequest('p', { baseImage: img }).model).toBe(DEFAULT);
  });

  // Il nome vecchio di questo test diceva "half-price tier" e asseriva BLOG_IMAGE_MODEL, che e' il
  // modello PIENO: la convinzione era rovesciata, e intanto la maggioranza delle immagini — un
  // prompt e nessun riferimento — pagava $0,06 a chiamata.
  it('senza riferimenti da riprodurre usa lo stesso — mood e logo non contano', () => {
    expect(buildImageRequest('p', {}).model).toBe(DEFAULT);
    expect(buildImageRequest('p', { moodImages: [img], logoImage: img }).model).toBe(DEFAULT);
  });

  it('il blog resta sul modello pieno, perche' + "'" + ' lo chiede esplicitamente', () => {
    // La batch API del blog vuole quel modello e lo passa a mano: cambiare il default non lo
    // tocca, ed e' esattamente cio' che questo cambio NON doveva spostare.
    expect(BLOG_IMAGE_MODEL).not.toBe(DEFAULT);
    expect(buildImageRequest('p', { model: BLOG_IMAGE_MODEL }).model).toBe(BLOG_IMAGE_MODEL);
  });

  it('a base image is an EDIT, and the brand can edit with another model', () => {
    // Editing the photo the user is looking at and inventing one from a prompt are two jobs, and
    // the brand picks a model for each. This is the only place that knows which one is happening.
    expect(buildImageRequest('p', { model: 'draw', refineModel: 'edit', baseImage: img }).model).toBe('edit');
  });

  it('does not reach for the refine model when there is nothing to refine', () => {
    // Reference or mood images are things to REPRODUCE, not a base to edit: sending those through
    // the refine model would quietly retire the brand's generation choice on half its posts.
    expect(buildImageRequest('p', { model: 'draw', refineModel: 'edit' }).model).toBe('draw');
    expect(buildImageRequest('p', { model: 'draw', refineModel: 'edit', referenceImages: [img] }).model).toBe('draw');
  });

  it('never overrides an explicit caller model (blog/batch/UGC)', () => {
    expect(buildImageRequest('p', { model: 'x', personImages: [img] }).model).toBe('x');
  });

  // Il tetto dei riferimenti non è una scelta di prodotto libera: ne passano 8 IN TUTTO, contando
  // anche quelli che nessuno ha chiesto (logo, base, mood). Chiunque alzi un limite negli strumenti
  // (`generate_image` e i suoi quattro gemelli) deve passare da qui: se la somma supera il budget
  // il taglio non sparisce, si sposta dentro il provider, dove non ha nemmeno il nome delle
  // immagini che butta via.
  it('la somma delle parti allegate può già superare il budget dei riferimenti', async () => {
    const { IMAGE_REFS_BUDGET } = await import('$lib/image-models');
    const inlineParts = (opts: Parameters<typeof buildImageRequest>[1]) =>
      buildImageRequest('p', opts).contents[0].parts.filter((x: { inlineData?: unknown }) => x.inlineData).length;

    // Il caso peggiore che il codice di oggi sa costruire: base + logo + 4 prodotto + 4 allegati + 3 mood.
    const worst = inlineParts({
      baseImage: img,
      logoImage: img,
      referenceImages: [img, img, img, img],
      userRefImages: [img, img, img, img],
      moodImages: [img, img, img]
    });
    expect(worst).toBe(13);
    expect(worst).toBeGreaterThan(IMAGE_REFS_BUDGET);

    // E il costo fisso che l'utente non controlla: logo sempre, base in modifica, mood fino a 3.
    // Quello che resta a chi passa reference_image_urls / people_ids / media_ids è questo, non 12.
    const fixed = inlineParts({ baseImage: img, logoImage: img, moodImages: [img, img, img] });
    expect(fixed).toBe(5);
    expect(IMAGE_REFS_BUDGET - fixed).toBe(3);
  });
});

describe('enforceHookComponents (the no-duplication rule)', () => {
  it('drops an on-screen line that restates the spoken hook', () => {
    const seeds = [{ hook: 'Ho smesso di mandare report ai clienti', hook_text: 'ho smesso di mandare report ai clienti' }];
    expect(enforceHookComponents(seeds)).toBe(1);
    expect(seeds[0].hook_text).toBe('');
  });

  it('catches an overlay that is a short excerpt of the spoken line', () => {
    // Low overlap with the sentence it was cut from, but a full duplicate of itself — which is why
    // the ratio is measured against the SHORTER side.
    const seeds = [
      {
        hook: 'Ho smesso di mandare report ai clienti e nessuno se ne e accorto per due mesi interi',
        hook_text: 'smesso mandare report'
      }
    ];
    expect(enforceHookComponents(seeds)).toBe(1);
    expect(seeds[0].hook_text).toBe('');
  });

  it('keeps an overlay that carries a different load', () => {
    const seeds = [{ hook: 'Ho smesso di mandare report ai clienti', hook_text: 'agenzie: leggete questo' }];
    expect(enforceHookComponents(seeds)).toBe(0);
    expect(seeds[0].hook_text).toBe('agenzie: leggete questo');
  });

  it('ignores accents and punctuation when comparing', () => {
    const seeds = [{ hook: 'Perche i preventivi muoiono?', hook_text: 'Perché i preventivi muoiono' }];
    expect(enforceHookComponents(seeds)).toBe(1);
  });

  it('leaves a seed alone when either slot is empty', () => {
    const seeds = [{ hook: 'Qualcosa', hook_text: '' }, { hook: '', hook_text: 'Qualcosa' }];
    expect(enforceHookComponents(seeds)).toBe(0);
    expect(seeds[1].hook_text).toBe('Qualcosa');
  });
});

describe('clampVideos + the fidelity ladder', () => {
  // clampVideos is internal, so the allocation rule is proven through the two exported helpers it
  // delegates to: the same classify → rank pipeline decides which clip survives the cap.
  it('keeps the clip whose angle earned the spend when the cap bites', async () => {
    const { classifyHookTactic } = await import('./hook-tactics');
    const { byLadderPriority, ladderFor } = await import('./production-ladder');
    const ctx = { proven: ['stat_lead' as const], tried: ['stat_lead' as const, 'question' as const], coldStart: false };
    const seeds = [
      { id: 'never-tried', hook: 'Nota: ho smesso di mandare report' },
      { id: 'proven', hook: '68% dei preventivi si perde nelle prime 48 ore' },
      { id: 'tried', hook: 'Vuoi davvero continuare così?' }
    ];
    const ordered = byLadderPriority(seeds, (s) => ladderFor(classifyHookTactic(s.hook)?.tactic ?? null, ctx).rung);
    expect(ordered.map((s) => s.id)).toEqual(['proven', 'tried', 'never-tried']);
  });
});

// I tell da AI si contano in codice: ogni assert qui sotto è un fallimento nominato in
// CAPTION_FAILURE_MODES, e se il detector si rompe il copy chief torna cieco sulla cadenza.
describe('detectCaptionTells (le spie deterministiche del copy chief)', () => {
  it('flags the em-dash cadence, tricolon ending and banned opener together', () => {
    const tells = detectCaptionTells(
      'Scopri come il tuo brand può crescere davvero — senza sprechi — senza stress.\nNon promesse. Non slide. Solo risultati.'
    );
    expect(tells).toContain('em_dash:2');
    expect(tells).toContain('banned_opener');
    expect(tells).toContain('tricolon_ending');
  });

  it('caps emoji at 2 (0 on LinkedIn) and flags a first line that rambles', () => {
    expect(detectCaptionTells('Grande novità 🎉🚀🔥 per tutti')).toContain('emoji:3');
    expect(detectCaptionTells('Una novità 🎉', 'linkedin')).toContain('emoji:1');
    const rambling = detectCaptionTells(
      'In questo post vogliamo raccontarvi una cosa che secondo noi è davvero molto interessante per chi ci segue'
    );
    expect(rambling.some((t) => t.startsWith('long_first_line:'))).toBe(true);
  });

  it('stays quiet on a clean caption', () => {
    expect(detectCaptionTells('Tre resi su dieci partono da una taglia sbagliata. Da oggi la tabella è nella foto.')).toEqual([]);
  });
});

describe('detectCtaEcho (CTA fotocopia nel batch)', () => {
  it('fires when two captions close on the same CTA formula, ignoring hashtag tails', () => {
    const idx = detectCtaEcho([
      'Post uno con la sua idea.\nDimmelo nei commenti qui sotto.\n#brand #nicchia',
      'Post due, altra idea.\nDimmelo nei commenti qui sotto.',
      'Post tre chiude senza chiedere niente.'
    ]);
    expect(idx).toEqual([0, 1]);
  });

  it('stays quiet when the closers vary', () => {
    expect(
      detectCtaEcho([
        'Idea uno.\nSalvalo per il prossimo ordine.',
        'Idea due.\nQual è la tua taglia più contestata?',
        'Idea tre. Punto.'
      ])
    ).toEqual([]);
  });
});

// La riscrittura sull'indice sbagliato: due post identici dopo i judge, si ripristina il secondo.
describe('findJudgeDuplicates', () => {
  it('flags the post whose judged caption duplicates another but had a different original', () => {
    expect(findJudgeDuplicates(['stessa caption', 'stessa caption'], ['stessa caption', 'la sua vera caption'])).toEqual([1]);
  });

  it('stays quiet when the duplicate was already there pre-judge, or captions differ', () => {
    expect(findJudgeDuplicates(['uguale', 'uguale'], ['uguale', 'uguale'])).toEqual([]);
    expect(findJudgeDuplicates(['a', 'b', ''], ['x', 'y', 'z'])).toEqual([]);
  });
});

// Il loop di apprendimento: zero coppie → prompt identico a prima; jsonb sporco → mai nel prompt.
describe('ownerCaptionEditPairs / ownerEditPairsBlock', () => {
  it('returns an empty block with zero edits (the prompt stays byte-identical)', () => {
    expect(ownerEditPairsBlock({})).toBe('');
    expect(ownerEditPairsBlock({ captionEditPairs: [] })).toBe('');
  });

  it('sanitizes foreign jsonb: drops invalid pairs, keeps the last 3, truncates to 600 chars', () => {
    const pairs = [
      { before: 'a1', after: 'b1' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { before: '', after: 'x' } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      'garbage' as any,
      { before: 'a2', after: 'b2' },
      { before: 'a3', after: 'x'.repeat(2000) },
      { before: 'a4', after: 'b4' }
    ];
    const out = ownerCaptionEditPairs({ captionEditPairs: pairs });
    expect(out.map((p) => p.before)).toEqual(['a2', 'a3', 'a4']);
    expect(out[1].after.length).toBe(600);
    const block = ownerEditPairsBlock({ captionEditPairs: pairs });
    expect(block).toContain('BEFORE: a4');
    expect(block).toContain('absorb the DIFFERENCE');
  });
});

// posts.qc è l'unico punto di persistenza della deviazione: verdetto immagine e nota devono
// fondersi senza perdersi a vicenda.
describe('postQcPayload', () => {
  it('merges the scene deviation into the image-QC verdict', () => {
    const post = { sceneDeviation: 'stronger scene for the angle' } as PreviewPost;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (post as any).__qc = { score: 8, pass: true };
    expect(postQcPayload(post)).toEqual({ score: 8, pass: true, scene_deviation: 'stronger scene for the angle' });
  });

  it('is just the verdict without a deviation, and null with neither', () => {
    const post = {} as PreviewPost;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (post as any).__qc = { score: 7 };
    expect(postQcPayload(post)).toEqual({ score: 7 });
    expect(postQcPayload({} as PreviewPost)).toBeNull();
    expect(postQcPayload({ sceneDeviation: 'why' } as PreviewPost)).toEqual({ scene_deviation: 'why' });
  });
});

describe('sealOnImageText', () => {
  const SEAL = 'Absolutely NO text';

  it('sigilla un prompt che non cita nessuna stringa esatta', () => {
    const out = sealOnImageText('Comic panel of a person opening a shop door. Hand-lettered caption box.');
    expect(out).toContain(SEAL);
  });

  it('lascia stare un prompt che la stringa la cita', () => {
    const p = 'Comic panel with a speech bubble: "Accompagni la sposa?".';
    expect(sealOnImageText(p)).toBe(p);
  });

  it('non sigilla due volte', () => {
    const once = sealOnImageText('Un ritratto senza scritte.');
    expect(sealOnImageText(once)).toBe(once);
  });

  it('non tocca un prompt vuoto (i post di testo non hanno immagine)', () => {
    expect(sealOnImageText('')).toBe('');
  });
});

// clampCarousels declassa un carosello oltre il tetto del batch, e girava DOPO
// clampMediaCapabilities — l'unico posto che sapeva che le battute vivono solo su un carosello.
// Risultato: un'immagine singola che si porta dietro una storia che nessuno renderà mai.
describe('clampCarousels e le battute', () => {
  const carousel = (over: Record<string, unknown> = {}) => ({
    format: 'carousel' as const,
    slide_count: 4,
    beats: ['b1', 'b2', 'b3', 'b4'],
    ...over
  });

  it('porta via la storia insieme al formato', () => {
    const seeds = [carousel(), carousel()];
    clampCarousels(seeds, 1);
    expect(seeds[0].beats).toHaveLength(4);
    expect(seeds[1].format).toBe('single_image');
    expect(seeds[1].beats).toBeUndefined();
  });
});

