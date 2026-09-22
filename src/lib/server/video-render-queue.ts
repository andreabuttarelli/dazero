/**
 * Out-of-band clip renders.
 *
 * Submitting returns a task id and nothing else is needed: the job lives on the provider's side and
 * its result stays fetchable from any process, forever. So instead of holding an invocation open
 * to watch it — which is what made clip generation the longest thing in this codebase, and what
 * capped every clip at POLL_TIMEOUT_MS regardless of what it actually needed — the task id is
 * written down and a cron picks the result up whenever it lands.
 *
 * The practical consequence: a render is no longer limited by anything on our side. A clip that
 * takes twenty minutes finishes; before, one that took over ten could not finish at all.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	finishVideoRender,
	type RenderVideoOpts,
	type SubmittedVideoRender,
	type VideoPersistOpts
} from '$lib/server/video';
import { withBrandContext, withOrgContext } from '$lib/server/ai-log';
import { projectIdOfBrand } from '$lib/server/tenancy/brand-slug';

/** Il nome del trasporto nei messaggi di resa: chi apre il registro deve sapere dove guardare. */
const VIDEO_TRANSPORT = 'openrouter';

/** Give up on a task the provider never resolves. Generous: each check costs one cheap HTTP call. */
export const VIDEO_RENDER_MAX_AGE_MS = 60 * 60_000;
/**
 * A claim older than this belonged to a process that died mid-finish.
 *
 * Must exceed the reconciler route's own maxDuration (300s), or a tick still legitimately working
 * gets its claim swept by the next tick and the non-idempotent half — downloading the mp4 and
 * billing the provider's charge — runs twice.
 */
export const VIDEO_RENDER_CLAIM_STALE_MS = 15 * 60_000;
/**
 * Stop retrying a render that keeps throwing. Age alone is not enough: a row that fails in
 * persistMp4 comes straight back to a per-minute cron, so without a count it burns sixty attempts
 * inside the age window — and every one of them is a download from the provider.
 *
 * Counts FAILURES only, never the "the provider is still working" checks. Counting those would make this a
 * second, far tighter deadline than VIDEO_RENDER_MAX_AGE_MS: at one tick a minute, eight checks is
 * eight minutes, so every clip needing longer would be declared dead while the provider rendered and billed
 * it — defeating the entire point of moving the render out-of-band.
 */
export const VIDEO_RENDER_MAX_ATTEMPTS = 8;

export type VideoRenderRow = {
	id: string;
	/** `null` su un clip chiesto senza nominare un brand: allora paga `org_id`, e la libreria non c'è. */
	brand_id: string | null;
	org_id: string | null;
	user_id: string;
	post_id: string | null;
	thread_id: string | null;
	task_id: string;
	model: string;
	status: string;
	duration_seconds: number | null;
	resolution: string | null;
	cover_url: string | null;
	prompt: string | null;
	persist_opts: VideoPersistOpts;
	submitted_at: string;
	attempts: number;
	/** Last failure seen, kept so giving up can say what kept going wrong. */
	error: string | null;
};

/** Write the handle down. Everything after this can happen in another process, later. */
export async function enqueueVideoRender(
	admin: SupabaseClient,
	opts: {
		brandId: string | null;
		/** Chi paga quando non c'è un brand. `video_renders_one_payer` esige esattamente uno dei due. */
		orgId?: string | null;
		userId: string;
		postId?: string | null;
		threadId?: string | null;
		submitted: SubmittedVideoRender;
	}
): Promise<string | null> {
	const { submitted } = opts;
	const { data, error } = await admin
		.from('video_renders')
		.insert({
			brand_id: opts.brandId,
			org_id: opts.brandId ? null : (opts.orgId ?? null),
			user_id: opts.userId,
			post_id: opts.postId ?? null,
			thread_id: opts.threadId ?? null,
			task_id: submitted.taskId,
			model: submitted.model,
			prompt: submitted.prompt,
			duration_seconds: submitted.durationSeconds,
			resolution: submitted.resolution,
			cover_url: submitted.coverUrl ?? null,
			persist_opts: submitted.persistOpts,
			submitted_at: new Date(submitted.submittedAt).toISOString()
		})
		.select('id')
		.maybeSingle();

	if (error) {
		console.error('[video-render] enqueue failed:', error.message);
		return null;
	}
	return (data?.id as string) ?? null;
}

/**
 * Submit a clip and record the handle in one step — the pair every caller needs, kept together so
 * nobody can do the first without the second. A submitted render whose id was never written down
 * is the exact failure this whole table exists to prevent: the provider renders it, charges for it, and no
 * process on our side knows it happened.
 *
 * Returns the submission so the caller can write duration/resolution onto its own row, or null if
 * the provider refused the job — in which case the caller falls back to shipping the cover, as before.
 */
