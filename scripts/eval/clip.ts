/**
 * LA SONDA DELLE CLIP: non «il brief è scritto bene», ma «la clip che esce regge».
 *
 * Il mestiere della resa UGC è entrato nei brief senza che nessuno guardasse il risultato. Questa
 * sonda rende clip VERE sul percorso vero — `renderVideo`, lo stesso che usa il prodotto — e le fa
 * guardare dal giudice (`clip-craft-review`), che conta fatti: quante mani sono in campo, se un
 * oggetto è saltato di posto, se il labiale tiene, se un tratto è un fermo immagine.
 *
 * COSTA SOLDI VERI, E PIÙ DELLE IMMAGINI. Una clip è la cosa più cara che il prodotto compri.
 * Il default è UNA clip; `--clips=N` ne chiede di più e ogni una è un addebito. Non gira in CI e
 * non gira su ogni commit: gira prima di un merge che tocca il craft UGC, il prompt video o il
 * modello, e la domanda è sempre la stessa — è peggiorato?
 *
 * IL BRAND USA E GETTA SI DISTRUGGE SEMPRE, anche in errore (`finally`). E lo Storage si pulisce a
 * parte: le clip stanno sotto `media/<userId>/generated/`, indicizzate sull'UTENTE, quindi la
 * cascata sul brand non se le porta via.
 *
 * UNA CLIP NON RESA NON È VERDE. Se il render fallisce, lo scenario esce con `unrun` e il motivo,
 * stampato prima del verdetto: un report che confonde «nessun difetto» con «non ho guardato» è
 * peggio di nessun report.
 *
 *   npm run eval:clip
 *   npm run eval:clip -- --clips=3 --model=bytedance/seedance-2-5
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createAdminClient } from '$lib/server/supabase-admin';
import { withBrandContext } from '$lib/server/ai-log';
import { renderVideo } from '$lib/server/video';
import { buildUgcShotBrief, formatUgcShotBrief } from '$lib/server/ugc';
import { craftUgcShotBrief } from '$lib/server/media-generator/ugc-craft';
import { reviewClipAt, clipCraftFindings, type ClipCraftVerdict } from '$lib/server/clip-craft-review';
import { createFixture, destroyFixture, type Fixture } from './durability/fixture';

const OUT_ROOT = resolve(import.meta.dirname, '../../eval-results/clip');
const CLIP_SECONDS = 10;

/**
 * Le battute che i controlli devono poter bocciare. Non scene qualunque: ognuna mette il modello
 * davanti a ciò che rende peggio — due mani già impegnate, un oggetto che deve restare dov'è, una
 * battuta parlata che sbava se il labiale non tiene.
 */
const SCENES = [
  {
    id: 'mani-occupate',
    hook: 'Ho smesso di perdere tempo la mattina',
    setting: 'una cucina luminosa la mattina',
    product: 'una moka di alluminio',
    script: 'ci metto due minuti e ho finito'
  },
  {
    id: 'oggetto-fermo',
    hook: 'Questo non lo tolgo più dalla scrivania',
    setting: 'una scrivania di legno accanto a una finestra',
    product: 'una lampada da tavolo nera',
    script: 'sta accesa tutto il giorno e non scalda'
  },
  {
    id: 'parlato-lungo',
    hook: 'Nessuno me lo aveva detto',
    setting: 'un soggiorno con luce naturale',
    product: 'un diffusore di ceramica bianca',
    script: 'lo tengo acceso due ore e la stanza cambia del tutto'
  }
];

type Row = { scene: string; url: string | null } & ClipCraftVerdict;

const args = new Set(process.argv.slice(2));
const arg = (name: string, fallback: number) => {
  const hit = [...args].find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) || fallback : fallback;
};
const flag = (name: string) => [...args].find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

const clipCount = Math.min(arg('clips', 1), SCENES.length);
const model = flag('model');

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = resolve(OUT_ROOT, stamp);

