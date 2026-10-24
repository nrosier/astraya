// @vitest-environment jsdom
/**
 * The horary form's two-card layout (#782): "Set to now" fills the timestamp, the coordinates are
 * dimmed until a place search fills them (and stay editable), the full house-system labels are
 * offered in both locales, and the geocoder notice names the host the search text goes to.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ForwardGeocodeResult } from '../src/ui/forward-geocode.js';

vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: undefined, error: undefined }),
}));

vi.mock('../src/ui/forward-geocode.js', () => ({
  forwardGeocode: (): Promise<ForwardGeocodeResult[]> =>
    Promise.resolve([{ latitude: 48.8566, longitude: 2.3522, displayName: 'Paris, France' }]),
}));

const { HoraryView } = await import('../src/ui/HoraryView.js');
const { horaryViewMessages } = await import('../src/ui/HoraryView.messages.js');
const { geocodeHost } = await import('../src/ui/geocode-provider.js');
const { setLocale } = await import('../src/ui/locale.js');

let mounted: { container: HTMLElement; root: Root } | undefined;

afterEach(() => {
  vi.useRealTimers();
  act(() => {
    mounted?.root.unmount();
    setLocale('en');
  });
  mounted?.container.remove();
  mounted = undefined;
});

function mount(): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<HoraryView />);
  });
  mounted = { container, root };
  return container;
}

function input(container: HTMLElement, selector: string): HTMLInputElement {
  const element = container.querySelector(selector);
  if (!(element instanceof HTMLInputElement)) throw new Error(`test fixture bug: no ${selector}`);
  return element;
}

function setNativeValue(element: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('HoraryView form layout (#782)', () => {
  it('"Set to now" fills the date and time with the current moment', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const container = mount();
    act(() => {
      setNativeValue(input(container, 'input[type="date"]'), '2001-01-01');
      setNativeValue(input(container, 'input[type="time"]'), '03:04');
    });
    vi.setSystemTime(new Date(2024, 4, 6, 7, 8));
    const button = [...container.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === horaryViewMessages.en.setToNow,
    );
    act(() => {
      button?.click();
    });
    expect(input(container, 'input[type="date"]').value).toBe('2024-05-06');
    expect(input(container, 'input[type="time"]').value).toBe('07:08');
  });

  it('dims the coordinates until a place search fills them, and keeps them editable', async () => {
    const container = mount();
    const coords = container.querySelector('.horary-coords');
    expect(coords?.classList.contains('horary-coords--pending')).toBe(true);
    const latitude = input(container, '.horary-coords input');
    expect(latitude.disabled).toBe(false);

    act(() => {
      setNativeValue(input(container, 'input[role="combobox"]'), 'Paris');
    });
    act(() => {
      container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      container.querySelector<HTMLElement>('[role="option"]')?.click();
    });
    expect(coords?.classList.contains('horary-coords--pending')).toBe(false);
    expect(latitude.value).toBe('48.8566');
    expect(latitude.disabled).toBe(false);
  });

  it.each(['en', 'nl'] as const)('offers the full house-system labels and the geocoder notice in %s', (locale) => {
    act(() => {
      setLocale(locale);
    });
    const container = mount();
    const t = horaryViewMessages[locale];
    const labels = [...container.querySelectorAll('select option')].map((option) => option.textContent);
    for (const label of Object.values(t.houseSystems)) expect(labels).toContain(label);
    expect(t.geocodeNotice(geocodeHost)).toContain(geocodeHost);
    expect(container.textContent).toContain(t.geocodeNotice(geocodeHost));
  });

  it('names the default Nominatim host in the notice, in both locales', () => {
    for (const locale of ['en', 'nl'] as const) {
      expect(horaryViewMessages[locale].geocodeNotice('nominatim.openstreetmap.org')).toContain(
        'nominatim.openstreetmap.org',
      );
    }
  });
});
