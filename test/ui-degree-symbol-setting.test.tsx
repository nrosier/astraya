// @vitest-environment jsdom
/**
 * Whether degree-symbol (Sabian symbol) paragraphs show in the Report (#527): shown by default,
 * kept on this device, shared by every component that reads it in the same tab, and safe when
 * storage is unusable.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEGREE_SYMBOL_KEY,
  readShowDegreeSymbol,
  useShowDegreeSymbol,
  writeShowDegreeSymbol,
} from '../src/ui/degree-symbol-setting.js';

let mounted: { container: HTMLElement; root: Root } | undefined;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
  vi.restoreAllMocks();
});

function Reader({ label }: { label: string }): React.JSX.Element {
  const [show] = useShowDegreeSymbol();
  return <output data-testid={label}>{String(show)}</output>;
}

async function mount(node: React.JSX.Element): Promise<HTMLElement> {
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

describe('the saved preference (#527)', () => {
  it('is shown when nothing is saved', () => {
    expect(readShowDegreeSymbol()).toBe(true);
  });

  it('is what was saved, and survives a read', () => {
    writeShowDegreeSymbol(false);
    expect(localStorage.getItem(DEGREE_SYMBOL_KEY)).toBe('false');
    expect(readShowDegreeSymbol()).toBe(false);

    writeShowDegreeSymbol(true);
    expect(localStorage.getItem(DEGREE_SYMBOL_KEY)).toBe('true');
    expect(readShowDegreeSymbol()).toBe(true);
  });

  it('ignores a damaged saved value by treating anything but "true" as hidden, except nothing-saved', () => {
    localStorage.setItem(DEGREE_SYMBOL_KEY, 'nonsense');
    expect(readShowDegreeSymbol()).toBe(false);
  });

  it('falls back to shown when storage cannot be used', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readShowDegreeSymbol()).toBe(true);
    expect(() => {
      writeShowDegreeSymbol(false);
    }).not.toThrow();
  });
});

describe('the hook (#527)', () => {
  it('shows the saved preference and updates every reader in the tab when it changes', async () => {
    writeShowDegreeSymbol(false);
    const container = await mount(
      <>
        <Reader label="a" />
        <Reader label="b" />
      </>,
    );
    expect(container.querySelector('[data-testid="a"]')?.textContent).toBe('false');
    expect(container.querySelector('[data-testid="b"]')?.textContent).toBe('false');

    await act(async () => {
      writeShowDegreeSymbol(true);
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="a"]')?.textContent).toBe('true');
    expect(container.querySelector('[data-testid="b"]')?.textContent).toBe('true');
  });

  it('follows a change made in another tab (the storage event)', async () => {
    const container = await mount(<Reader label="a" />);
    expect(container.querySelector('[data-testid="a"]')?.textContent).toBe('true');
    await act(async () => {
      localStorage.setItem(DEGREE_SYMBOL_KEY, 'false');
      window.dispatchEvent(new StorageEvent('storage', { key: DEGREE_SYMBOL_KEY }));
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="a"]')?.textContent).toBe('false');
  });
});
