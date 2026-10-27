// @vitest-environment jsdom
/**
 * #800 / D-800b: the consultation transit table. A contact with no further exact pass shows an em dash named
 * "No further exact pass"; others show the date. State is a badge, accented while applying. The frame is the shared
 * data-table scroll region, so a phone scrolls the table sideways rather than restacking it.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { ConsultationTransitTable } from '../src/ui/ConsultationTransitTable.tsx';
import { consultationViewMessages } from '../src/ui/ConsultationView.messages.ts';

let root: Root | undefined;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  document.body.replaceChildren();
});

describe('ConsultationTransitTable (#800)', () => {
  it('words the four columns, a date or a named em dash per row, and badges the state', () => {
    const t = consultationViewMessages.en;
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root?.render(
        <ConsultationTransitTable
          caption="Major active transits"
          labels={{
            aspect: t.colAspect,
            orb: t.colOrb,
            state: t.colState,
            nextExact: t.colNextExact,
            noPass: t.noFurtherPass,
          }}
          rows={[
            {
              key: 'a',
              aspect: 'Pluto conjunct Moon',
              orb: '0°06′',
              state: 'Applying',
              applying: true,
              nextExact: '2026-11-07',
            },
            {
              key: 'b',
              aspect: 'Neptune opposite Pluto',
              orb: '0°00′',
              state: 'Separating',
              applying: false,
              nextExact: undefined,
            },
          ]}
        />,
      );
    });
    expect([...container.querySelectorAll('th')].map((th) => th.textContent)).toEqual([
      'Aspect',
      'Orb',
      'State',
      'Next exact date',
    ]);
    expect(container.querySelector('.data-table-scroll')).not.toBeNull();
    const dashes = container.querySelectorAll('[role="img"][aria-label="No further exact pass"]');
    expect(dashes).toHaveLength(1);
    expect(dashes[0]?.textContent).toBe('—');
    expect(container.querySelector('time')?.getAttribute('datetime')).toBe('2026-11-07');
    expect(container.querySelector('.primitive-badge[data-tone="accent"]')?.textContent).toBe('Applying');
    expect(container.querySelector('.primitive-badge:not([data-tone])')?.textContent).toBe('Separating');
  });
});
