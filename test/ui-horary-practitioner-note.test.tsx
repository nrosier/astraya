// @vitest-environment jsdom
/**
 * The practitioner notes on the horary screen (#1960, Part 3): the live result lists the notes its judgment earns,
 * once each and in the current language; a reopened version 2 record shows its stored list; a version 1 record says it
 * was saved before the notes. The judgment is a fixture (a non-radical chart where two rules hold) so the outcome does
 * not depend on the sky; the chart is still cast with the real Swiss Ephemeris through the engine harness.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bodyByKey } from '../src/astrology/bodies.js';
import type { Aspect } from '../src/astrology/aspects.js';
import { HORARY_PRACTITIONER_REASONS, type HoraryJudgment } from '../src/domain/horary-judgment.js';
import { horaryJudgmentCreate, type HoraryJudgmentRecord } from '../src/store/horary-judgments.js';
import { createClock } from '../src/store/hlc.js';
import { append, emptyLog } from '../src/store/oplog.js';
import { openStore, type Store } from '../src/store/store.js';
import type * as HoraryJudgmentModule from '../src/domain/horary-judgment.js';
import { getEngine } from './engine-harness.js';

const engine = await getEngine();

const bodyId = (key: string): number => {
  const id = bodyByKey(key)?.id;
  if (id === undefined) throw new Error(`test fixture bug: ${key}`);
  return id;
};
const trine: Aspect = {
  bodyA: bodyId('sun'),
  bodyB: bodyId('moon'),
  aspect: { key: 'trine', name: 'Trine', angle: 120, family: 'major', tone: 'soft' },
  separation: 121,
  orb: 1,
  allowedOrb: 8,
  applying: true,
};
const CONFLICT: HoraryJudgment = {
  querent: { house: 1, ruler: bodyId('sun'), rulerKey: 'sun' },
  quesited: { house: 7, ruler: bodyId('moon'), rulerKey: 'moon' },
  perfection: { kind: 'signChange', aspect: trine, impedimentBody: bodyId('sun'), alsoApplies: ['refranation'] },
  reception: { kind: 'none', aFromB: [], bFromA: [], sameDignityType: false },
  receptionAidsPerfection: false,
  considerations: [],
  radical: false,
};

vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: engine, error: undefined }),
}));
vi.mock('../src/domain/horary-judgment.js', async (importOriginal) => ({
  ...(await importOriginal<typeof HoraryJudgmentModule>()),
  judgeHoraryWithMotion: () => Promise.resolve(CONFLICT),
}));

const { HoraryView } = await import('../src/ui/HoraryView.js');
const { HoraryJudgments } = await import('../src/ui/HoraryJudgments.js');
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
  store = await openStore({ name: `astraya-horary-note-${String(counter)}` });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = undefined;
  container = undefined;
});

function mount(node: React.ReactNode): void {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(<StoreProvider store={store}>{node}</StoreProvider>);
  });
}

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

const RECORD: HoraryJudgmentRecord = {
  version: 2,
  civil: { year: 2026, month: 11, day: 24, hour: 20, minute: 15, second: 0 },
  coordinates: { latitude: 52.3676, longitude: 4.9041 },
  witness: { offsetMinutes: 60, zone: 'Europe/Amsterdam', tzdbFingerprint: 'tzdb-2026a' },
  houseSystem: 'R',
  rulershipScheme: 'traditional',
  summary: {
    querent: { house: 1, rulerKey: 'venus' },
    quesited: { house: 7, rulerKey: 'mars' },
    perfection: { kind: 'directAspect' },
    reception: { kind: 'none', sameDignityType: false },
    receptionAidsPerfection: false,
    considerations: [],
    radical: true,
  },
  practitionerInput: [{ key: 'sign-change', reason: HORARY_PRACTITIONER_REASONS['sign-change'] }],
};

/**
 * A version 1 record can no longer be written by this build (the store refuses it), so it reaches the store as an
 * older device's records do: received from a peer.
 */
async function receiveFromOlderDevice(id: string, record: HoraryJudgmentRecord): Promise<void> {
  let log = emptyLog(createClock('a1b2c3d4e5f60718'));
  for (const mutation of horaryJudgmentCreate(id, 'Will it perfect?', record)) {
    log = append(log, mutation, 1_780_963_200_000).log;
  }
  await store.receive(log.records);
}

async function saveAndOpen(id: string, record: HoraryJudgmentRecord): Promise<void> {
  await act(async () => {
    if (record.version === 1) await receiveFromOlderDevice(id, record);
    else await store.mutate(horaryJudgmentCreate(id, 'Will it perfect?', record));
  });
  act(() => {
    buttonByText(t.open).click();
  });
}

describe('practitioner notes (#1960)', () => {
  it('lists the live notes of a non-radical judgment where two rules hold, once each, in en', async () => {
    mount(<HoraryView />);
    act(() => {
      setNativeValue(inputByLabel(t.dateLabel), '2024-03-08');
      setNativeValue(inputByLabel(t.timeLabel), '12:00');
      setNativeValue(inputByLabel(t.latitudeLabel), '51.5072');
      setNativeValue(inputByLabel(t.longitudeLabel), '-0.1276');
    });
    act(() => {
      buttonByText(t.castButton).click();
    });
    for (let i = 0; i < 100 && container?.querySelector('.horary-practitioner') === null; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
    }
    const notes = [...(container?.querySelectorAll('.horary-practitioner li') ?? [])].map((li) => li.textContent);
    expect(notes).toEqual([
      HORARY_PRACTITIONER_REASONS['non-radical-chart'],
      HORARY_PRACTITIONER_REASONS['perfection-orbs'],
      HORARY_PRACTITIONER_REASONS['rule-order'],
      HORARY_PRACTITIONER_REASONS['sign-change'],
    ]);
    expect(container?.querySelectorAll('.horary-practitioner')).toHaveLength(1);
  });

  it('shows the stored list on a reopened version 2 record', async () => {
    mount(<HoraryJudgments />);
    await saveAndOpen('h-abcdefghijklmnop', RECORD);
    const opened = document.querySelector('.horary-saved-opened');
    expect(opened?.textContent).toContain(HORARY_PRACTITIONER_REASONS['sign-change']);
    expect(opened?.textContent).not.toContain(t.savedBeforePractitioner);
  });

  it('shows no note for a version 2 record with an empty list', async () => {
    mount(<HoraryJudgments />);
    await saveAndOpen('h-abcdefghijklmnop', { ...RECORD, practitionerInput: [] });
    const opened = document.querySelector('.horary-saved-opened');
    expect(opened?.querySelector('.horary-practitioner')).toBeNull();
    expect(opened?.textContent).not.toContain(t.savedBeforePractitioner);
  });

  it('labels a version 1 record as saved before the notes', async () => {
    const { practitionerInput: _none, ...body } = RECORD;
    mount(<HoraryJudgments />);
    await saveAndOpen('h-abcdefghijklmnop', { ...body, version: 1 });
    const opened = document.querySelector('.horary-saved-opened');
    expect(opened?.textContent).toContain(t.savedBeforePractitioner);
    expect(opened?.querySelector('.horary-practitioner')).toBeNull();
  });
});
