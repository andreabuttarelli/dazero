import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';

/**
 * UN ZERNIO FINTO, MAI IL VERO. `publishing/zernio.ts` parla HTTP puro (`POST /posts`, `GET
 * /posts/:id`, `DELETE /posts/:id`) — questo server risponde alla stessa forma, in memoria, così
 * le spec e2e che programmano/pubblicano/cancellano possono provare il giro intero (rotta →
 * post-delivery.ts → HTTP → torna un id → si legge lo stato) senza toccare un account vero.
 *
 * Lo stato vive in una Map per `postId`: `POST /posts` lo crea, `GET /posts/:id` lo legge,
 * `DELETE /posts/:id` lo toglie — la stessa forma che RemotePostStatus si aspetta.
 */
export type MockZernioPost = {
  id: string;
  content: string;
  platforms: { platform: string; accountId: string }[];
  mediaItems?: { type: string; url: string }[];
  scheduledFor?: string;
  status: 'scheduled' | 'published';
};

export type MockZernio = {
  url: string;
  posts: Map<string, MockZernioPost>;
  close: () => Promise<void>;
};

export async function startMockZernio(port: number): Promise<MockZernio> {
  const posts = new Map<string, MockZernioPost>();

  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
      const url = new URL(req.url ?? '/', 'http://mock-zernio');
      const send = (status: number, payload: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
      };

      if (req.method === 'POST' && url.pathname === '/posts') {
        const id = randomUUID();
        const post: MockZernioPost = {
          id,
          content: body.content,
          platforms: body.platforms ?? [],
          mediaItems: body.mediaItems,
          scheduledFor: body.scheduledFor,
          status: body.scheduledFor ? 'scheduled' : 'published'
        };
        posts.set(id, post);
        send(200, { post: { id } });
        return;
      }

      const postIdMatch = url.pathname.match(/^\/posts\/([^/]+)$/);
      if (req.method === 'GET' && postIdMatch) {
        const post = posts.get(postIdMatch[1]);
        if (!post) return send(404, { error: 'not_found' });
        send(200, {
          post: {
            status: post.status,
            scheduledFor: post.scheduledFor ?? null,
            platforms: post.platforms.map((p) => ({
              ...p,
              status: post.status,
              platformPostUrl: `https://mock.zernio/${post.id}`
            }))
          }
        });
        return;
      }

      if (req.method === 'DELETE' && postIdMatch) {
        posts.delete(postIdMatch[1]);
        send(200, { ok: true });
        return;
      }

      send(404, { error: 'unhandled_route', method: req.method, path: url.pathname });
    });
  });

  // Un crash a metà run (es. un test che va in timeout) può lasciare un mock precedente vivo
  // sulla stessa porta: EADDRINUSE qui altrimenti butta giù l'intero processo Playwright con uno
  // stack trace che non dice "un mock Zernio è già lì", solo "la porta è occupata". Riusarlo è
  // corretto — è lo stesso doppio dietro il mock, solo di un run precedente.
  await new Promise<void>((resolve, reject) => {
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        server.close();
        resolve();
        return;
      }
      reject(err);
    });
    server.listen(port, resolve);
  });

  return {
    url: `http://127.0.0.1:${port}`,
    posts,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())))
  };
}
