import type { RealtimeChannel, RealtimePostgresChangesPayload, SupabaseClient } from '@supabase/supabase-js';
import { dedupePresence, type PresencePeer } from './presence-peers';

export type CanvasChange = RealtimePostgresChangesPayload<Record<string, unknown>>;

type CanvasConnection = {
	client: SupabaseClient;
	canvasId: string;
	peer: PresencePeer;
	onChange: (change: CanvasChange) => void;
	onPeers: (peers: PresencePeer[]) => void;
	onReconnect: () => void;
	onError?: (error: unknown) => void;
};

export function connectCanvas(options: CanvasConnection): () => void {
	const { client, canvasId, peer, onChange, onPeers, onReconnect } = options;
	let closed = false;
	let channel: RealtimeChannel | null = null;

	async function open(): Promise<void> {
		const { data } = await client.auth.getSession();
		if (closed || !data.session?.access_token) {
			return;
		}

		await client.realtime.setAuth(data.session.access_token);
		if (closed) {
			return;
		}

		channel = client.channel(`canvas:${canvasId}`, {
			config: { private: true, presence: { key: peer.userId } }
		});

		for (const table of ['nodes', 'nodes_connections']) {
			channel.on('postgres_changes', {
				event: '*', schema: 'public', table, filter: `canvas_id=eq.${canvasId}`
			}, (change) => {
				if (!closed) {
					onChange(change);
				}
			});
		}

		channel.on('presence', { event: 'sync' }, () => {
			if (!closed && channel) {
				onPeers(dedupePresence(channel.presenceState<Partial<PresencePeer>>(), peer.userId, peer));
			}
		});

		channel.subscribe((status, error) => {
			if (closed) {
				return;
			}
			if (status === 'SUBSCRIBED') {
				void channel?.track(peer).catch(options.onError ?? (() => {}));
				onReconnect();
				return;
			}
			onPeers([]);
			if (error) {
				options.onError?.(error);
			}
		});
	}

	void open().catch((error) => {
		if (!closed) {
			options.onError?.(error);
		}
	});

	return () => {
		closed = true;
		onPeers([]);
		if (channel) {
			void client.removeChannel(channel);
		}
	};
}
