import { describe, expect, it } from 'vitest';
import { TEXT_NODE_MAX_HEIGHT, TEXT_NODE_MIN_HEIGHT, grownTextNodeHeight } from './text-node-grow';

describe('un nodo testo cresce col contenuto, dentro un tetto', () => {
  it('un contenuto più basso del minimo resta al minimo, non si restringe sotto', () => {
    expect(grownTextNodeHeight(50)).toBe(TEXT_NODE_MIN_HEIGHT);
  });

  it('un contenuto fra il minimo e il massimo detta l altezza', () => {
    const measured = TEXT_NODE_MIN_HEIGHT + 80;
    expect(grownTextNodeHeight(measured)).toBe(measured);
  });

  it('un contenuto più alto del tetto si ferma al tetto — oltre, scorre dentro', () => {
    expect(grownTextNodeHeight(TEXT_NODE_MAX_HEIGHT + 500)).toBe(TEXT_NODE_MAX_HEIGHT);
  });

  it('un nodo ridimensionato a mano non cresce da solo: l altezza dell utente vince sempre', () => {
    const userHeight = 300;
    expect(grownTextNodeHeight(TEXT_NODE_MAX_HEIGHT + 500, userHeight)).toBe(userHeight);
  });
});
