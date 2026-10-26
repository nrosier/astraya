// @vitest-environment jsdom
/**
 * Staged Overlay settings contract (#569, #826): a closed-by-default Disclosure row opens the panel in flow,
 * selecting a source enables its contextual input only in the draft, Cancel closes and drops the draft,
 * and Apply closes and commits it once; focus returns to the trigger.
 */
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ChartOverlaySettingsPanel,
  DEFAULT_CHART_OVERLAY_SETTINGS,
  orderedChartOverlaySources,
  type ChartOverlaySettings,
} from '../src/ui/ChartOverlaySettingsPanel.js';

let mounted: { readonly root: Root; readonly container: HTMLElement } | undefined;

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('expected test element');
  return value;
}

function Harness(): React.JSX.Element {
  const [value, setValue] = useState<ChartOverlaySettings>(DEFAULT_CHART_OVERLAY_SETTINGS);
  return (
    <>
      <ChartOverlaySettingsPanel value={value} baseLabel="Natal" unavailableSources={['natal']} onApply={setValue} />
      <output>{String(value.transit)}</output>
    </>
  );
}

afterEach(() => {
  if (mounted === undefined) return;
  act(() => {
    mounted?.root.unmount();
  });
  mounted.container.remove();
  mounted = undefined;
});

async function mount(): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<Harness />);
    await Promise.resolve();
  });
  mounted = { root, container };
  return container;
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
}

describe('ChartOverlaySettingsPanel', () => {
  it('orders every selected optional source independently', () => {
    expect(
      orderedChartOverlaySources({
        ...DEFAULT_CHART_OVERLAY_SETTINGS,
        transit: true,
        progressed: true,
        directed: true,
        return: true,
        order: ['return', 'directed', 'progressed', 'transit', 'natal', 'draconic', 'relocated'],
      }),
    ).toEqual(['return', 'directed', 'progressed', 'transit']);
  });

  it('keeps inputs inactive until their overlay is selected and commits only on Apply', async () => {
    const container = await mount();
    expect(container.querySelector('dialog')).toBeNull();
    const closedTrigger = must(container.querySelector<HTMLButtonElement>('button.primitive-disclosure-trigger'));
    expect(closedTrigger.getAttribute('aria-expanded')).toBe('false');
    expect(closedTrigger.textContent).toContain('Show overlay settings');
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    await click(closedTrigger);
    expect(must(container.querySelector('button.primitive-disclosure-trigger')).textContent).toContain(
      'Hide overlay settings',
    );

    const checkboxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    const natal = must(checkboxes.item(0));
    const transit = must(checkboxes.item(2));
    const date = must(container.querySelector<HTMLInputElement>('input[type="date"]'));
    expect(natal.disabled).toBe(true);
    expect(date.disabled).toBe(true);

    await click(transit);
    expect(date.disabled).toBe(false);
    await click(must([...container.querySelectorAll('button')].find((button) => button.textContent === 'Cancel')));
    expect(container.querySelector('output')?.textContent).toBe('false');
    const reopened = must(container.querySelector<HTMLButtonElement>('button.primitive-disclosure-trigger'));
    expect(reopened.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(reopened);

    await click(reopened);
    await click(must(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').item(2)));
    await click(
      must([...container.querySelectorAll('button')].find((button) => button.textContent === 'Apply overlays')),
    );
    expect(container.querySelector('output')?.textContent).toBe('true');
    const afterApply = must(container.querySelector<HTMLButtonElement>('button.primitive-disclosure-trigger'));
    expect(afterApply.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(afterApply);
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
  });

  it('offers contextual inputs for primary directions and both return types', async () => {
    const container = await mount();
    await click(must(container.querySelector('button.primitive-disclosure-trigger')));

    expect(container.textContent).toContain('Primary directed ring');
    expect(container.textContent).toContain('Return ring');
    // The return type is a segmented choice (#615), disabled until a return ring is turned on.
    const returnType = [...container.querySelectorAll<HTMLElement>('[role="radiogroup"]')].find(
      (group) => group.getAttribute('aria-label') === 'Return type',
    );
    const radios = [...(returnType?.querySelectorAll<HTMLInputElement>('input[type="radio"]') ?? [])];
    expect(radios).toHaveLength(2);
    expect(radios.every((radio) => radio.disabled)).toBe(true);
  });
});
