// @vitest-environment jsdom
/**
 * The birth-record export buttons AAF, JSON and CSV are pills (#1650, owner answer 5, 2026-11-16): they are single-line
 * buttons, so they follow the pills-everywhere rule. They keep the compact height and take the capsule shape.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openStore, type Store } from '../src/store/store.js';
import { ExportRegistryProvider } from '../src/ui/export-registry.js';
import { personFileActionsMessages } from '../src/ui/PersonFileActions.messages.js';

vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: undefined, error: undefined }),
}));

const { PersonForm } = await import('../src/ui/PersonForm.js');
const { StoreProvider } = await import('../src/ui/store-context.js');

const tFiles = personFileActionsMessages.en;
let counter = 0;
let store: Store;
let root: Root | undefined;
let container: HTMLElement | undefined;

beforeEach(async () => {
  counter += 1;
  store = await openStore({ name: `astraya-person-file-actions-pills-${String(counter)}` });
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
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <StoreProvider store={store}>
        <ExportRegistryProvider>
          <PersonForm personId="ada" />
        </ExportRegistryProvider>
      </StoreProvider>,
    );
    await Promise.resolve();
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = undefined;
  container = undefined;
});

function exportButton(label: string): HTMLButtonElement {
  const row = container?.querySelector<HTMLElement>('.birth-record-export-row');
  if (row === null || row === undefined) throw new Error('test fixture bug: no export row');
  const found = Array.from(row.querySelectorAll('button')).find((b) => b.textContent.trim() === label);
  if (found === undefined) throw new Error(`no export button labelled ${label}`);
  return found;
}

describe('birth-record export buttons are pills (#1650, owner answer 5)', () => {
  it.each([tFiles.exportAaf, tFiles.exportJson, tFiles.exportCsv])(
    'gives the %s export button the capsule (pill) class and keeps the compact height',
    (label) => {
      const button = exportButton(label);
      expect(button.classList.contains('primitive-button-capsule')).toBe(true);
      expect(button.classList.contains('primitive-button-compact')).toBe(true);
      expect(button.classList.contains('primitive-button-circle')).toBe(false);
    },
  );
});
