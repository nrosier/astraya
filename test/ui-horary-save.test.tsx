// @vitest-environment jsdom
/**
 * Saving a horary judgment and reopening it (#1960): Save is off without a question, a click writes a judgment that
 * folds ready through the real store, the list shows the saved question, reopen shows the stored summary without
 * recomputing it, and delete asks first and removes it. Uses the real Swiss Ephemeris through the engine harness.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openStore, type Store } from '../src/store/store.js';
import { sortedHoraryJudgments } from '../src/store/horary-judgments.js';
import { getEngine } from './engine-harness.js';

const engine = await getEngine();

vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: engine, error: undefined }),
}));

const { HoraryView } = await import('../src/ui/HoraryView.js');
const { horaryViewMessages } = await import('../src/ui/HoraryView.messages.js');
const { StoreProvider } = await import('../src/ui/store-context.js');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const t = horaryViewMessages.en;
let counter = 0;
let store: Store;
let root: Root | undefined;
let container: HTMLElement | undefined;

beforeEach(async () => {
  counter += 1;
  store = await openStore({ name: `astraya-horary-save-${String(counter)}` });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = undefined;
  container = undefined;
});

function setNativeValue(element: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

function inputByLabel(label: string): HTMLInputElement {
  const found = [...(container?.querySelectorAll('label') ?? [])].find((l) => l.textContent.startsWith(label));
  const target = found?.control ?? found?.querySelector('input') ?? null;
  if (!(target instanceof HTMLInputElement)) throw new Error(`test fixture bug: no input labelled ${label}`);
  return target;
}

function buttonByText(text: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find((b) => b.textContent === text);
  if (found === undefined) throw new Error(`test fixture bug: no button ${text}`);
  return found;
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

async function castChart(): Promise<void> {
  await act(async () => {
    root?.render(
      <StoreProvider store={store}>
        <HoraryView />
      </StoreProvider>,
    );
    await Promise.resolve();
  });
  act(() => {
    setNativeValue(inputByLabel(t.dateLabel), '2024-03-08');
    setNativeValue(inputByLabel(t.timeLabel), '12:00');
    setNativeValue(inputByLabel(t.latitudeLabel), '51.5072');
    setNativeValue(inputByLabel(t.longitudeLabel), '-0.1276');
  });
  act(() => {
    buttonByText(t.castButton).click();
  });
  for (let attempt = 0; attempt < 100 && !document.body.textContent.includes(t.judgmentHeading); attempt += 1) {
    await settle();
  }
  expect(document.body.textContent).toContain(t.judgmentHeading);
}

function mountRoot(): void {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
}

describe('saving a horary judgment (#1960)', () => {
  it('keeps Save off without a question, then writes a ready judgment that the list shows and reopen reads back', async () => {
    mountRoot();
    await castChart();
    const save = buttonByText(t.saveJudgment);
    expect(save.disabled).toBe(true);

    act(() => {
      setNativeValue(inputByLabel(t.questionLabel), 'Will I get the house?');
    });
    expect(save.disabled).toBe(false);
    await act(async () => {
      save.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const saved = sortedHoraryJudgments(store.state.horaryJudgments);
    expect(saved).toHaveLength(1);
    const first = saved[0];
    expect(first?.status).toBe('ready');
    if (first?.status !== 'ready') return;
    expect(first.question).toBe('Will I get the house?');
    expect(first.record.version).toBe(2);
    expect(first.record.civil).toMatchObject({ year: 2024, month: 3, day: 8, hour: 12, minute: 0 });
    expect(first.record.houseSystem).toBe('R');
    expect(first.record.witness.tzdbFingerprint).not.toBe('');

    // The list names the question.
    expect(document.querySelector('.horary-saved-list')?.textContent).toContain('Will I get the house?');

    // Reopen shows the stored record: the question and the perfection line saved with it.
    act(() => {
      buttonByText(t.open).click();
    });
    const opened = document.querySelector('.horary-saved-opened');
    expect(opened?.textContent).toContain('Will I get the house?');
    expect(opened?.textContent).toContain(t.perfection[first.record.summary.perfection.kind]);
    expect(opened?.textContent).toContain(t.openedNote);
  });

  it('asks before deleting, names the judgment, and removes it only on confirm', async () => {
    mountRoot();
    await castChart();
    act(() => {
      setNativeValue(inputByLabel(t.questionLabel), 'Where is my ring?');
    });
    await act(async () => {
      buttonByText(t.saveJudgment).click();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(store.state.horaryJudgments.size).toBe(1);

    act(() => {
      buttonByText(t.delete).click();
    });
    const dialog = document.querySelector('dialog');
    expect(dialog?.textContent).toContain(t.deleteHeading);
    expect(dialog?.textContent).toContain('Where is my ring?');
    expect(store.state.horaryJudgments.size).toBe(1);
    // There is no permanent-erase control anywhere on the card.
    expect(document.body.textContent).not.toMatch(/erase permanently|permanent/i);

    await act(async () => {
      buttonByText(t.deleteConfirm).click();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(store.state.horaryJudgments.size).toBe(0);
  });

  it('refuses a question over the cap in the input itself', async () => {
    mountRoot();
    await act(async () => {
      root?.render(
        <StoreProvider store={store}>
          <HoraryView />
        </StoreProvider>,
      );
      await Promise.resolve();
    });
    expect(inputByLabel(t.questionLabel).maxLength).toBe(500);
  });
});
