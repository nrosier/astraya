// @vitest-environment jsdom
/**
 * #1400: the date and animation bar. Stepping, the interval, the slider, Now and playback all report through the one
 * `onDateChange` the screen already uses for a typed date; reduced motion starts paused; Space and the arrows work.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DateAnimationBar } from '../src/ui/DateAnimationBar.js';
import { dateAnimationBarMessages } from '../src/ui/DateAnimationBar.messages.js';
import { useAsOfDate } from '../src/ui/use-as-of-date.js';
import { setLocale } from '../src/ui/locale.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLElement;
const seen: string[] = [];

/** The bar wired as the screens wire it: the as-of date lives in the URL through `useAsOfDate`. */
function Harness(): React.JSX.Element {
  const [date, setDate, setPlayback] = useAsOfDate();
  return (
    <DateAnimationBar
      date={date}
      onPlayingChange={setPlayback}
      onDateChange={(next) => {
        seen.push(next);
        setDate(next);
      }}
    />
  );
}

function mount(start = '2026-11-10'): void {
  window.history.replaceState(null, '', `#/people/x/timing/transits?date=${start}`);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(<Harness />);
  });
}

const t = dateAnimationBarMessages.en;

/** The element for `selector`, or a failure naming it. */
function find<T extends Element>(selector: string, type: abstract new () => T): T {
  const found = container.querySelector(selector);
  if (!(found instanceof type)) throw new Error(`nothing matches ${selector}`);
  return found;
}

/** Sets a control's value the way React notices it (through the prototype's own setter), then fires `event`. */
function setNative(element: HTMLInputElement | HTMLSelectElement, value: string, event: string): void {
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  // oxlint-disable-next-line typescript/unbound-method -- called on `element` below.
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  act(() => {
    setter?.call(element, value);
    element.dispatchEvent(new Event(event, { bubbles: true }));
  });
}

const button = (name: string): HTMLButtonElement => {
  const found = container.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
  if (found === null) throw new Error(`no button ${name}`);
  return found;
};
const dateValue = (): string => container.querySelector<HTMLInputElement>('input[type="date"]')?.value ?? '';
const click = (element: HTMLElement): void => {
  act(() => {
    element.click();
  });
};
const key = (name: string): void => {
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
  });
};

beforeEach(() => {
  seen.length = 0;
  setLocale('en');
  vi.useFakeTimers();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '#/');
});

describe('stepping', () => {
  it('steps back and forward by the chosen interval through onDateChange', () => {
    mount();
    click(button(t.stepForward('day')));
    expect(dateValue()).toBe('2026-11-11');
    click(button(t.stepBack('day')));
    click(button(t.stepBack('day')));
    expect(dateValue()).toBe('2026-11-09');

    click(find('label.primitive-choice:nth-of-type(2) input', HTMLInputElement));
    click(button(t.stepForward('month')));
    expect(dateValue()).toBe('2026-12-09');
    expect(seen).toEqual(['2026-11-11', '2026-11-10', '2026-11-09', '2026-12-09']);
  });

  it('Now reports today, and the slider reports the day it is moved to', () => {
    mount('2020-05-05');
    click(find('button.date-animation-now', HTMLButtonElement));
    expect(seen).toHaveLength(1);
    const slider = find('input[type="range"]', HTMLInputElement);
    expect(slider.getAttribute('aria-label')).toBe(t.sliderLabel);
    setNative(slider, slider.max, 'input');
    expect(dateValue()).toMatch(/-12-31$/);
  });
});