async function renderOne(fixture: Fixture, scene: (typeof SCENES)[number]): Promise<Row> {
  const admin = createAdminClient();
  const base = buildUgcShotBrief({
    seconds: CLIP_SECONDS,
    hook: scene.hook,
    format: 'testimonial',
    platform: 'tiktok',
    product: scene.product,
    setting: scene.setting,
    script: scene.script
  });
  const deterministic = formatUgcShotBrief(base, { script: scene.script, product: scene.product });

  // Il percorso vero: il brief deterministico passa dall'agente di resa prima del render, come in
  // produzione. Misurare il brief di template misurerebbe la rete di sicurezza, non il prodotto.
  const shotBrief = await craftUgcShotBrief({
    baseBrief: deterministic,
    script: scene.script,
    product: scene.product,
    platform: 'tiktok',
    seconds: CLIP_SECONDS,
    hook: scene.hook,
    setting: scene.setting,
    model
  });

  console.log(`  ${scene.id}: brief pronto (${shotBrief.length} car.), rendo…`);
  const rendered = await withBrandContext(fixture.brandId, () =>
    renderVideo(admin, fixture.userId, scene.setting, {
      shotBrief,
      ugc: true,
      script: scene.script,
      duration: CLIP_SECONDS,
      aspectRatio: '9:16',
      ...(model ? { model } : {})
    })
  ).catch((e) => (e instanceof Error ? e : new Error(String(e))));

  if (rendered instanceof Error || !rendered?.url) {
    // Il MOTIVO, non «non è stata resa». Una sonda che inghiotte l'errore del render costa quanto
    // una che gira e non dice niente: il primo giro di questa è finito così, e la diagnosi è stata
    // più lunga del render.
    // `renderVideo` torna `undefined` quando il job del provider fallisce, e il MOTIVO lo scrive
    // in `ai_calls` — che la cascata del teardown porta via. Si legge adesso o non si legge più:
    // è la stessa trappola che il CLAUDE.md segnala per il costo.
    const logged =
      rendered instanceof Error
        ? null
        : (
            await admin
              .from('ai_calls')
              .select('error, context')
              .eq('brand_id', fixture.brandId)
              .eq('label', 'video.render')
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
          ).data;
    // La distinzione che conta per chi legge il report: una clip che il provider non ha ancora
    // reso in dieci minuti è la SUA coda, non un difetto del prodotto. Scriverle uguali farebbe
    // sembrare rotto ciò che sta solo aspettando — ed è il giro in cui questa sonda è nata.
    const why =
      rendered instanceof Error
        ? rendered.message
        : logged?.error
          ? `il render è fallito — ${logged.error}`
          : 'il provider non ha reso la clip entro il timeout (coda satura, non un difetto del brief)';
    console.error(`  ${scene.id}: ${why}`);
    return { scene: scene.id, url: null, checked: 0, failed: [], unrun: why };
  }

  console.log(`  ${scene.id}: resa → ${rendered.url}`);
  const verdict = await reviewClipAt(rendered.url, shotBrief);
  console.log(`  ${scene.id}: ${clipCraftFindings(verdict)}`);
  writeFileSync(resolve(outDir, `${scene.id}.brief.txt`), shotBrief);
  return { scene: scene.id, url: rendered.url, ...verdict };
}

function report(rows: Row[]): string {
  const watched = rows.filter((r) => !r.unrun);
  const tally = new Map<string, number>();
  for (const row of watched) {
    for (const id of row.failed) tally.set(id, (tally.get(id) ?? 0) + 1);
  }
  const perCheck = [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `- **${id}** — caduto su ${n} clip su ${watched.length}`);

  return [
    '# Resa delle clip — i fatti, non i gusti',
    '',
    `**${watched.length} clip guardate${rows.length - watched.length ? `, ${rows.length - watched.length} NON rese` : ''}** · modello ${model ?? '(default del brand)'} · ${CLIP_SECONDS}s`,
    '',
    perCheck.length ? perCheck.join('\n') : '_Nessun controllo caduto._',
    '',
    '| scena | esito | clip |',
    '|---|---|---|',
    ...rows.map((r) => `| ${r.scene} | ${clipCraftFindings(r)} | ${r.url ? `[mp4](${r.url})` : '—'} |`),
    ''
  ].join('\n');
}

/**
 * Le clip stanno sotto `media/<userId>/generated/`, indicizzate sull'utente: la cascata sul brand
 * non se le porta via, e senza questo ogni giro lascia i suoi mp4 a terra per sempre.
 */
async function clearStorage(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin.storage.from('media').list(`${userId}/generated`);
  const paths = (data ?? []).map((f) => `${userId}/generated/${f.name}`);
  if (paths.length) await admin.storage.from('media').remove(paths);
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  console.log(`sonda clip → ${outDir}`);
  console.log(`${clipCount} clip da ${CLIP_SECONDS}s${model ? ` su ${model}` : ''} — ognuna è un addebito vero\n`);

  let fixture: Fixture | null = null;
  try {
    fixture = await createFixture('clip');
    const rows: Row[] = [];
    for (const scene of SCENES.slice(0, clipCount)) {
      rows.push(await renderOne(fixture, scene));
    }
    writeFileSync(resolve(outDir, '00-resa.md'), report(rows));
    console.log(`\nfatto: ${outDir}/00-resa.md`);
  } finally {
    if (fixture) {
      await clearStorage(fixture.userId).catch((e) => console.error(`storage non ripulito: ${e}`));
      await destroyFixture(fixture).catch((e) => console.error(`fixture non distrutta: ${e}`));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
