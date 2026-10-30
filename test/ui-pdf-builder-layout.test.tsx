// @vitest-environment jsdom
/**
 * #916 — the Documents page is the PDF builder itself. One h1 in the shared PageHeader; the starting point and Build PDF
 * sit in its action area; the advanced groups start collapsed (the shared AdvancedGroup primitive); the Charts
 * section has no checkbox of its own; consultation notes are a disabled, planned item until #919.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { pdfExportMessages } from '../src/ui/pdf-export.messages.js';

vi.mock('../src/ui/EphemerisProviderContext.js', () => {
  const provider = { julianDayFromUtc: () => new Promise<number>(() => undefined) };
  return { useEphemerisProvider: () => ({ provider, error: undefined }) };
});

vi.mock('../src/ui/store-context.js', () => {
  const state = {
    deleted: { people: new Map() },
    people: new Map([
      [
        'p1',
        {
          id: 'p1',
          displayName: 'Test',
          timeAccuracy: 'exact',
          moment: {
            civil: { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
            coordinates: { latitude: 41.1833, longitude: -84.7333 },
            zoneOverride: 'America/New_York',
          },
        },
      ],
    ]),
  };
  return { useStoreState: () => state, useStore: () => ({}), useOptionalStore: () => undefined };
});

vi.mock('../src/ui/PdfAiInterpretationPicker.js', () => ({ PdfAiInterpretationPicker: () => <div /> }));

const { PdfExportBuilder } = await import('../src/ui/PdfExportBuilder.js');
const { setLocale } = await import('../src/ui/locale.js');

async function render(): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<PdfExportBuilder />);
    await Promise.resolve();
  });
  return container;
}

describe('the Documents page is the PDF builder (#916)', () => {
  it('has one h1 in the shared PageHeader, with the starting point and Build PDF in its action area', async () => {
    const container = await render();
    const h1 = container.querySelector('h1');
    expect(h1?.textContent).toBe(pdfExportMessages.en.heading);
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(h1?.parentElement?.className).toBe('page-header-row');
    const actions = container.querySelector('.pdf-build-actions');
    expect(actions?.closest('.page-header')).not.toBeNull();
    expect(container.querySelector('.pdf-header-preset select')).not.toBeNull();
    expect(container.querySelector('a[href="#/people"]')).toBeNull();
  });

  it('starts every advanced group collapsed', async () => {
    const container = await render();
    const triggers = [...container.querySelectorAll<HTMLButtonElement>('.primitive-disclosure-trigger')];
    expect(triggers).toHaveLength(5);
    for (const trigger of triggers) expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelectorAll('.primitive-disclosure.open')).toHaveLength(0);
  });

  it('has no Charts-level checkbox: Charts is a disclosure only', async () => {
    const container = await render();
    const boxes = [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    expect(boxes.some((box) => box.closest('label')?.textContent.trim() === pdfExportMessages.en.chartsLegend)).toBe(
      false,
    );
  });

  it('marks consultation notes as planned and disabled, and keeps the Sabian option out of the top level', async () => {
    const container = await render();
    const notes = [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find(
      (box) => box.closest('label')?.textContent.trim() === pdfExportMessages.en.consultationNotesLabel,
    );
    expect(notes?.disabled).toBe(true);
    expect(container.textContent).toContain(pdfExportMessages.en.consultationNotesPlanned);
    // The Sabian option only appears under Interpretation, once the written report is ticked (the default selection has none).
    expect(container.textContent).not.toContain(pdfExportMessages.en.interpretationSabianLabel);
  });

  it('renders the same heading and planned item in Dutch', async () => {
    setLocale('nl');
    try {
      const container = await render();
      expect(container.querySelector('h1')?.textContent).toBe(pdfExportMessages.nl.heading);
      expect(container.textContent).toContain(pdfExportMessages.nl.consultationNotesPlanned);
    } finally {
      setLocale('en');
    }
  });
});
