import { createContext } from 'svelte';

/** Chi scrive quando un nodo finisce di essere ridimensionato — passato una volta da
 *  `CanvasFlow.svelte`, letto da ogni `CanvasTile` senza un prop per ognuna: la stessa forma di
 *  `tile-render-context.ts`, per lo stesso motivo. */
export type TileResize = (id: string, w: number, h: number) => void;

export const [getTileResize, setTileResize] = createContext<() => TileResize | undefined>();
