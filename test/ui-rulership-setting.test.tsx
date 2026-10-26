// @vitest-environment jsdom
/**
 * The planetary-rulers preference and its control (#426): modern by default, kept on this device, shared
 * by every component that reads it in the same tab, and safe when storage is unusable.
 */
import { act, useState } from 'react';
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

const radios = (container: HTMLElement): readonly HTMLInputElement[] => [
  ...container.querySelectorAll<HTMLInputElement>('[role="radiogroup"] input[type="radio"]'),
];

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

/** A caller that owns the choice, the way a settings draft or a person's register does (#806). */
function Controlled({
  initial = 'modern',
  onChange,
}: {
  readonly initial?: RulershipChoice;
  readonly onChange?: (choice: RulershipChoice) => void | Promise<void>;
}): React.JSX.Element {
  const [value, setValue] = useState<RulershipChoice>(initial);
  return (
    <RulershipSetting
      value={value}
      onChange={async (choice) => {
        setValue(choice);
        await onChange?.(choice);
      }}
    />
  );
}

describe('RulershipSetting (#426, #806)', () => {
  it('offers the three choices as option cards, the given one selected, under a named group with its explanation', async () => {
    const container = await mount(<Controlled />);
    const group = container.querySelector('[role="radiogroup"]');
    expect(group?.getAttribute('aria-label')).toBe('Planetary rulers');
    expect(radios(container).map((radio) => radio.checked)).toEqual([true, false, false]);
    expect(container.querySelector('.primitive-option-card-title')?.textContent).toBe('Modern');
    expect(container.querySelector('.hint')?.textContent).toContain('Scorpio, Aquarius and Pisces');
  });

  it('reports the choice to its caller and never writes the device preference itself', async () => {
    const onChange = vi.fn();
    const container = await mount(<Controlled onChange={onChange} />);
    await act(async () => {
      radios(container)[2]?.click();
      await Promise.resolve();
    });
    expect(onChange).toHaveBeenCalledWith('both' satisfies RulershipChoice);
    expect(localStorage.getItem(RULERSHIP_KEY)).toBeNull();
    expect(radios(container).map((radio) => radio.checked)).toEqual([false, false, true]);
  });

  it('shows a failed save beside the control instead of swallowing it', async () => {
    const container = await mount(<Controlled onChange={() => Promise.reject(new Error('disk full'))} />);
    await act(async () => {
      radios(container)[1]?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('That did not save, so the rulers were not changed. disk full');
  });

  it('is in Dutch when the language is Dutch', async () => {
    setLocale('nl');
    const container = await mount(<Controlled />);
    expect(container.textContent).toContain('Heersende planeten');
    expect(container.querySelectorAll('.primitive-option-card-title')[2]?.textContent).toBe('Beide');
  });
});