export async function submitAndTrackVideoRender(opts: {
	admin: SupabaseClient;
	brandId: string | null;
	orgId?: string | null;
	userId: string;
	postId?: string | null;
	threadId?: string | null;
	imagePrompt: string;
	render: RenderVideoOpts;
	/** Il motivo di un rifiuto del fornitore, se ne arriva uno: passa dritto a chi ha chiamato. */
	onSubmitError?: (reason: string) => void;
}): Promise<SubmittedVideoRender | null> {
	const { submitVideoRender } = await import('$lib/server/video');
	const submitted = await submitVideoRender(opts.imagePrompt, {
		...opts.render,
		onSubmitError: opts.onSubmitError
	}).catch((e) => {
		// CreditsExhaustedError must reach the caller — it is a message for the user, not a failure
		// to swallow into a silent photo fallback.
		if (e instanceof Error && e.name === 'CreditsExhaustedError') throw e;
		console.error('[video-render] submit failed:', e instanceof Error ? e.message : e);
		return undefined;
	});
	if (!submitted) return null;

	const id = await enqueueVideoRender(opts.admin, {
		brandId: opts.brandId,
		orgId: opts.orgId,
		userId: opts.userId,
		postId: opts.postId ?? null,
		threadId: opts.threadId ?? null,
		submitted
	});
	if (!id) {
		// The provider is rendering something nobody will collect. Say so loudly: it is billable work lost.
		console.error(`[video-render] submitted task ${submitted.taskId} but could not record it`);
		return null;
	}
	return submitted;
}

/**
 * Renders this brand has in flight, so a quota gate can see them.
 *
 * The monthly video count is only charged when a clip LANDS — charging at submit would let a run of
 * rejected renders eat the month. But that leaves a window where usage says zero and N submissions
 * have already happened, so a one-video allowance can be spent many times over. Callers must gate
 * on remaining budget MINUS this.
 */
export async function countOutstandingVideoRenders(
	admin: SupabaseClient,
	brandId: string
): Promise<number> {
	const { count, error } = await admin
		.from('video_renders')
		.select('id', { count: 'exact', head: true })
		.eq('brand_id', brandId)
		.in('status', ['rendering', 'finishing']);
	// Fail closed on error: treating an unknown number of in-flight renders as zero is exactly the
	// over-spend this function exists to prevent.
	if (error) {
		console.error('[video-render] outstanding count failed:', error.message);
		return Number.MAX_SAFE_INTEGER;
	}
	return count ?? 0;
}

/**
 * Chi paga questa riga. Esattamente uno dei due è scritto — `video_renders_one_payer` lo impone —
 * e un brand nomina la sua organizzazione da sé, mentre una riga senza brand la porta addosso.
 */
function inPayerScope<T>(row: VideoRenderRow, fn: () => Promise<T>): Promise<T> {
	if (row.brand_id) return withBrandContext(row.brand_id, fn);

	return withOrgContext(String(row.org_id), fn);
}

function rowToSubmitted(row: VideoRenderRow): SubmittedVideoRender {
	return {
		taskId: row.task_id,
		model: row.model,
		prompt: row.prompt ?? '',
		durationSeconds: row.duration_seconds ?? 0,
		resolution: row.resolution ?? '480p',
		coverUrl: row.cover_url ?? undefined,
		persistOpts: (row.persist_opts ?? { captions: false, tighten: false }) as VideoPersistOpts,
		submittedAt: Date.parse(row.submitted_at) || Date.now()
	};
}

/**
 * Release claims whose holder died. Without this a process killed between claiming and finishing
 * strands the render at `finishing` forever — the clip exists at the provider and nobody ever collects it.
 */
async function releaseStaleClaims(admin: SupabaseClient): Promise<void> {
	await admin
		.from('video_renders')
		.update({ status: 'rendering', claimed_at: null })
		.eq('status', 'finishing')
		.lt('claimed_at', new Date(Date.now() - VIDEO_RENDER_CLAIM_STALE_MS).toISOString())
		.then(undefined, () => {});
}

async function settle(
	admin: SupabaseClient,
	row: VideoRenderRow,
	patch: Record<string, unknown>
): Promise<void> {
	await admin
		.from('video_renders')
		.update({ ...patch, completed_at: new Date().toISOString() })
		.eq('id', row.id)
		.then(undefined, () => {});
}

/**
 * Il clip che nessun post reclama va nella LIBRERIA del brand, o resta un file pagato che nessun
 * tool sa raggiungere: `create_post` accetta `media_ids`, e questo è l'id che glielo procura.
 * `source_ref` porta l'id del lavoro, così `check_media_job` ritrova l'asset senza una colonna in
 * più su `video_renders`.
 */
