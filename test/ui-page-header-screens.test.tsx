// @vitest-environment jsdom
/**
 * #887 (audit UI-04) — People, Overview, Documents (#916: the PDF builder) and Transit render their h1 through the shared
 * PageHeader (its `.page-header` wrapper and `.page-header-row`), not a bare heading of their own.
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

vi.mock('../src/ui/person-calculation-settings.js', async () => {
  const { DEFAULT_EXTENDED_SETTINGS } = await import('../src/chart/extended-settings.js');
  const { DEFAULT_RULERSHIP_CHOICE } = await import('../src/astrology/rulership.js');
  return {
    usePersonCalculationSettings: () => ({
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      unreadable: false,
    }),
  };
});

const { People } = await import('../src/ui/People.js');
const { Overview } = await import('../src/ui/Overview.js');
const { PdfExportBuilder } = await import('../src/ui/PdfExportBuilder.js');
const { TransitView } = await import('../src/ui/TransitView.js');

async function headingOf(node: React.ReactNode): Promise<HTMLHeadingElement> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(node);
      await Promise.resolve();
    });
    const h1 = container.querySelector('h1');
    if (h1 === null) throw new Error('no h1 rendered');
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    return h1;
  } finally {
    act(() => {
      root.unmount();
    });
    container.remove();
  }
}

function expectPageHeader(h1: HTMLHeadingElement): void {
  expect(h1.parentElement?.className).toBe('page-header-row');
  expect(h1.parentElement?.parentElement?.className).toBe('page-header');
  expect(h1.textContent).not.toBe('');
}

describe('one PageHeader pattern (#887)', () => {
  it('People', async () => {
    expectPageHeader(await headingOf(<People />));
  });

  it('Overview', async () => {
    expectPageHeader(await headingOf(<Overview personId="p1" />));
  });

  it('Documents (the PDF builder, #916)', async () => {
    expectPageHeader(await headingOf(<PdfExportBuilder />));
  });

  it('Transit', async () => {
    expectPageHeader(await headingOf(<TransitView personId="p1" />));
  });
});
