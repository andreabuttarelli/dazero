import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { configureMediaTexture } from './scene';

describe('configureMediaTexture', () => {
  it('disables pixel-store flags forbidden by WebGL texture arrays', () => {
    const texture = new THREE.Texture();
    texture.flipY = true;
    texture.premultiplyAlpha = true;

    configureMediaTexture(texture);

    expect(texture.flipY).toBe(false);
    expect(texture.premultiplyAlpha).toBe(false);
  });
});
