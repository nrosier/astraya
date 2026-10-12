// @vitest-environment jsdom
/**
 * The shared result-state message (#513): an error is announced at once, every other state politely, a working state
 * is marked busy — and no screen hand-rolls the `.warning`/`.status` paragraph any more.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { STATUS_KINDS, StatusMessage } from '../src/ui/primitives/StatusMessage.js';

function render(kind: (typeof STATUS_KINDS)[number]): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  act(() => {
    createRoot(container).render(<StatusMessage kind={kind}>text</StatusMessage>);
  });
  const message = container.querySelector('p');
  if (message === null) throw new Error('no message rendered');
  return message;
}

describe('StatusMessage (#513)', () => {
  it.each(STATUS_KINDS)('%s carries its kind and the right live-region role', (kind) => {
    const message = render(kind);
    expect(message.dataset.kind).toBe(kind);
    expect(message.getAttribute('role')).toBe(kind === 'error' ? 'alert' : 'status');
    expect(message.getAttribute('aria-busy') === 'true').toBe(kind === 'loading' || kind === 'updating');
  });

  it('is used instead of a hand-rolled warning or loading paragraph', () => {
    const offenders = readdirSync('src/ui')
      .filter((name) => name.endsWith('.tsx'))
      .filter((name) =>
        /<p className="(?:warning" role="alert|status)">/.test(readFileSync(`src/ui/${name}`, 'utf-8')),
      );
    expect(offenders).toEqual([]);
  });
});
