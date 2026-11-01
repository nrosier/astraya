// @vitest-environment jsdom
/**
 * #975 — the PDF builder's standardized layout in the DOM. The subtitle comes from the shared PageHeader (#966); the
 * left column's three sections are encapsulated card surfaces; the export summary aside is the sticky wrapper.
 * Build PDF and Starting point stay in the header, per #916's recorded owner decision.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

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

describe('PDF builder standard layout (#975)', () => {
  it('shows the issue subtitle under the title, through the shared PageHeader', async () => {
    const container = await render();
    const subtitle = container.querySelector('.page-header-subtitle');
    expect(subtitle?.textContent).toBe(
      'Assemble custom sections, interpretations, and chart calculations into a printable document.',
    );
    expect(subtitle?.parentElement?.className).toBe('page-header');
  });

  it('groups the three left-column sections in encapsulated card surfaces', async () => {
    const container = await render();
    const cards = [...container.querySelectorAll('.pdf-builder-card')];
    expect(cards).toHaveLength(3);
    // Card 3 holds the Chart sections heading and the five stacked disclosures.
    const chartCard = cards[2];
    expect(chartCard?.querySelector('h2')?.textContent).toBe('Chart sections');
    expect(chartCard?.querySelectorAll('.primitive-disclosure-trigger')).toHaveLength(5);
  });

  it('marks the export summary aside as the sticky wrapper', async () => {
    const container = await render();
    const summary = container.querySelector('aside');
    expect(summary?.classList.contains('pdf-summary-sticky')).toBe(true);
  });

  it('updates the export summary list when a section is ticked', async () => {
    const container = await render();
    const birthRecord = [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find(
      (box) => box.closest('label')?.textContent.trim() === 'Birth record',
    );
    expect(birthRecord).toBeDefined();
    await act(async () => {
      birthRecord?.click();
      await Promise.resolve();
    });
    const items = [...container.querySelectorAll('aside li')].map((item) => item.textContent);
    expect(items).toContain('Birth record');
  });
});
