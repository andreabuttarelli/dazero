import { describe, expect, it } from 'vitest';
import { parseWorkflowResponse } from '$lib/server/website-capture';

describe('parseWorkflowResponse', () => {
  it('parses a JSON string payload', () => {
    const wf = parseWorkflowResponse(
      JSON.stringify({
        ok: false,
        error: 'click selector not found: #missing',
        url: 'https://app.example.com/login',
        title: 'Sign in',
        bodyStart: 'Email Password Sign in Continue with Google',
        failedStep: { index: 4, action: 'click', selector: '#missing' },
        hints: {
          buttons: [{ tag: 'button', type: 'submit', text: 'Sign in', name: null, id: null, className: 'cta' }],
          inputs: [{ tag: 'input', type: 'email', name: 'email', placeholder: 'Email', id: 'email' }]
        }
      })
    );
    expect(wf.ok).toBe(false);
    expect(wf.failedStep).toMatchObject({ action: 'click', selector: '#missing' });
    expect(wf.hints?.buttons[0]?.text).toBe('Sign in');
    expect(wf.bodyStart).toMatch(/Continue with Google/);
  });

  it('treats a raw base64 string as a successful screenshot', () => {
    const wf = parseWorkflowResponse('iVBORw0KGgoAAAANSUhEUg==');
    expect(wf.ok).toBe(true);
    expect(wf.screenshot).toMatch(/^iVBOR/);
  });

  it('unwraps a { base64 } object from older Browserless wrappers', () => {
    const wf = parseWorkflowResponse({ base64: 'abc123' });
    expect(wf.ok).toBe(true);
    expect(wf.screenshot).toBe('abc123');
  });
});