describe('playback and keyboard', () => {
  it('starts paused and advances once per second at 1x after Play, stopping on Pause', () => {
    mount();
    expect(button(t.play).getAttribute('aria-pressed')).toBe('false');
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(seen).toEqual([]);
    click(button(t.play));
    act(() => {
      vi.advanceTimersByTime(3050);
    });
    expect(dateValue()).toBe('2026-11-13');
    click(button(t.pause));
    act(() => {
      vi.advanceTimersByTime(3050);
    });
    expect(dateValue()).toBe('2026-11-13');
  });

  it('advances 30 steps in one second at 30x', () => {
    mount();
    const speed = find('select', HTMLSelectElement);
    setNative(speed, '30', 'change');
    click(button(t.play));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(seen.length).toBeGreaterThanOrEqual(29);
    expect(seen.length).toBeLessThanOrEqual(31);
  });

  it('reduced motion starts paused and never advances by itself, but Play still works', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
    mount();
    expect(button(t.play).getAttribute('aria-pressed')).toBe('false');
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(seen).toEqual([]);
    click(button(t.play));
    act(() => {
      vi.advanceTimersByTime(1050);
    });
    expect(seen).toEqual(['2026-11-11']);
  });

  it('Space toggles play and the arrows step by the interval', () => {
    mount();
    key(' ');
    expect(button(t.pause).getAttribute('aria-pressed')).toBe('true');
    key(' ');
    expect(button(t.play).getAttribute('aria-pressed')).toBe('false');
    key('ArrowRight');
    key('ArrowRight');
    key('ArrowLeft');
    expect(dateValue()).toBe('2026-11-11');
  });

  it('leaves the arrows to the date input while it has focus', () => {
    mount();
    const input = find('input[type="date"]', HTMLInputElement);
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(seen).toEqual([]);
  });
});

describe('playback does not write the URL, and a drag pauses it (#1440)', () => {
  it('writes no hash per tick, only once on pause, and a reopen shows the URL date', () => {
    mount();
    const spy = vi.spyOn(window.history, 'replaceState');
    click(button(t.play));
    act(() => {
      vi.advanceTimersByTime(5050);
    });
    expect(dateValue()).toBe('2026-11-15');
    expect(spy).not.toHaveBeenCalled();
    expect(window.location.hash).toContain('date=2026-11-10');
    click(button(t.pause));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toContain('date=2026-11-15');
    // Reload during playback: the URL still names the date it started from.
    click(button(t.play));
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(window.location.hash).toContain('date=2026-11-15');
    act(() => {
      root?.unmount();
    });
    document.body.replaceChildren();
    const reopened = document.createElement('div');
    document.body.append(reopened);
    root = createRoot(reopened);
    container = reopened;
    act(() => {
      root?.render(<Harness />);
    });
    expect(dateValue()).toBe('2026-11-15');
  });

  it('dragging the slider pauses playback, and only Play resumes it', () => {
    mount();
    click(button(t.play));
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    const slider = find('input[type="range"]', HTMLInputElement);
    act(() => {
      slider.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(button(t.play).getAttribute('aria-pressed')).toBe('false');
    setNative(slider, String(Number(slider.value) + 40), 'input');
    const dragged = dateValue();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(dateValue()).toBe(dragged);
    expect(find('input[type="range"]', HTMLInputElement).value).toBe(slider.value);
    click(button(t.play));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(dateValue()).not.toBe(dragged);
  });

  it('keeps the slider in step with the date while playing', () => {
    mount();
    const slider = find('input[type="range"]', HTMLInputElement);
    const before = Number(slider.value);
    click(button(t.play));
    act(() => {
      vi.advanceTimersByTime(3050);
    });
    expect(Number(slider.value)).toBe(before + 3);
  });
});

describe('every control has an accessible name, in both languages', () => {
  it('names buttons, select, slider and date in Dutch too', () => {
    setLocale('nl');
    mount();
    const nl = dateAnimationBarMessages.nl;
    expect(button(nl.play)).toBeTruthy();
    expect(button(nl.stepBack(nl.intervalNames.day))).toBeTruthy();
    expect(container.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe(nl.intervalLabel);
    expect(container.querySelector('input[type="range"]')?.getAttribute('aria-label')).toBe(nl.sliderLabel);
    expect(container.querySelector('label.sr-only')).not.toBeNull();
  });
});

describe('the date in the URL', () => {
  function Probe(): React.JSX.Element {
    const [date, setDate] = useAsOfDate();
    return (
      <button
        type="button"
        onClick={() => {
          setDate('2027-03-04');
        }}
      >
        {date}
      </button>
    );
  }

  it('opens on ?date= and writes a changed date back without adding a history entry', () => {
    window.history.replaceState(null, '', '#/people/x/timing/transits?date=2024-02-29');
    const lengthBefore = window.history.length;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root?.render(<Probe />);
    });
    const probe = find('button', HTMLButtonElement);
    expect(probe.textContent).toBe('2024-02-29');
    click(probe);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(window.location.hash).toBe('#/people/x/timing/transits?date=2027-03-04');
    expect(window.history.length).toBe(lengthBefore);
  });
});
