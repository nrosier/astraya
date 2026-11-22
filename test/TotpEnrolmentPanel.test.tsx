// @vitest-environment jsdom
/**
 * The two-step sign-in enrolment panel (#1500, steps 4 and 5), with `fetch` stubbed (no server): the states, the
 * QR image and its alt text, the manual key, the recovery-code download, the rule that the secret, the URI and the
 * codes reach no browser storage, the hidden states (OIDC account, enrolment disabled), the three error messages,
 * and en and nl key parity.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../src/ui/locale.js';
import { TotpEnrolmentPanel } from '../src/ui/TotpEnrolmentPanel.js';
import { totpEnrolmentPanelMessages } from '../src/ui/TotpEnrolmentPanel.messages.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const en = totpEnrolmentPanelMessages.en;
const SECRET = 'JBSWY3DPEHPK3PXP';
const URI = `otpauth://totp/Astraya:alice?secret=${SECRET}&issuer=Astraya&algorithm=SHA1&digits=6&period=30`;
const CODES = [
  'AAAAA-BBBBB',
  'CCCCC-DDDDD',
  'EEEEE-FFFFF',
  'GGGGG-HHHHH',
  'IIIII-JJJJJ',
  '22222-33333',
  '44444-55555',
  '66666-77777',
  'ABCDE-FGHIJ',
  'KLMNO-PQRST',
];

const realFetch = globalThis.fetch;
let root: Root | undefined;
let container: HTMLElement;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Answers each call by URL path, in order for repeated calls. */
function stubFetch(answers: Readonly<Record<string, () => Response>>): string[] {
  const urls: string[] = [];
  globalThis.fetch = (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
    urls.push(url);
    const answer = answers[url];
    if (answer === undefined) throw new Error(`unexpected fetch ${url}`);
    return Promise.resolve(answer());
  };
  return urls;
}

async function mount(): Promise<void> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<TotpEnrolmentPanel />);
    await Promise.resolve();
  });
}

