import { createContext, type Snippet } from 'svelte';

export type TileRender = Snippet<[{ id: string; selected: boolean }]>;

export const [getTileRender, setTileRender] = createContext<() => TileRender>();
