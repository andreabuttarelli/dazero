/**
 * IL MONTAGGIO — dove i pacchetti senza `$lib`/`$env` (`@anomalia/agent-adapters`,
 * `@anomalia/agent-core`) incontrano le implementazioni VERE di questo repo.
 *
 * Il lotto 2b ha invertito la freccia: `ServerBrandFs`/`PostgresMemoryStore`/
 * `VercelSandboxProvider` non importano più `$lib/server/*` da soli (un pacchetto di `packages/`
 * non può — vedi `packages/no-app-imports.test.ts`), le chiedono come deps del costruttore.
 * Questo file è l'UNICO posto che chiama sia i pacchetti sia `$lib/server/*` insieme: ogni
 * fabbrica qui sotto passa le funzioni vere alle deps che l'adapter dichiara.
 *
 * QUI DENTRO C'ERA ANCHE L'HARNESS, ed è andato via con i suoi pacchetti: `startHarnessTurn`,
 * le sessioni vive, la scelta del modello per il turno e il runtime esistevano per la chat, che
 * è stata rimossa il 4 settembre. Da allora nessun percorso di produzione li raggiungeva più —
 * solo i test, che provavano un codice che nessuno eseguiva.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { Sandbox } from '@vercel/sandbox';
import {
	explicitCredentials,
	oidcTokenFromRequestContext,
	openBrandSandbox,
	resolvePlaywrightEnv
} from '$lib/server/sandbox';
import { createFileTools, isOverridable, OVERRIDABLE_PREFIXES, AGENT_DOCS_BUCKET } from '$lib/server/chat/agent-files';
import { createAdminClient } from '$lib/server/supabase-admin';
import { loadMemoryEntries, writeMemory } from '$lib/server/brand-memory';
import { ServerBrandFs } from '@anomalia/agent-adapters/brand-fs';
import { PostgresMemoryStore } from '@anomalia/agent-adapters/memory-postgres';
import { VercelSandboxProvider } from '@anomalia/agent-adapters/vercel-sandbox';
import type { GraphicalBootstrapDeps } from '@anomalia/agent-adapters/graphical-bootstrap';

export function createServerBrandFs(supabase: SupabaseClient, agent?: string | null): ServerBrandFs {
	return new ServerBrandFs(
		supabase,
		{
			createFileTools,
			isOverridable,
			overridablePrefixes: OVERRIDABLE_PREFIXES,
			agentDocsBucket: AGENT_DOCS_BUCKET,
			createAdminClient
		},
		agent
	);
}

export function createPostgresMemoryStore(supabase: SupabaseClient): PostgresMemoryStore {
	return new PostgresMemoryStore(supabase, { loadMemoryEntries, writeMemory });
}

export function createVercelSandboxProvider(): VercelSandboxProvider {
	return new VercelSandboxProvider({
		openBrandSandbox,
		explicitCredentials,
		oidcTokenFromRequestContext,
		vercelOidcToken: env.VERCEL_OIDC_TOKEN
	});
}

/** Passata come `ApplyToolDeps.graphicalBootstrap` — vedi executor.ts (`observe`/`act`). */
export const graphicalBootstrapDeps: GraphicalBootstrapDeps = {
	resolvePlaywrightEnv,
	playwrightVersion: env.SANDBOX_PLAYWRIGHT_VERSION,
	// `detached: true` è il SOLO modo di far sopravvivere un processo alla fine del comando
	// (Xvfb/openbox/Chromium): provato dal vivo, il setsid-nohup viene mietuto dalla piattaforma.
	runDetached: async (ref, cmd, args) => {
		const sb = await Sandbox.get({ name: ref.name });
		await sb.runCommand({ cmd, args, detached: true });
	}
};

/**
 * L'indirizzo pubblico di una porta della VM. Sta qui e non nella rotta perché questo è l'unico
 * livello che parla all'SDK della sandbox: una rotta che facesse `Sandbox.get` da sé scavalcherebbe
 * chi risolve credenziali e nomi.
 */
export async function sandboxPortUrl(name: string, port: number): Promise<string> {
	const sb = await Sandbox.get({ name });
	return sb.domain(port);
}
