// @vitest-environment jsdom
/**
 * Tests for PrintProvenance (#564): the printed-page provenance footer, invisible on screen
 * (CSS-only concern, not tested here) but its text content must be present in the DOM for the
 * browser's print engine to actually render it.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { PrintProvenance } from '../src/ui/PrintProvenance.js';

let mounted: { container: HTMLElement; root: Root } | undefined;

afterEach(() => {
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
});

function mount(element: React.ReactElement): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  mounted = { container, root };
  return container;
}

describe('PrintProvenance (#564)', () => {
  it('renders the house system, zodiac, rulership and generated-at text', () => {
    const container = mount(
      <PrintProvenance
        houseSystem="Placidus"
        zodiac="Tropical"
        rulership="Modern"
        snapshotIdentity="v1-deadbeef"
        generatedAt="2026-10-13 09:00"
      />,
    );
    const text = container.textContent;
    expect(text).toContain('Placidus');
    expect(text).toContain('Tropical');
    expect(text).toContain('Modern');
    expect(text).toContain('v1-deadbeef');
    expect(text).toContain('2026-10-13 09:00');
  });

  it('renders into an element the print stylesheet can target', () => {
    const container = mount(
      <PrintProvenance
        houseSystem="Koch"
        zodiac="Sidereal (ayanamsa 1)"
        rulership="Traditional"
        snapshotIdentity="v1-00000000"
        generatedAt="x"
      />,
    );
    expect(container.querySelector('.print-provenance')).not.toBeNull();
  });
});