async function applyToLibrary(
	admin: SupabaseClient,
	row: VideoRenderRow,
	url: string
): Promise<string | null> {
	const { saveRenderedVideoToLibrary } = await import('$lib/server/brand-media');
	const saved = await saveRenderedVideoToLibrary(admin, {
		brandId: String(row.brand_id),
		userId: row.user_id,
		url,
		title: row.prompt?.trim().slice(0, 80) || 'Generated clip',
		durationSeconds: row.duration_seconds ?? undefined,
		sourceRef: row.id
	});

	return 'error' in saved ? saved.error : null;
}

/**
 * L'allocazione mensile la consuma un clip che ATTERRA, ovunque atterri — su un post o in
 * libreria. Contarla solo nel ramo del post apriva un arbitraggio: genero in libreria, attacco
 * dopo, e il video non conta mai. Un video è un video.
 *
 * Addebitare all'invio invece — come facevano i chiamanti, perché era lì che un clip esisteva —
 * lascerebbe che dieci render rifiutati si mangino il margine di un mese.
 */
async function chargeMonthlyVideo(admin: SupabaseClient, row: VideoRenderRow): Promise<void> {
	// L'allocazione è del PIANO di un brand. Una riga senza brand non ha un piano da consumare: la
	// paga il saldo crediti dell'organizzazione, che il cancello ha già guardato prima dell'invio.
	if (!row.brand_id) return;

	try {
		const { addUsage, monthKey } = await import('$lib/server/usage');
		const { data: brand } = await admin
			.from('brands')
			.select('timezone')
			.eq('id', row.brand_id)
			.maybeSingle();
		await addUsage(admin, row.brand_id, monthKey((brand?.timezone as string) ?? 'Europe/Rome'), {
			videos: 1
		});
	} catch (e) {
		console.error('[video-render] usage accounting failed:', e);
	}
}

/**
 * Dove si reclama un clip atterrato, una riga per padrone. Senza brand non c'è una libreria in cui
 * depositarlo — `brand_media` dice `brand_id in (select auth_brand_ids())`, e `NULL in (…)` vale
 * NULL — quindi il clip si ritrova sulla riga stessa, che `settle` chiude con `media_url`.
 */
async function landClip(
	admin: SupabaseClient,
	row: VideoRenderRow,
	url: string,
	thumbnailUrl?: string
): Promise<string | null> {
	if (!row.post_id) return row.brand_id ? applyToLibrary(admin, row, url) : null;
	// `.select('id')` so a zero-row match is visible: an UPDATE that hits nothing reports no error,
	// so without this an orphaned render — post insert rolled back, post since deleted — would be
	// billed, settled `done`, and reported to the user as attached to a post that does not exist.
	const { data: touched, error } = await admin
		.from('posts')
		.update({
			media_url: url,
			content_type: 'generated_video',
			// Set here, with media_url and content_type, so a post is never labelled a reel while
			// its media is still a still frame.
			format: 'video',
			video_task_id: row.task_id,
			video_resolution: row.resolution,
			video_duration_seconds: row.duration_seconds,
			video_render_status: 'done',
			...(thumbnailUrl ? { video_thumbnail_url: thumbnailUrl } : {})
		})
		.eq('id', row.post_id)
		.select('id');
	if (error) {
		return `the clip is stored but post ${row.post_id} could not be updated: ${error.message}`;
	}
	if (!touched?.length) {
		return `the clip is stored but post ${row.post_id} no longer exists`;
	}

	return null;
}

/**
 * Dire a chi l'ha chiesto che la clip è arrivata: una push sul post, che è dove la card la mostra.
 */
async function notifyThread(admin: SupabaseClient, row: VideoRenderRow, outcome: string) {
	if (!row.thread_id || !row.brand_id) return;
	try {
		const projectId = await projectIdOfBrand(admin, row.brand_id);

		const { sendPushToUser } = await import('$lib/server/web-push');
		await sendPushToUser(admin, row.user_id, {
			title: 'dazero',
			body: `Video: ${outcome}`,
			url: projectId && row.post_id ? `/p/${projectId}/calendar?post=${row.post_id}` : '/',
			tag: `video-render-${row.id}`,
			skipIfFocused: true
		});
	} catch (e) {
		console.error('[video-render] thread notify failed:', e);
	}
}

/**
 * One pass: check every outstanding render once and finish whichever the provider has completed.
 *
 * No loop, no sleep, no per-render budget — a tick is a handful of HTTP calls, which is exactly
 * why the give-up window can be an hour instead of ten minutes.
 */
