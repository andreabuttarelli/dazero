import { describe, expect, it } from 'vitest';
import { chatEndpoint } from './chat-endpoint';

describe('chatEndpoint', () => {
  it('prefers the live brand thread while the project route is still landing', () => {
    expect(chatEndpoint({ projectId: 'p1', brandSlug: 'demo' })).toBe('/api/v1/brands/demo/agent');
  });

  it('scopes a brandless project to its own thread', () => {
    expect(chatEndpoint({ projectId: 'p1' })).toBe('/api/v1/projects/p1/agent');
  });

  it('stays silent without any scope so the client never fetches', () => {
    expect(chatEndpoint({})).toBe('');
    expect(chatEndpoint({ projectId: '', brandSlug: '' })).toBe('');
  });
});
