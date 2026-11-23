// @vitest-environment jsdom
/**
 * #1854: each of the Condition, Dispositors and Reception sections on Patterns & condition has one header, the table's
 * caption, with its "?" beside it. No h4, no definition paragraph, no glossary underline; the "?" carries the whole
 * definition in en and nl and opens on click and keyboard focus; Copy and Download CSV are unchanged. Real computed chart.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ChartData } from '../src/domain/chart-compute.js';
import { computeChartData } from '../src/domain/chart-compute.js';
import { ChartDataView } from '../src/ui/ChartView.js';
import { chartViewMessages } from '../src/ui/ChartView.messages.js';
import { setLocale } from '../src/ui/locale.js';
import { getEngine } from './engine-harness.js';

type Locale = 'en' | 'nl';

let data: ChartData;
let mounted: { container: HTMLElement; root: Root } | undefined;

beforeAll(async () => {
  data = await computeChartData(
    {
      civil: { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      coordinates: { latitude: 41.1833, longitude: -84.7333 },
      zoneOverride: 'America/New_York',
    },
    await getEngine(),
  );
}, 60_000);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
  setLocale('en');
});

async function mountOnPatterns(locale: Locale): Promise<HTMLElement> {
  setLocale(locale);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ChartDataView
        rulership="modern"
        load={{ kind: 'ready', data }}
        displayName="Test"
        showHouses
        buildViewHref={() => '#'}
      />,
    );
    await Promise.resolve();
  });
  await act(async () => {
    Array.from(container.querySelectorAll<HTMLAnchorElement>('.chart-view-link'))
      .find((link) => link.textContent === chartViewMessages[locale].patternsViewLabel)
      ?.click();
    await Promise.resolve();
  });
  mounted = { container, root };
  return container;
}

const sections = (locale: Locale): readonly { caption: string; tooltip: string; label: string; csv: string }[] => {
  const t = chartViewMessages[locale];
  return [
    { caption: t.conditionCaption, tooltip: t.conditionTooltip, label: t.conditionTooltipLabel, csv: 'condition' },
    {
      caption: t.dispositorsCaption,
      tooltip: t.dispositorsTooltip,
      label: t.dispositorsTooltipLabel,
      csv: 'dispositors',
    },
    { caption: t.receptionCaption, tooltip: t.receptionTooltip, label: t.receptionTooltipLabel, csv: 'reception' },
  ];
};

function tableSection(container: HTMLElement, caption: string): Element {
  const found = [...container.querySelectorAll('#chart-view-patterns section.data-table')].find(
    (section) => section.querySelector('.data-table-head :is(h2, h3)')?.textContent === caption,
  );
  if (found === undefined) throw new Error(`fixture bug: no table captioned ${caption}`);
  return found;
}

describe('one header per section on Patterns & condition (#1854)', () => {
  it.each(['en', 'nl'] as const)(
    'renders the caption with a "?" and no h4 or definition paragraph in %s',
    async (locale) => {
      const container = await mountOnPatterns(locale);
      const panel = container.querySelector('#chart-view-patterns');
      expect(panel?.querySelector('h4')).toBeNull();
      for (const { caption, label } of sections(locale)) {
        const section = tableSection(container, caption);
        expect(section.querySelectorAll('.data-table-head :is(h2, h3, h4)')).toHaveLength(1);
        expect(section.querySelector(`.data-table-head button[aria-label="${label}"]`)?.textContent).toBe('?');
        // The caption stays the table's accessible name, and carries no glossary underline.
        const heading = section.querySelector('.data-table-head :is(h2, h3)');
        expect(section.querySelector('table')?.getAttribute('aria-labelledby')).toBe(heading?.id);
        expect(heading?.querySelector('.glossary-term')).toBeNull();
        expect(section.previousElementSibling?.matches('p.hint')).toBe(false);
      }
    },
  );

  it.each(['en', 'nl'] as const)(
    'has the merged definition in each "?" tooltip in %s, opened by click and by focus',
    async (locale) => {
      const container = await mountOnPatterns(locale);
      for (const { caption, tooltip, label } of sections(locale)) {
        const button = tableSection(container, caption).querySelector<HTMLButtonElement>(
          `button[aria-label="${label}"]`,
        );
        expect(button).not.toBeNull();
        await act(async () => {
          button?.click();
          await Promise.resolve();
        });
        expect(button?.getAttribute('aria-expanded')).toBe('true');
        expect(container.querySelector('[role="tooltip"]')?.textContent).toBe(tooltip);
        // Close it (a second click), then open it again by keyboard focus alone.
        await act(async () => {
          button?.click();
          await Promise.resolve();
        });
        expect(button?.getAttribute('aria-expanded')).toBe('false');
        await act(async () => {
          button?.focus();
          await Promise.resolve();
        });
        expect(button?.getAttribute('aria-expanded')).toBe('true');
        expect(container.querySelector('[role="tooltip"]')?.textContent).toBe(tooltip);
        await act(async () => {
          button?.blur();
          await Promise.resolve();
        });
      }
    },
  );

  it('keeps what each removed paragraph said in the tooltip, in both languages, with no Hint string left', () => {
    const en = chartViewMessages.en;
    const nl = chartViewMessages.nl;
    expect(en.dispositorsTooltip).toContain('final dispositor');
    expect(nl.dispositorsTooltip).toContain('uiteindelijke dispositor');
    expect(en.receptionTooltip).toContain('Mutual reception');
    expect(en.receptionTooltip).toContain('Aspect-linked reception');
    expect(nl.receptionTooltip).toContain('Wederzijdse receptie');
    expect(nl.receptionTooltip).toContain('Receptie met aspect');
    expect(en.conditionTooltip).toContain('standard first read');
    expect(nl.conditionTooltip).toContain('eerste blik');
    for (const bundle of [en, nl]) {
      expect(Object.keys(bundle).filter((key) => /^(condition|dispositors|reception)Hint$/.test(key))).toEqual([]);
    }
  });

  it('still offers Copy and Download CSV on all three tables, with unchanged CSV filenames', async () => {
    const container = await mountOnPatterns('en');
    const downloads: string[] = [];
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });
    for (const { caption, csv } of sections('en')) {
      const buttons = [...tableSection(container, caption).querySelectorAll('.data-table-actions button')];
      expect(buttons.map((button) => button.textContent)).toEqual(['Copy', 'Download CSV']);
      await act(async () => {
        buttons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();
      });
      expect(downloads.at(-1)).toBe(`test-${csv}.csv`);
    }
  });
});
