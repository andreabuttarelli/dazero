/**
 * RIEMPIE UN BRAND DI PROVA, per avere una tela con qualcosa dentro.
 *
 * Il canvas su un brand vuoto non dice niente: le tile hanno senso solo quando sono di misure e
 * contenuti diversi, ed è lì che si vede se la tela regge. Questo mette immagini, documenti e post
 * finti su un brand nominato a mano.
 *
 * SOLO SU UN BRAND CHE SI NOMINA, e mai su uno a caso: lo slug è obbligatorio, non c'è un default.
 * Seminare dati finti nella libreria di un cliente vero è il genere di errore che non si disfa.
 *
 * LE IMMAGINI SONO GENERATE QUI, non scaricate: un seeder che dipende da un servizio esterno
 * fallisce il giorno che quel servizio cambia, e un SVG di poche righe basta a vedere una bacheca.
 *
 *   node --env-file=.env node_modules/.bin/vite-node --config scripts/vite-node.config.ts \
 *     scripts/seed-canvas-brand.ts -- --slug=nebulae-verify
 *   ... --slug=nebulae-verify --clean   (toglie prima ciò che un giro precedente ha messo)
 */
import { createAdminClient } from '$lib/server/supabase-admin';

const BUCKET = 'brand-knowledge';
/** Marca le righe di questo seeder, così `--clean` sa cosa togliere senza toccare altro. */
const SEED_TAG = 'canvas-seed';

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const slug = flag('slug');
const clean = args.includes('--clean');

if (!slug) {
  console.error('serve --slug=<brand>: questo script scrive dati finti, e non li indovina');
  process.exit(1);
}

const PALETTE = ['#E86A5C', '#3B6FB6', '#F2B705', '#2E9E6B', '#8B5CF6', '#EC4899'];

