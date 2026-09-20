import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PUBLISH = readFileSync(join(import.meta.dirname, 'publish.ts'), 'utf8');

/**
 * L'INGRANDIMENTO ALL'APPROVAZIONE PARTE DAL FILE, NON DAL LAVORO DI PRIMA.
 *
 * Le bozze si renderizzano basse perché quasi nessuna viene pubblicata; l'approvazione è il punto
 * in cui la spesa in più si giustifica. Il fornitore di prima sapeva riprendere il LAVORO originale
 * dal suo `task_id`; `black-forest-labs/flux-video-upscale` no — vuole il video, e senza risponde
 * «requires video input: include an input_references entry of type video_url».
 *
 * `upscaleVideo` quindi torna `undefined` se non gli si passa `videoUrl`, e chi pubblica torna
 * senza ingrandire: la clip esce a 480p per sempre e nessuno se ne accorge, perché un publish non
 * deve MAI fallire per dei pixel. Il file ce l'ha già in mano — è `post.media_url`.
 */
describe('la clip approvata si ingrandisce davvero', () => {
  it('passa il file a upscaleVideo, o l’ingrandimento non avviene mai', () => {
    const call = PUBLISH.slice(PUBLISH.indexOf('await upscaleVideo('));

    expect(
      call.slice(0, 200),
      'senza videoUrl upscaleVideo torna undefined e la clip resta alla risoluzione della bozza'
    ).toMatch(/videoUrl/);
  });
});
