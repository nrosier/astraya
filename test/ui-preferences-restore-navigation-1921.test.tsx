// @vitest-environment jsdom
/**
 * After a Preferences restore of a file with several people (#1921), the app opens the people list at `#/people` with
 * no person selected, and every restored person is listed there. Real store, real AAF parsing and the real restore
 * components; the file is chosen through the Data card's own file input, and the confirm dialog is stubbed.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openStore, type Store } from '../src/store/store.js';

vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: undefined, error: undefined }),
}));

const { PreferencesView } = await import('../src/ui/PreferencesView.js');
const { People } = await import('../src/ui/People.js');
const { StoreProvider } = await import('../src/ui/store-context.js');

/** Two people in the AAF format the restore reads (AAF section 2): the spec's own example record, and a second one. */
const AAF_TWO_PEOPLE = [
  '#A93:Ferber,Tobias,m,27.9.1970,11:04,Kandel/Pfalz,D',
  '#B93:*,49n05,8e11,1he,0',
  '#ZNAM:CET',
  '#A93:Niehenke,Peter,m,9.5.1949,22h30,Hamm,D',
  '#B93:*,51n41,7e49,1he,0',
  '',
].join('\n');
let counter = 0;
let store: Store;
let root: Root | undefined;
let container: HTMLElement | undefined;
/** The store write the restore started most recently; awaited inside `act` so its React updates are flushed. */
let pendingWrite: Promise<void> | undefined;

beforeEach(async () => {
  counter += 1;
  store = await openStore({ name: `astraya-preferences-restore-navigation-1921-${String(counter)}` });
  window.location.hash = '#/preferences/data';
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <StoreProvider store={store}>
        <PreferencesView section="data" />
      </StoreProvider>,
    );
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  window.location.hash = '';
  vi.restoreAllMocks();
});

/** The Data card that holds the restore file input (#1921 restore path). */
function importCard(): HTMLElement {
  const found = container?.querySelector<HTMLElement>('section[aria-labelledby="preferences-card-import"]');
  if (found === undefined || found === null) throw new Error('test fixture bug: no import card');
  return found;
}

/** Passes an AAF file through the card's own file input, as a file picker would, and waits for the preview to stage. */
async function chooseAafFile(text: string): Promise<void> {
  const input = importCard().querySelector<HTMLInputElement>('input[type="file"]');
  if (input === null) throw new Error('test fixture bug: no file input');
  const file = new File([text], 'two-people.aaf', { type: 'text/plain' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  });
  expect(importCard().textContent).toContain('Apply restore');
}

/** Presses Apply restore, then waits inside `act` for the store write it starts and the chained handlers. */
async function applyRestore(): Promise<void> {
  const apply = [...importCard().querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent === 'Apply restore',
  );
  if (apply === undefined) throw new Error('test fixture bug: no Apply restore button');
  await act(async () => {
    apply.click();
    await pendingWrite?.catch(() => undefined);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

/** Records the restore's store write so the test can wait for it. */
function watchWrite(): void {
  const original = store.mutate.bind(store);
  vi.spyOn(store, 'mutate').mockImplementation((mutations) => {
    const write = original(mutations);
    pendingWrite = write;
    return write;
  });
}

describe('post-restore navigation to the people list, several people (#1921)', () => {
  it('restores two people, goes to #/people, opens no person, and lists both', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await chooseAafFile(AAF_TWO_PEOPLE);
    watchWrite();
    await applyRestore();

    // (a) the hash is the people list
    expect(window.location.hash).toBe('#/people');
    // (b) no person page is opened: no #/people/<id>/ hash and no person is selected
    expect(window.location.hash).not.toMatch(/^#\/people\/[^/]+/);
    // (c) both restored people are in the store and listed on the people page
    const names = [...store.state.people.values()].map((person) => person.displayName).sort();
    expect(names).toEqual(['Peter Niehenke', 'Tobias Ferber']);

    act(() => {
      root?.render(
        <StoreProvider store={store}>
          <People />
        </StoreProvider>,
      );
    });
    const listed = [...(container?.querySelectorAll('ul.people .name') ?? [])].map((node) => node.textContent);
    expect(listed.sort()).toEqual(['Peter Niehenke', 'Tobias Ferber']);
  });
});