/** Un SVG quadrato con un numero: basta a distinguere una tile dall'altra su una bacheca. */
function svg(i: number): string {
  const bg = PALETTE[i % PALETTE.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <rect width="600" height="600" fill="${bg}"/>
  <circle cx="${120 + (i % 4) * 120}" cy="${160 + (i % 3) * 120}" r="${70 + (i % 5) * 18}" fill="rgba(255,255,255,.22)"/>
  <text x="300" y="330" font-family="system-ui,sans-serif" font-size="180" font-weight="700"
        fill="rgba(255,255,255,.92)" text-anchor="middle">${i + 1}</text>
</svg>`;
}

const DOCS = [
  { title: 'Tono di voce', summary: 'Diretto, senza superlativi. Si parla in seconda persona e si dice cosa cambia per chi legge, non quanto siamo bravi.' },
  { title: 'Chi ci legge', summary: 'Fondatori e responsabili marketing di aziende piccole, che scelgono da soli e non hanno un reparto creativo.' },
  { title: 'Pilastri editoriali', summary: 'Dietro le quinte del metodo, numeri veri di un mese, errori che abbiamo fatto, risposte a domande ricorrenti.' },
  { title: 'Cosa non diciamo mai', summary: 'Nessuna promessa di risultato, nessun confronto diretto con un concorrente, nessun dato senza fonte.' },
  { title: 'Palette e materiali', summary: 'Fondi pieni, tipografia grande, poche foto. Gli accenti si usano una volta sola per composizione.' },
  { title: 'Calendario tipo', summary: 'Tre uscite a settimana: una che spiega, una che mostra, una che chiede qualcosa a chi legge.' }
];

const CAPTIONS = [
  'Il metodo in tre passaggi, senza la parte noiosa.',
  'Abbiamo misurato un mese di lavoro. I numeri sono questi.',
  'Una cosa che sbagliavamo, e come ce ne siamo accorti.',
  'La domanda che ci fanno tutti, con la risposta lunga.',
  'Dietro le quinte: com è fatto davvero un post nostro.',
  'Tre errori che vediamo ogni settimana.'
];

/** Chi attribuire le immagini: un membro del brand, o in mancanza chi possiede l'organizzazione. */
async function ownerOf(admin: ReturnType<typeof createAdminClient>, brandId: string): Promise<string | null> {
  const member = await admin.from('brand_members').select('user_id').eq('brand_id', brandId).limit(1).maybeSingle();
  if (member.data?.user_id) return member.data.user_id as string;

  const brand = await admin.from('brands').select('org_id').eq('id', brandId).maybeSingle();
  if (!brand.data?.org_id) return null;

  const org = await admin.from('organizations').select('owner_id').eq('id', brand.data.org_id).maybeSingle();
  if (org.data?.owner_id) return org.data.owner_id as string;

  const anyMember = await admin.from('org_members').select('user_id').eq('org_id', brand.data.org_id).limit(1).maybeSingle();
  return (anyMember.data?.user_id as string) ?? null;
}

async function main() {
  const admin = createAdminClient();

  const { data: brand } = await admin.from('brands').select('id, slug').eq('slug', slug).maybeSingle();
  if (!brand) {
    console.error(`brand "${slug}" non trovato`);
    process.exit(1);
  }
  // `brand_media.user_id` è NOT NULL: le immagini sono indicizzate sulla PERSONA, non sul brand —
  // è la stessa ragione per cui il teardown degli eval deve pulire lo Storage a parte. Un brand
  // senza membri esiste (questo lo era), quindi si risale al proprietario dell'organizzazione.
  const userId = await ownerOf(admin, brand.id);
  if (!userId) {
    console.error('nessun utente da attribuire: le immagini non si possono seminare su questo brand');
  }

  if (clean) {
    const { data: old } = await admin.from('brand_media').select('storage_path').eq('brand_id', brand.id).eq('source', 'upload').like('storage_path', `%/${SEED_TAG}/%`);
    const paths = (old ?? []).map((r) => r.storage_path as string);
    if (paths.length) await admin.storage.from(BUCKET).remove(paths);
    await admin.from('brand_media').delete().eq('brand_id', brand.id).like('storage_path', `%/${SEED_TAG}/%`);
    await admin.from('brand_documents').delete().eq('brand_id', brand.id).eq('source_type', SEED_TAG);
    await admin.from('posts').delete().eq('brand_id', brand.id).eq('image_prompt', SEED_TAG);
    console.log('ripulito quanto seminato prima');
  }

  // ── immagini ────────────────────────────────────────────────────────────
  let images = 0;
  for (let i = 0; userId && i < 12; i++) {
    const path = `${brand.id}/${SEED_TAG}/tile-${i + 1}.svg`;
    const up = await admin.storage
      .from(BUCKET)
      .upload(path, new Blob([svg(i)], { type: 'image/svg+xml' }), { contentType: 'image/svg+xml', upsert: true });
    if (up.error) {
      console.error(`  immagine ${i + 1}: ${up.error.message}`);
      continue;
    }
    const { error } = await admin.from('brand_media').insert({
      brand_id: brand.id,
      user_id: userId,
      kind: 'image',
      storage_path: path,
      // `url` è NOT NULL anche se la libreria mostra la versione FIRMATA che deriva da
      // `storage_path`: la colonna resta il riferimento stabile, la firma è una vista che scade.
      url: admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
      source: 'upload',
      mime: 'image/svg+xml',
      width: 600,
      height: 600,
      file_name: `tile-${i + 1}.svg`,
      title: `Materiale ${i + 1}`,
      catalog_status: 'ready'
    });
    if (error) console.error(`  riga immagine ${i + 1}: ${error.message}`);
    else images++;
  }

  // ── documenti ───────────────────────────────────────────────────────────
  let docs = 0;
  for (const doc of DOCS) {
    const { error } = await admin.from('brand_documents').insert({
      brand_id: brand.id,
      kind: 'note',
      status: 'ready',
      title: doc.title,
      summary: doc.summary,
      markdown: `# ${doc.title}\n\n${doc.summary}\n`,
      content_text: doc.summary,
      source_type: SEED_TAG,
      collection: 'brand'
    });
    if (error) console.error(`  documento "${doc.title}": ${error.message}`);
    else docs++;
  }

  // ── post ────────────────────────────────────────────────────────────────
  let posts = 0;
  for (const [i, caption] of CAPTIONS.entries()) {
    const { error } = await admin.from('posts').insert({
      brand_id: brand.id,
      platform: i % 2 ? 'instagram' : 'linkedin',
      content_type: 'text',
      status: 'pending_user',
      caption,
      image_prompt: SEED_TAG,
      source: 'manual'
    });
    if (error) console.error(`  post ${i + 1}: ${error.message}`);
    else posts++;
  }

  console.log(`\n${slug}: ${images} immagini · ${docs} documenti · ${posts} post`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
