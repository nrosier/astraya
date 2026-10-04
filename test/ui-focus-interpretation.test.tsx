// @vitest-environment jsdom
/**
 * The button under a selected placement's card that asks for its tensions (#424): disabled with a
 * reason until the viewer is signed in and has consented; sends only the placement's own context;
 * spends the consent on sending; and starts over when the selection changes.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FocusContext } from '../src/interpretation/focus-context.js';
import { setLocale } from '../src/ui/locale.js';

let signedIn = true;
vi.mock('../src/ui/session-context.js', () => ({
  useSessionUserOrUndefined: () => (signedIn ? { id: 'u1', username: 'alice', isAdmin: false } : undefined),
}));

const { FocusInterpretation } = await import('../src/ui/FocusInterpretation.js');

const CONTEXT: FocusContext = {
  perspective: 'natal',
  rulership: 'modern',
  focus_object: {
    key: 'pluto',
    sign: 'Libra',
    house: 2,
    rules_houses: [8],
    is_chart_ruler: false,
    on_angle: false,
    angle: null,
    dispositor: 'venus',
  },
  aspects: [
    {
      target_key: 'sun',
      target_sign: 'Capricorn',
      target_house: 4,
      target_rules_houses: [12],
      aspect: 'square',
      orb: 8.53,
      state: 'applying',
      is_target_chart_ruler: false,
      is_target_luminary: true,
    },
  ],
};

let mounted: { container: HTMLElement; root: Root } | undefined;
let fetchMock: ReturnType<typeof vi.fn>;
const realFetch = globalThis.fetch;

beforeEach(() => {
  signedIn = true;
  setLocale('en');
  fetchMock = vi.fn(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({ sections: [{ heading: 'Core tension', body: 'Security meets power.' }], description: null }),
        { status: 200 },
      ),
    ),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
  globalThis.fetch = realFetch;
});

interface Props {
  context: FocusContext | undefined;
  resetKey: string;
  locale?: 'en' | 'nl';
}

async function mount(props: Props): Promise<(next: Props) => Promise<void>> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const render = async ({ context, resetKey, locale = 'en' }: Props): Promise<void> => {
    await act(async () => {
      root.render(<FocusInterpretation context={context} locale={locale} resetKey={resetKey} />);
      await Promise.resolve();
    });
  };
  mounted = { container, root };
  await render(props);
  return render;
}

const box = (): HTMLElement => {
  const element = mounted?.container;
  if (element === undefined) throw new Error('fixture bug: not mounted');
  return element;
};
const button = (): HTMLButtonElement => {
  const found = box().querySelector('button');
  if (found === null) throw new Error('fixture bug: no button');
  return found;
};
const consentBox = (): HTMLInputElement => {
  const found = box().querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (found === null) throw new Error('fixture bug: no consent checkbox');
  return found;
};
async function tickConsent(): Promise<void> {
  await act(async () => {
    consentBox().click();
    await Promise.resolve();
  });
}
async function generate(): Promise<void> {
  await act(async () => {
    button().click();
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
  });
}

describe('FocusInterpretation (#424)', () => {
  it('renders nothing without a context', async () => {
    await mount({ context: undefined, resetKey: 'a' });
    expect(box().innerHTML).toBe('');
  });

  it('signed out: a genuinely disabled button, with the reason shown and linked to it, and no consent box', async () => {
    signedIn = false;
    await mount({ context: CONTEXT, resetKey: 'a' });
    expect(button().disabled).toBe(true);
    expect(button().textContent).toBe('Interpret the tensions of this placement');
    expect(box().textContent).toContain('Sign in to generate an AI interpretation of this placement.');
    const reasonId = button().getAttribute('aria-describedby') ?? '';
    expect(reasonId).not.toBe('');
    expect(box().querySelector(`[id="${reasonId}"]`)?.textContent).toContain('Sign in');
    expect(box().querySelector('input[type="checkbox"]')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signed in: disabled until consent is given, with the reason shown', async () => {
    await mount({ context: CONTEXT, resetKey: 'a' });
    expect(button().disabled).toBe(true);
    expect(box().textContent).toContain('(check the consent box first)');
    expect(consentBox().checked).toBe(false);
    await tickConsent();
    expect(button().disabled).toBe(false);
    expect(button().getAttribute('aria-describedby')).toBeNull();
    expect(box().textContent).not.toContain('check the consent box first');
  });

  it('says in the consent text what is sent, and that no name or birth data is', async () => {
    await mount({ context: CONTEXT, resetKey: 'a' });
    const label = consentBox().closest('label')?.textContent ?? '';
    expect(label).toContain('sign, house, rulerships and aspects');
    expect(label).toContain('no name or birth data');
  });

  it('sends only the placement’s context in a focus request, and shows the answer', async () => {
    await mount({ context: CONTEXT, resetKey: 'a' });
    await tickConsent();
    await generate();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/interpretation/generate');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ mode: 'focus', focusContext: CONTEXT, locale: 'en' });

    await vi.waitFor(() => {
      expect(box().querySelector('.tier2-result')?.textContent).toContain('Security meets power.');
    });
    expect(box().querySelector('.tier2-result h5')?.textContent).toBe('Core tension');
  });

  it('spends the consent when the request is sent: a second request needs a fresh tick', async () => {
    await mount({ context: CONTEXT, resetKey: 'a' });
    await tickConsent();
    await generate();
    await vi.waitFor(() => {
      expect(box().querySelector('.tier2-result')).not.toBeNull();
    });
    expect(consentBox().checked).toBe(false);
    expect(button().disabled).toBe(true);
  });

  it('shows the server’s message when the request is refused or fails', async () => {
    fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'Daily usage limit reached for your account.' }), { status: 503 }),
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await mount({ context: CONTEXT, resetKey: 'a' });
    await tickConsent();
    await generate();
    await vi.waitFor(() => {
      expect(box().querySelector('[role="alert"]')?.textContent).toBe(
        'Could not generate: Daily usage limit reached for your account.',
      );
    });
    expect(box().querySelector('.tier2-result')).toBeNull();
    // The button works again, behind a fresh consent.
    expect(button().disabled).toBe(true);
    await tickConsent();
    expect(button().disabled).toBe(false);
  });

  it('starts over when the selection changes: the answer, an error and the consent are cleared', async () => {
    const render = await mount({ context: CONTEXT, resetKey: 'pluto' });
    await tickConsent();
    await generate();
    await vi.waitFor(() => {
      expect(box().querySelector('.tier2-result')).not.toBeNull();
    });

    await render({
      context: { ...CONTEXT, focus_object: { ...CONTEXT.focus_object, key: 'saturn' } },
      resetKey: 'saturn',
    });
    expect(box().querySelector('.tier2-result')).toBeNull();
    expect(consentBox().checked).toBe(false);

    await tickConsent();
    expect(consentBox().checked).toBe(true);
    await render({ context: CONTEXT, resetKey: 'pluto' });
    expect(consentBox().checked).toBe(false);
  });

  it('is in Dutch when the language is Dutch, and sends the language with the request', async () => {
    setLocale('nl');
    await mount({ context: CONTEXT, resetKey: 'a', locale: 'nl' });
    expect(button().textContent).toBe('Interpreteer de spanningen van deze plaatsing');
    await tickConsent();
    await generate();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ locale: 'nl' });
    await vi.waitFor(() => {
      expect(box().querySelector('.tier2-result')).not.toBeNull();
    });
  });
});
