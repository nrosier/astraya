// @vitest-environment jsdom
/**
 * After a birth-data import on the birth record (#1921), the app opens the people list at `#/people` with no person
 * selected, so the user picks or searches from that page. A failed import stays on the birth record. Real store and
 * real AAF parsing; the file is chosen through the card's own file input.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openStore, type Store } from '../src/store/store.js';
import { personFileActionsMessages } from '../src/ui/PersonFileActions.messages.js';

vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: undefined, error: undefined }),
}));

const { PersonForm } = await import('../src/ui/PersonForm.js');
const { StoreProvider } = await import('../src/ui/store-context.js');

const tFiles = personFileActionsMessages.en;
/** The specification's own example record (AAF section 2), one person. */
const AAF_ONE_PERSON = '#A93:Ferber,Tobias,m,27.9.1970,11:04,Kandel/Pfalz,D\n#B93:*,49n05,8e11,1he,0\n#ZNAM:CET\n';
const BIRTH_RECORD_HASH = '#/people/ada/birth-record';
let counter = 0;
let store: Store;
let root: Root | undefined;
let container: HTMLElement | undefined;
/** The store write the import started most recently; awaited inside `act` so its React updates are flushed in the test. */
let pendingWrite: Promise<void> | undefined;

beforeEach(async () => {
  counter += 1;
  store = await openStore({ name: `astraya-person-import-navigation-1921-${String(counter)}` });
  await store.mutate([
    { entity: 'person', entityId: 'ada', field: 'displayName', value: 'Ada Lovelace' },
    { entity: 'person', entityId: 'ada', field: 'timeAccuracy', value: 'recorded' },
    {
      entity: 'person',
      entityId: 'ada',
      field: 'civil',
      value: { year: 1815, month: 12, day: 10, hour: 13, minute: 0, second: 0 },
    },
    { entity: 'person', entityId: 'ada', field: 'coordinates', value: { latitude: 51.5074, longitude: -0.1278 } },
  ]);
  window.location.hash = BIRTH_RECORD_HASH;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <StoreProvider store={store}>
        <PersonForm personId="ada" />
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

function fileCard(): HTMLElement {
  const found = container?.querySelector<HTMLElement>('.birth-record section.birth-record-card--files');
  if (found === undefined || found === null) throw new Error('test fixture bug: no files card');
  return found;
}

/**
 * Watches the store's write for the import. With `failWith`, the write is refused instead of being sent to the store,
 * so the import's failure path runs.
 */
function watchWrite(failWith?: string): void {
  const original = store.mutate.bind(store);
  vi.spyOn(store, 'mutate').mockImplementation((mutations) => {
    const write: Promise<void> = failWith === undefined ? original(mutations) : Promise.reject(new Error(failWith));
    pendingWrite = write;
    return write;
  });
}

/** Opens the Import tab and passes an AAF file through the card's own file input, as a file picker would. */
async function chooseAafFile(text: string): Promise<void> {
  const card = fileCard();
  const importTab = [...card.querySelectorAll<HTMLButtonElement>('[role="tab"]')][1];
  if (importTab === undefined) throw new Error('test fixture bug: no Import tab');
  act(() => {
    importTab.click();
  });
  const input = card.querySelector<HTMLInputElement>('input[type="file"]');
  if (input === null) throw new Error('test fixture bug: no file input');
  const file = new File([text], 'other-program.aaf', { type: 'text/plain' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  });
  expect(card.textContent).toContain(tFiles.confirm);
}

/**
 * Presses Replace birth data, then waits inside `act` for the store write it starts and for the import's chained
 * handlers to run, so every React update it causes is flushed within the test.
 */
async function confirmImport(): Promise<void> {
  const card = fileCard();
  const confirm = [...card.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === tFiles.confirm);
  if (confirm === undefined) throw new Error('test fixture bug: no confirm button');
  await act(async () => {
    confirm.click();
    await pendingWrite?.catch(() => undefined);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

describe('post-import navigation to the people list (#1921)', () => {
  it('goes to #/people after a successful import, and opens or selects no person', async () => {
    await chooseAafFile(AAF_ONE_PERSON);
    watchWrite();
    await confirmImport();

    expect(window.location.hash).toBe('#/people');
    // No person is opened or selected: the hash names no person and no person sub-page.
    expect(window.location.hash).not.toContain('ada');
    expect(window.location.hash).not.toContain('birth-record');
    // The import really ran: the card reports the birth data as replaced (the status is set after the navigation).
    expect(fileCard().textContent).toContain(tFiles.applied);
  });

  it('does not navigate when the import fails', async () => {
    await chooseAafFile(AAF_ONE_PERSON);
    watchWrite('write refused');
    await confirmImport();

    expect(fileCard().textContent).toContain(tFiles.failed('write refused'));
    expect(window.location.hash).toBe(BIRTH_RECORD_HASH);
  });
});
