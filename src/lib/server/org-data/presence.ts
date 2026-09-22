/**
 * L'ANNUNCIO DI PRESENZA CHE §8bis CHIEDE: un agente MCP non tiene un canale aperto — fa una
 * chiamata HTTP e se ne va. Se la presenza vivesse solo in Realtime (dove un client col canvas
 * aperto tiene una connessione), un agente che scrive per due minuti sarebbe INVISIBILE: due
 * persone guardano nodi che cambiano da soli. Un `broadcast` prima di toccare le righe basta —
 * niente tabella, niente stato da pulire.
 *
 * Un solo evento, non due: `write-tool.ts` non sa quando la sua scrittura "finisce" nel senso in
 * cui una generazione lunga finisce — è una singola query, già tornata quando l'annuncio parte.
 * `agent:active` con `nodeIds` è sufficiente a dire «questo agente sta per toccare questi nodi»; un
 * secondo evento `agent:done` senza un lavoro asincrono da chiudere non aggiungerebbe informazione.
 *
 * Il fallimento dell'annuncio non blocca MAI la scrittura: un client Realtime irraggiungibile non è
 * un motivo per rifiutare un'operazione che altrimenti riuscirebbe. `write-tool.ts` chiama questa
 * funzione con `.catch(() => {})`.
 */
import { createClient } from '@supabase/supabase-js';
import { env as publicEnv } from '$env/dynamic/public';
import type { Actor } from '$lib/server/repos/actor';

export async function announcePresence(input: {
  canvasId: string;
  nodeIds: string[];
  actor: Actor;
}): Promise<void> {
  const url = publicEnv.PUBLIC_SUPABASE_URL;
  const key = publicEnv.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return;

  const client = createClient(url, key, { auth: { persistSession: false } });
  const channel = client.channel(`canvas:${input.canvasId}`);

  await new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      channel
        .send({
          type: 'broadcast',
          event: 'agent:active',
          payload: { actorKind: input.actor.kind, agentKey: input.actor.agentKey ?? null, nodeIds: input.nodeIds }
        })
        .finally(() => resolve());
    });
  });

  await client.removeChannel(channel).catch(() => {});
}