export async function reconcileVideoRenders(
	admin: SupabaseClient,
	opts: { limit?: number } = {}
): Promise<{ checked: number; done: number; failed: number; expired: number }> {
	await releaseStaleClaims(admin);

	const { data: rows } = await admin
		.from('video_renders')
		.select(
			'id, brand_id, org_id, user_id, post_id, thread_id, task_id, model, status, duration_seconds, resolution, cover_url, prompt, persist_opts, submitted_at, attempts, error'
		)
		.eq('status', 'rendering')
		.order('submitted_at', { ascending: true })
		.limit(opts.limit ?? 20);

	let checked = 0;
	let done = 0;
	let failed = 0;
	let expired = 0;

	for (const raw of (rows ?? []) as VideoRenderRow[]) {
		const age = Date.now() - (Date.parse(raw.submitted_at) || Date.now());
		const exhausted = raw.attempts >= VIDEO_RENDER_MAX_ATTEMPTS;
		if (age > VIDEO_RENDER_MAX_AGE_MS || exhausted) {
			const why = exhausted
				? `gave up after ${raw.attempts} attempts (${raw.error ?? 'repeated failures'})`
				: `${VIDEO_TRANSPORT} never resolved this task`;
			await settle(admin, raw, { status: 'expired', error: why });
			if (raw.post_id) {
				await admin
					.from('posts')
					.update({ video_render_status: 'failed' })
					.eq('id', raw.post_id)
					.then(undefined, () => {});
			}
			// Told, like every other outcome. This is the slowest one to detect — up to an hour —
			// so silence here is the longest a user can be left expecting a clip that is not coming.
			await notifyThread(admin, raw, `it did not complete — ${why}`);
			expired += 1;
			continue;
		}

		// Claim before doing anything non-idempotent: persistMp4 writes a file and the billing call
		// charges the brand, and two overlapping ticks must not do either twice.
		// Note: attempts is NOT bumped here. Most claims are "is it done yet?" checks against a
		// perfectly healthy render, and counting those turns the retry cap into a deadline of
		// MAX_ATTEMPTS minutes. Only real failures below increment it.
		const { data: claimed } = await admin
			.from('video_renders')
			.update({ status: 'finishing', claimed_at: new Date().toISOString() })
			.eq('id', raw.id)
			.eq('status', 'rendering')
			.select('id')
			.maybeSingle();
		if (!claimed) continue;

		checked += 1;
		try {
			// Lo scope di chi paga, così la fattura dentro finishVideoRender atterra sul suo registro.
			// Sbagliarlo scrive una riga in `ai_calls` che nessuna somma trova: spesa vera, invisibile.
			const outcome = await inPayerScope(raw, () =>
				finishVideoRender(admin, raw.user_id, rowToSubmitted(raw))
			);

			if (outcome.status === 'pending') {
				// Not ready: hand it straight back so the next tick sees it.
				await admin
					.from('video_renders')
					.update({ status: 'rendering', claimed_at: null })
					.eq('id', raw.id)
					.then(undefined, () => {});
				continue;
			}

			if (outcome.status === 'failed') {
				await settle(admin, raw, { status: 'failed', error: outcome.error.slice(0, 2000) });
				if (raw.post_id) {
					await admin
						.from('posts')
						.update({ video_render_status: 'failed' })
						.eq('id', raw.post_id)
						.then(undefined, () => {});
				}
				await notifyThread(admin, raw, `it failed (${outcome.error})`);
				failed += 1;
				continue;
			}

			// Post first, settle second. Settling `done` before the post has the url strands a paid
			// clip nowhere: nothing re-reads a done row. If the post write fails the row goes back
			// to the queue, where the attempt cap eventually stops it.
			const notLanded = await landClip(admin, raw, outcome.url, outcome.thumbnailUrl);
			if (notLanded) {
				console.error(`[video-render] clip did not land id=${raw.id}:`, notLanded);
				await admin
					.from('video_renders')
					.update({
						status: 'rendering',
						claimed_at: null,
						attempts: raw.attempts + 1,
						media_url: outcome.url,
						error: notLanded.slice(0, 2000)
					})
					.eq('id', raw.id)
					.then(undefined, () => {});
				continue;
			}
			await chargeMonthlyVideo(admin, raw);
			await settle(admin, raw, { status: 'done', media_url: outcome.url });
			await notifyThread(
				admin,
				raw,
				raw.post_id
					? 'the clip is ready and attached to the post'
					: 'the clip is ready and filed in the media library'
			);
			done += 1;
		} catch (e) {
			// Unknown failure: give the row back rather than burying it. The age check above is what
			// stops a permanently broken task from being retried forever.
			const message = e instanceof Error ? e.message : String(e);
			console.error(`[video-render] reconcile failed id=${raw.id}:`, message);
			await admin
				.from('video_renders')
				.update({
					status: 'rendering',
					claimed_at: null,
					attempts: raw.attempts + 1,
					error: message.slice(0, 2000)
				})
				.eq('id', raw.id)
				.then(undefined, () => {});
		}
	}

	return { checked, done, failed, expired };
}
