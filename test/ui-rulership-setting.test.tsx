// @vitest-environment jsdom
/**
 * The planetary-rulers preference and its control (#426): modern by default, kept on this device, shared
 * by every component that reads it in the same tab, and safe when storage is unusable.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RulershipChoice } from '../src/astrology/rulership.js';
import { setLocale } from '../src/ui/locale.js';
import {
  RULERSHIP_KEY,
  readRulershipChoice,
  resetRulershipMemory,
  useRulershipChoice,
  writeRulershipChoice,
} from '../src/ui/rulership-setting.js';
import { RulershipSetting } from '../src/ui/RulershipSetting.js';

let mounted: { container: HTMLElement; root: Root } | undefined;

beforeEach(() => {
  localStorage.clear();
  resetRulershipMemory();
  setLocale('en');
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
  const [choice] = useRulershipChoice();
  return <output data-testid={label}>{choice}</output>;
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

const select = (container: HTMLElement): HTMLSelectElement => {
  const found = container.querySelector('select');
  if (found === null) throw new Error('fixture bug: no select');
  return found;
};

describe('the saved choice (#426)', () => {
  it('is modern when nothing is saved', () => {
    expect(readRulershipChoice()).toBe('modern');
  });

  it('is what was saved, and survives a read', () => {
    for (const choice of ['traditional', 'both', 'modern'] as const) {
      writeRulershipChoice(choice);
      expect(localStorage.getItem(RULERSHIP_KEY)).toBe(choice);
      expect(readRulershipChoice()).toBe(choice);
    }
  });

  it('ignores a damaged saved value', () => {
    for (const value of ['', 'Modern', 'vedic', '{"a":1}', 'null']) {
      localStorage.setItem(RULERSHIP_KEY, value);
      expect(readRulershipChoice()).toBe('modern');
    }
  });

  it('falls back to modern, and to the page’s own memory, when storage cannot be used', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readRulershipChoice()).toBe('modern');
    expect(() => {
      writeRulershipChoice('both');
    }).not.toThrow();
  });
});

describe('the hook (#426)', () => {
  it('shows the saved choice and updates every reader in the tab when it changes', async () => {
    writeRulershipChoice('traditional');
    const container = await mount(
      <>
        <Reader label="a" />
        <Reader label="b" />
      </>,
    );
    expect(container.querySelector('[data-testid="a"]')?.textContent).toBe('traditional');
    expect(container.querySelector('[data-testid="b"]')?.textContent).toBe('traditional');

    await act(async () => {
      writeRulershipChoice('both');
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="a"]')?.textContent).toBe('both');
    expect(container.querySelector('[data-testid="b"]')?.textContent).toBe('both');
  });

  it('follows a change made in another tab (the storage event)', async () => {
    const container = await mount(<Reader label="a" />);
    expect(container.querySelector('[data-testid="a"]')?.textContent).toBe('modern');
    await act(async () => {
      localStorage.setItem(RULERSHIP_KEY, 'traditional');
      window.dispatchEvent(new StorageEvent('storage', { key: RULERSHIP_KEY }));
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="a"]')?.textContent).toBe('traditional');
  });
});

describe('RulershipSetting (#426)', () => {
  it('offers the three choices, modern selected by default, with a label and an explanation linked to the select', async () => {
    const container = await mount(<RulershipSetting />);
    const control = select(container);
    expect(control.value).toBe('modern');
    expect([...control.options].map((option) => option.value)).toEqual(['modern', 'traditional', 'both']);
    expect(container.querySelector(`label[for="${control.id}"]`)?.textContent).toContain('Planetary rulers');
    const hint = container.querySelector(`[id="${control.getAttribute('aria-describedby') ?? ''}"]`);
    expect(hint?.textContent).toContain('Scorpio, Aquarius and Pisces');
  });

  it('saves the choice and tells the other components', async () => {
    const container = await mount(
      <>
        <RulershipSetting />
        <Reader label="reader" />
      </>,
    );
    await act(async () => {
      const control = select(container);
      control.value = 'both' satisfies RulershipChoice;
      control.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });
    expect(localStorage.getItem(RULERSHIP_KEY)).toBe('both');
    expect(container.querySelector('[data-testid="reader"]')?.textContent).toBe('both');
    expect(select(container).value).toBe('both');
  });

  it('is in Dutch when the language is Dutch', async () => {
    setLocale('nl');
    const container = await mount(<RulershipSetting />);
    expect(container.textContent).toContain('Heersende planeten');
    expect(select(container).options[2]?.textContent).toBe('Beide (mede-heersers)');
  });
});
