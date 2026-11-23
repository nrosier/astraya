// @vitest-environment jsdom
/**
 * #1845 — the PDF builder offers the primary-directions section: ticked it shows the time key, the direction mode and
 * the three parts (Active table, All directions table, Bi-wheel); unticked it hides them. Checked in en and nl.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pdfExportMessages } from '../src/ui/pdf-export.messages.js';
import { primaryDirectionsViewMessages } from '../src/ui/PrimaryDirectionsView.messages.js';
import { timingBasisMessages } from '../src/ui/timing-basis.messages.js';

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

const mounted: { root: ReturnType<typeof createRoot>; container: HTMLElement }[] = [];

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => {
      root.unmount();
    });
    container.remove();
  }
  setLocale('en');
});

async function render(): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => {
    root.render(<PdfExportBuilder />);
    await Promise.resolve();
  });
  return container;
}

/** The checkbox whose label text is `label`. */
function checkboxFor(container: HTMLElement, label: string): HTMLInputElement | undefined {
  return [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find(
    (box) => box.closest('label')?.textContent.trim() === label,
  );
}

/** Opens the predictive group (collapsed by default) so the primary-directions checkbox is rendered. */
function openPredictiveGroup(container: HTMLElement, title: string): void {
  const trigger = [...container.querySelectorAll<HTMLButtonElement>('.primitive-disclosure-trigger')].find((button) =>
    button.textContent.includes(title),
  );
  if (trigger === undefined) throw new Error(`no disclosure titled ${title}`);
  if (trigger.getAttribute('aria-expanded') === 'true') return;
  act(() => {
    trigger.click();
  });
}

function clickCheckbox(container: HTMLElement, label: string): void {
  const box = checkboxFor(container, label);
  if (box === undefined) throw new Error(`no checkbox labelled ${label}`);
  act(() => {
    box.click();
  });
}

describe('the PDF builder primary-directions section (#1845)', () => {
  it.each(['en', 'nl'] as const)(
    'adds the section with its key, mode and three parts, then removes it (%s)',
    async (locale) => {
      setLocale(locale);
      const t = pdfExportMessages[locale];
      const timing = timingBasisMessages[locale];
      const directions = primaryDirectionsViewMessages[locale];
      const container = await render();
      openPredictiveGroup(container, t.predictiveLegend);

      expect(checkboxFor(container, t.primaryDirectionsLabel)?.checked).toBe(false);
      expect(container.textContent).not.toContain(t.primaryDirectionsActiveTableLabel);

      clickCheckbox(container, t.primaryDirectionsLabel);
      expect(checkboxFor(container, t.primaryDirectionsLabel)?.checked).toBe(true);
      expect(checkboxFor(container, t.primaryDirectionsActiveTableLabel)?.checked).toBe(true);
      expect(checkboxFor(container, t.primaryDirectionsAllTableLabel)?.checked).toBe(true);
      expect(checkboxFor(container, t.primaryDirectionsWheelLabel)?.checked).toBe(true);
      expect(container.textContent).toContain(t.primaryDirectionsKeyLabel);
      expect(container.textContent).toContain(timing.directionKeys.naibod);
      expect(container.textContent).toContain(timing.directionKeys.ptolemy);
      expect(container.textContent).toContain(timing.directionKeys['true-solar-arc']);
      expect(container.textContent).toContain(t.primaryDirectionsModeLabel);
      expect(container.textContent).toContain(directions.directMode);
      expect(container.textContent).toContain(directions.converseMode);

      clickCheckbox(container, t.primaryDirectionsLabel);
      expect(checkboxFor(container, t.primaryDirectionsLabel)?.checked).toBe(false);
      expect(checkboxFor(container, t.primaryDirectionsActiveTableLabel)).toBeUndefined();
      expect(checkboxFor(container, t.primaryDirectionsWheelLabel)).toBeUndefined();
    },
  );

  it('unticks a part without removing the section', async () => {
    const t = pdfExportMessages.en;
    const container = await render();
    openPredictiveGroup(container, t.predictiveLegend);
    clickCheckbox(container, t.primaryDirectionsLabel);
    clickCheckbox(container, t.primaryDirectionsWheelLabel);
    expect(checkboxFor(container, t.primaryDirectionsWheelLabel)?.checked).toBe(false);
    expect(checkboxFor(container, t.primaryDirectionsLabel)?.checked).toBe(true);
    expect(checkboxFor(container, t.primaryDirectionsActiveTableLabel)?.checked).toBe(true);
  });
});