function type(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.bind(input);
  if (setter === undefined) throw new Error('no value setter');
  act(() => {
    setter(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function input(label: string): HTMLInputElement {
  const found = Array.from(container.querySelectorAll('label')).find((l) => l.textContent.includes(label));
  const control = found?.control;
  if (!(control instanceof HTMLInputElement)) throw new Error(`no field ${label}`);
  return control;
}

function button(name: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === name);
  if (found === undefined) throw new Error(`no button ${name}`);
  return found;
}

async function click(name: string): Promise<void> {
  await act(async () => {
    button(name).click();
    await new Promise((done) => setTimeout(done, 0));
  });
}

async function submitPassword(password = 'correct-horse'): Promise<void> {
  type(input(en.passwordLabel), password);
  await click(en.start);
}

async function submitCode(code = '123456'): Promise<void> {
  type(input(en.codeLabel), code);
  await click(en.confirm);
}

/** Lets the dynamically imported QR module resolve and React render its result. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((done) => setTimeout(done, 50));
  });
}

beforeEach(() => {
  setLocale('en');
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = undefined;
  container.remove();
  globalThis.fetch = realFetch;
  vi.unstubAllGlobals();
  setLocale('en');
});

describe('the states', () => {
  it('starts with the title, the intro and a password field, and no secret', async () => {
    stubFetch({});
    await mount();
    expect(container.querySelector('h2')?.textContent).toBe(en.title);
    expect(container.textContent).toContain(en.intro);
    expect(input(en.passwordLabel).type).toBe('password');
    expect(container.querySelector('img')).toBeNull();
  });

  it('shows the QR image with alt text, the manual key in groups of four, the app link and the code field', async () => {
    stubFetch({ '/api/auth/totp/enrol': () => json({ secret: SECRET, otpauthUri: URI }) });
    await mount();
    await submitPassword();
    await settle();

    const image = container.querySelector('img');
    expect(image?.getAttribute('alt')).toBe(en.qrAlt);
    expect(image?.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(container.textContent).toContain(en.manualKeyLabel);
    expect(container.querySelector('code')?.textContent).toBe('JBSW Y3DP EHPK 3PXP');
    expect(container.querySelector<HTMLAnchorElement>(`a[href="${URI}"]`)?.textContent).toBe(en.openInApp);
    expect(input(en.codeLabel)).toBeTruthy();
    // The password is gone from the field once the secret is shown.
    expect(container.querySelector('input[type="password"]')).toBeNull();
  });

  it('shows the recovery codes after a correct code, then the enabled message once "I\'ve saved them" is pressed, with the codes gone', async () => {
    stubFetch({
      '/api/auth/totp/enrol': () => json({ secret: SECRET, otpauthUri: URI }),
      '/api/auth/totp/confirm': () => json({ recoveryCodes: CODES }),
    });
    await mount();
    await submitPassword();
    await submitCode();

    expect(container.querySelector('h2')?.textContent).toBe(en.recoveryTitle);
    expect(container.textContent).toContain(en.recoveryWarning);
    expect(Array.from(container.querySelectorAll('li code')).map((c) => c.textContent)).toEqual(CODES);
    // The secret is dropped as soon as the codes arrive.
    expect(container.textContent).not.toContain('JBSW');
    expect(container.querySelector('img')).toBeNull();

    await click(en.savedThem);
    expect(container.textContent).toContain(en.enabled);
    for (const recoveryCode of CODES) expect(container.textContent).not.toContain(recoveryCode);
  });
});

describe('the recovery-code file and copy', () => {
  async function toRecoveryScreen(): Promise<void> {
    stubFetch({
      '/api/auth/totp/enrol': () => json({ secret: SECRET, otpauthUri: URI }),
      '/api/auth/totp/confirm': () => json({ recoveryCodes: CODES }),
    });
    await mount();
    await submitPassword();
    await submitCode();
  }

  it('downloads a Blob named astraya-recovery-codes.txt that holds exactly the 10 codes', async () => {
    await toRecoveryScreen();
    const blobs: Blob[] = [];
    const names: string[] = [];
    URL.createObjectURL = (blob: Blob | MediaSource): string => {
      blobs.push(blob as Blob);
      return 'blob:test';
    };
    URL.revokeObjectURL = (): void => undefined;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });

    await click(en.downloadCodes);

    expect(names).toEqual(['astraya-recovery-codes.txt']);
    expect(blobs).toHaveLength(1);
    const text = await new Promise<string>((done, fail) => {
      const reader = new FileReader();
      reader.onload = () => {
        done(typeof reader.result === 'string' ? reader.result : '');
      };
      reader.onerror = () => {
        fail(new Error('read failed'));
      };
      const [blob] = blobs;
      if (blob === undefined) throw new Error('no blob');
      reader.readAsText(blob);
    });
    const lines = text.split('\n').filter((line) => line !== '');
    expect(lines).toEqual(CODES);
    expect(lines).toHaveLength(10);
    vi.restoreAllMocks();
  });

  it('copies the codes, one per line, to the clipboard', async () => {
    await toRecoveryScreen();
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await click(en.copyCodes);
    expect(writeText).toHaveBeenCalledWith(CODES.join('\n'));
  });
});

describe('the QR module is loaded by dynamic import only', () => {
  const read = (file: string): string => readFileSync(resolve(import.meta.dirname, '..', 'src', 'ui', file), 'utf8');

  it('the panel imports totp-qr and uqr nowhere statically', () => {
    const source = read('TotpEnrolmentPanel.tsx');
    expect(source).not.toMatch(/^import[^;]*from\s+['"](?:\.\/totp-qr|uqr)/m);
    expect(source).toMatch(/import\('\.\/totp-qr\.js'\)/);
  });

  it('only totp-qr.ts imports uqr, and nothing else in src imports totp-qr statically', () => {
    expect(read('totp-qr.ts')).toMatch(/from 'uqr'/);
    for (const file of ['PreferencesView.tsx', 'TotpEnrolmentPanel.tsx', 'App.tsx', 'AccountPanel.tsx']) {
      expect(read(file)).not.toMatch(/^import[^;]*from\s+['"]uqr['"]/m);
      expect(read(file)).not.toMatch(/^import[^;]*from\s+['"]\.\/totp-qr/m);
    }
  });
});

describe('storage: the secret, the URI and the codes are never persisted in the browser', () => {
  it('writes none of them to localStorage, sessionStorage, IndexedDB or a cookie', async () => {
    const storageWrites: string[] = [];
    const idbOpenCalls: unknown[][] = [];
    const cookieWrites: string[] = [];
    const record = (key: string, value: string): void => {
      storageWrites.push(key, value);
    };
    const store = { setItem: record, getItem: () => null, removeItem: () => undefined, clear: () => undefined };
    vi.stubGlobal('localStorage', store);
    vi.stubGlobal('sessionStorage', store);
    vi.stubGlobal('indexedDB', {
      open: (...args: unknown[]) => {
        idbOpenCalls.push(args);
        return undefined;
      },
    });
    const cookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => '',
      set: (value: string) => {
        cookieWrites.push(value);
      },
    });
    const historyWrites: unknown[] = [];
    vi.spyOn(history, 'pushState').mockImplementation((...args) => {
      historyWrites.push(args);
    });
    vi.spyOn(history, 'replaceState').mockImplementation((...args) => {
      historyWrites.push(args);
    });

    stubFetch({
      '/api/auth/totp/enrol': () => json({ secret: SECRET, otpauthUri: URI }),
      '/api/auth/totp/confirm': () => json({ recoveryCodes: CODES }),
    });
    await mount();
    await submitPassword('a-password-that-must-not-persist');
    await settle();
    await submitCode('654321');
    await click(en.savedThem);

    const secrets = [SECRET, URI, '654321', 'a-password-that-must-not-persist', ...CODES];
    const written = [
      ...storageWrites,
      ...idbOpenCalls.flat().map(String),
      ...cookieWrites,
      ...historyWrites.map(String),
    ];
    for (const secret of secrets) expect(written.filter((text) => text.includes(secret))).toEqual([]);
    expect(storageWrites).toEqual([]);
    expect(idbOpenCalls).toEqual([]);
    expect(cookieWrites).toEqual([]);
    expect(historyWrites).toEqual([]);
    expect(window.location.href).not.toContain(SECRET);
    if (cookie !== undefined) Object.defineProperty(Document.prototype, 'cookie', cookie);
    vi.restoreAllMocks();
  });
});

describe('hidden states', () => {
  it.each([
    ['an OIDC account (403 totp-local-only)', 403, 'totp-local-only'],
    ['enrolment disabled (503 totp-unavailable)', 503, 'totp-unavailable'],
  ])('is hidden for %s, and shows no error', async (_name, status, code) => {
    stubFetch({ '/api/auth/totp/enrol': () => json({ code, error: 'server text' }, status) });
    await mount();
    await submitPassword();
    expect(container.querySelector('section')).toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toBe('');
  });
});

describe('errors map from the reason, not the server text', () => {
  it('a wrong password (401 invalid-credentials) shows wrongPassword and keeps the form', async () => {
    stubFetch({
      '/api/auth/totp/enrol': () => json({ code: 'invalid-credentials', error: 'Invalid username or password' }, 401),
    });
    await mount();
    await submitPassword('nope');
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(en.wrongPassword);
    expect(container.textContent).not.toContain('Invalid username or password');
    expect(input(en.passwordLabel)).toBeTruthy();
  });

  it('a wrong confirm code (401 invalid-code) shows wrongCode and keeps the secret visible', async () => {
    stubFetch({
      '/api/auth/totp/enrol': () => json({ secret: SECRET, otpauthUri: URI }),
      '/api/auth/totp/confirm': () => json({ code: 'invalid-code', error: 'That code did not match' }, 401),
    });
    await mount();
    await submitPassword();
    await submitCode('000000');
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(en.wrongCode);
    expect(container.querySelector('code')?.textContent).toBe('JBSW Y3DP EHPK 3PXP');
  });

  it.each([
    ['enrol', '/api/auth/totp/enrol'],
    ['confirm', '/api/auth/totp/confirm'],
  ])('a 429 on %s shows the throttled message', async (step, url) => {
    stubFetch({
      '/api/auth/totp/enrol': () =>
        url.endsWith('enrol')
          ? json({ code: 'rate-limited', error: 'Too many attempts. Try again later.' }, 429)
          : json({ secret: SECRET, otpauthUri: URI }),
      '/api/auth/totp/confirm': () => json({ code: 'rate-limited', error: 'Too many attempts.' }, 429),
    });
    await mount();
    await submitPassword();
    if (step === 'confirm') await submitCode();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(en.throttled);
  });

  it('a 409 shows the generic message, not the server text', async () => {
    stubFetch({
      '/api/auth/totp/enrol': () =>
        json({ code: 'totp-already-enabled', error: 'Two-step sign-in is already on' }, 409),
    });
    await mount();
    await submitPassword();
    const alert = container.querySelector('[role="alert"]')?.textContent ?? '';
    expect(alert).not.toBe('');
    expect(alert).not.toBe(en.wrongPassword);
    expect(alert).not.toContain('Two-step sign-in is already on');
  });
});

describe('Dutch', () => {
  it('shows the approved Dutch title and wrong-password text', async () => {
    setLocale('nl');
    stubFetch({
      '/api/auth/totp/enrol': () => json({ code: 'invalid-credentials', error: 'x' }, 401),
    });
    await mount();
    expect(container.querySelector('h2')?.textContent).toBe('Inloggen in twee stappen');
    const field = Array.from(container.querySelectorAll('label')).find((l) =>
      l.textContent.includes('Huidig wachtwoord'),
    );
    if (!(field?.control instanceof HTMLInputElement)) throw new Error('no nl password field');
    type(field.control, 'x');
    await click('Instellen');
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Dat wachtwoord klopt niet.');
  });
});

describe('en and nl parity', () => {
  it('has exactly the same keys, all non-empty, in both locales', () => {
    const enKeys = Object.keys(totpEnrolmentPanelMessages.en).sort();
    const nlKeys = Object.keys(totpEnrolmentPanelMessages.nl).sort();
    expect(nlKeys).toEqual(enKeys);
    expect(enKeys).toHaveLength(19);
    for (const locale of ['en', 'nl'] as const) {
      for (const value of Object.values(totpEnrolmentPanelMessages[locale])) expect(value).not.toBe('');
    }
  });
});
