/**
 * COLLEGARE UNA SELEZIONE A UN NODO — nuovo o già sulla tela, la stessa domanda: quale porta del
 * bersaglio riceve quale sorgente, e chi resta fuori.
 *
 * PURO: nessun database. `connectorsFor` dice quali porte esistono sul bersaglio (dal suo tipo e
 * dalle modalità del modello scelto — la stessa funzione che disegna le maniglie sulla tile);
 * `isListValued` dice se una porta regge più di un filo, la stessa domanda che `connector-ports.ts`
 * fa per UN arco alla volta. Questo file la applica su PIÙ sorgenti insieme, che è il caso nuovo.
 *
 * UNA SORGENTE PER PORTA, DETERMINISTICO: l'ordine è quello della selezione. Una porta a valore
 * singolo già assegnata in questo stesso giro rifiuta la sorgente successiva con lo stesso motivo
 * di una porta occupata da un arco che c'era già — «già collegato», non «due volte lo stesso
 * errore diverso». Una porta a valore multiplo (`images`/`videos`/`audios`) accetta tutte le
 * sorgenti del suo medium, nell'ordine.
 *
 * IL MEDIUM DI UNA SORGENTE VIENE DAL SUO TIPO DI NODO — `text`/`image`/`video` sono anche il loro
 * medium; un `doc` è testo (ciò che porta è testo scritto), gli altri tipi (`iframe`, `products`,
 * `social_account_feed`, `influencer`) non hanno un medium che questo file sappia offrire e sono
 * sempre respinti, con lo stesso motivo di un `canConnect` negativo su un ruolo che non alimenta.
 */
import { connectorsFor, isListValued, type ConnectorType, type GenerativeNodeKind, type Modalities } from './connectors';

export type ConnectSource = { id: string; type: string };

export type ConnectWire = { sourceId: string; connector: ConnectorType };
export type ConnectRejection = { sourceId: string; why: string };

export type ConnectSelectionPlan = { wires: ConnectWire[]; rejected: ConnectRejection[] };

const MEDIUM_OF_TYPE: Record<string, 'text' | 'image' | 'video'> = {
  text: 'text',
  image: 'image',
  video: 'video',
  doc: 'text'
};

const CONNECTOR_OF_MEDIUM: Record<'text' | 'image' | 'video', ConnectorType> = {
  text: 'text',
  image: 'images',
  video: 'videos'
};

export function planConnectSelection(input: {
  sources: ConnectSource[];
  target: { kind: GenerativeNodeKind; modalities: Modalities };
}): ConnectSelectionPlan {
  const connectors = new Set(connectorsFor(input.target.kind, input.target.modalities));
  const wires: ConnectWire[] = [];
  const rejected: ConnectRejection[] = [];
  const taken = new Set<ConnectorType>();

  for (const source of input.sources) {
    const medium = MEDIUM_OF_TYPE[source.type];
    if (!medium) {
      rejected.push({ sourceId: source.id, why: `${source.type} non alimenta un nodo che genera` });
      continue;
    }

    const connector = CONNECTOR_OF_MEDIUM[medium];
    if (!connectors.has(connector)) {
      rejected.push({ sourceId: source.id, why: `questo modello non accetta ${connector} in ingresso` });
      continue;
    }

    if (!isListValued(connector) && taken.has(connector)) {
      rejected.push({ sourceId: source.id, why: `porta ${connector} già occupata da un'altra sorgente scelta` });
      continue;
    }

    taken.add(connector);
    wires.push({ sourceId: source.id, connector });
  }

  return { wires, rejected };
}
