// @vitest-environment jsdom
/**
 * The content header (#506/#509): title always renders; the export dropdown appears only once a
 * screen has registered something, lists grouped/ungrouped items, opens/closes/Escapes, and
 * reports the outcome of running an item.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../src/ui/locale.js';
import { ExportRegistryProvider, useRegisterExports, type ExportItem } from '../src/ui/export-registry.js';
import { PageHeader } from '../src/ui/PageHeader.js';

let mounted: { container: HTMLElement; root: Root } | undefined;

afterEach(() => {
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
  setLocale('en');
});

async function mount(node: React.ReactNode): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
    await Promise.resolve();
  });
  mounted = { container, root };
  return container;
}

/** Stands in for a screen that registers exports while mounted, e.g. ChartView.tsx. */
function Registrar({ items }: { readonly items: readonly ExportItem[] }): React.JSX.Element {
  useRegisterExports(items);
  return <></>;
}

describe('PageHeader (#506/#509)', () => {
  it('renders the title with no export control when nothing is registered', async () => {
    const container = await mount(
      <ExportRegistryProvider>
        <PageHeader title="Natal chart" />
      </ExportRegistryProvider>,
    );
    expect(container.querySelector('h1')?.textContent).toBe('Natal chart');
    expect(container.querySelector('button')).toBeNull();
  });

  it('renders a basis line and the primary action slot when given', async () => {
    const container = await mount(
      <ExportRegistryProvider>
        <PageHeader title="Natal chart" basis="Tropical · Placidus">
          <a href="#/copy-link">Copy share link</a>
        </PageHeader>
      </ExportRegistryProvider>,
    );
    expect(container.querySelector('.page-header-basis')?.textContent).toBe('Tropical · Placidus');
    expect(container.querySelector('a')?.textContent).toBe('Copy share link');
  });

  it('shows the export dropdown once a screen registers items, closed by default', async () => {
    const run = vi.fn();
    const container = await mount(
      <ExportRegistryProvider>
        <PageHeader title="Natal chart" />
        <Registrar items={[{ key: 'svg', label: 'Image (SVG)', run }]} />
      </ExportRegistryProvider>,
    );
    const toggle = container.querySelector('.page-header-export-toggle');
    expect(toggle?.textContent).toBe('Export');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('.page-header-export-menu')).toBeNull();
  });

  it('opens on click, lists ungrouped and grouped items under a heading, and runs an item', async () => {
    const svgRun = vi.fn();
    const pngRun = vi.fn();
    const container = await mount(
      <ExportRegistryProvider>
        <PageHeader title="Natal chart" />
        <Registrar
          items={[
            { key: 'svg', label: 'Image (SVG)', run: svgRun },
            { key: 'png-small', label: 'Image (PNG), Small', group: 'Raster', run: pngRun },
          ]}
        />
      </ExportRegistryProvider>,
    );
    const toggle = container.querySelector<HTMLButtonElement>('.page-header-export-toggle');
    if (toggle === null) throw new Error('fixture bug: no export toggle');
    await act(async () => {
      toggle.click();
      await Promise.resolve();
    });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const items = [...container.querySelectorAll('.page-header-export-item')].map((el) => el.textContent);
    expect(items).toEqual(['Image (SVG)', 'Image (PNG), Small']);
    expect(container.querySelector('.page-header-export-group-heading')?.textContent).toBe('Raster');

    const svgButton = [...container.querySelectorAll<HTMLButtonElement>('.page-header-export-item')].find(
      (el) => el.textContent === 'Image (SVG)',
    );
    if (svgButton === undefined) throw new Error('fixture bug: no SVG item');
    await act(async () => {
      svgButton.click();
      // Two chained .then()s inside PageHeader's run(): one microtask flush is not enough.
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(svgRun).toHaveBeenCalledOnce();
    expect(pngRun).not.toHaveBeenCalled();
    // Choosing an item closes the menu, same as the other header dropdowns (#417).
    expect(container.querySelector('.page-header-export-menu')).toBeNull();
    expect(container.querySelector('.page-header-export-status')?.textContent).toContain('exported');
  });

  it('closes on Escape and puts focus back on the toggle (#417’s shared dropdown rules)', async () => {
    const container = await mount(
      <ExportRegistryProvider>
        <PageHeader title="Natal chart" />
        <Registrar items={[{ key: 'svg', label: 'Image (SVG)', run: vi.fn() }]} />
      </ExportRegistryProvider>,
    );
    const toggle = container.querySelector<HTMLButtonElement>('.page-header-export-toggle');
    if (toggle === null) throw new Error('fixture bug: no export toggle');
    await act(async () => {
      toggle.click();
      await Promise.resolve();
    });
    expect(container.querySelector('.page-header-export-menu')).not.toBeNull();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await Promise.resolve();
    });
    expect(container.querySelector('.page-header-export-menu')).toBeNull();
  });

  it('removes the dropdown once the registering screen unmounts', async () => {
    function Host({ registered }: { readonly registered: boolean }): React.JSX.Element {
      return (
        <ExportRegistryProvider>
          <PageHeader title="Natal chart" />
          {registered && <Registrar items={[{ key: 'svg', label: 'Image (SVG)', run: vi.fn() }]} />}
        </ExportRegistryProvider>
      );
    }
    const container = await mount(<Host registered />);
    expect(container.querySelector('.page-header-export-toggle')).not.toBeNull();
    await act(async () => {
      mounted?.root.render(<Host registered={false} />);
      await Promise.resolve();
    });
    expect(container.querySelector('.page-header-export-toggle')).toBeNull();
  });
});
