/**
 * The command palette dialog (#1654): a centred modal search over every place the app can open.
 *
 * It takes a query, scores the search index (`search-index.ts`) with the scorer (`search-score.ts`),
 * and lists the results as a listbox driven from the input. With an empty query it shows the pinned
 * entries first, then the recent ones (`palette-recents.ts`). Enter opens the highlighted entry and
 * records it as recent. Escape, the close button and a press on the backdrop close the palette and
 * return focus to the control that opened it, through the shared `StagedDialog`. Each result has a
 * pin toggle.
 *
 * Person entries use the last opened person (`last-person.ts`), and that person's name leads their
 * breadcrumb (owner answer 2). Pins and recents are per device. The body is mounted only while the
 * palette is open, so every open starts from an empty query with current pins and recents.
 */
/**
 * @module ui/CommandPalette
 * @purpose The command palette dialog (#1654): a modal search over the app's features, charts, tabs and Preferences, with arrow-key results, Enter to open, pins and recents.
 * @conventions Built on the shared `StagedDialog` (focus wrap, Escape, backdrop, focus return) with no footer, and the shared `TextField` and `Button` primitives, so no raw dialog, input or button is written here (`test/ui-primitive-enforcement.test.ts`). Results are a `role="listbox"` driven from a `role="combobox"` input with `aria-activedescendant`; the listbox always renders so `aria-controls` names a real element. The pin button sits beside each option, not inside it, so the option's children stay presentational. Pins and recents are device-local; all strings come from `CommandPalette.messages.ts`. The pin button uses the `.command-palette-pin` class, which carries the #1650 circle shape until the shared circle class lands.
 * @exports CommandPalette, CommandPaletteProps
 */
import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { useOptionalStore } from './store-context.js';
import { useLastPersonId } from './last-person.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { buildSearchIndex, type SearchEntry } from './search-index.js';
import { scoreEntries } from './search-score.js';
import { prunePaletteState, readPaletteState, recordRecent, togglePin, type PaletteState } from './palette-recents.js';
import { Button } from './primitives/Button.js';
import { StagedDialog } from './primitives/StagedDialog.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { TextField } from './primitives/TextField.js';
import { commandPaletteMessages } from './CommandPalette.messages.js';

export interface CommandPaletteProps {
  readonly open: boolean;
  /** Escape, the close button, a backdrop press, a route change and a result being opened all call this. */
  readonly onClose: () => void;
  /** Focus returns here when the palette closes. */
  readonly returnFocusTo: RefObject<HTMLElement | null>;
}

type RowGroup = 'pinned' | 'recent' | 'match';

interface Row {
  readonly entry: SearchEntry;
  readonly group: RowGroup;
}

/**
 * The rows for one query. An empty query lists the pins in pin order, then the recents that are not pinned.
 * A query lists the scored matches in score order. Ids missing from the index are dropped.
 */
function rowsFor(query: string, index: readonly SearchEntry[], stored: PaletteState): Row[] {
  if (query.trim() !== '') {
    return scoreEntries(query, index).map((scored) => ({ entry: scored.entry, group: 'match' }));
  }
  const byId = new Map(index.map((entry) => [entry.id, entry]));
  const pinned = new Set(stored.pins);
  const pinRows = stored.pins.flatMap((id): Row[] => {
    const entry = byId.get(id);
    return entry === undefined ? [] : [{ entry, group: 'pinned' }];
  });
  const recentRows = stored.recents.flatMap((id): Row[] => {
    const entry = byId.get(id);
    return entry === undefined || pinned.has(id) ? [] : [{ entry, group: 'recent' }];
  });
  return [...pinRows, ...recentRows];
}

/** The modal shell. The shared StagedDialog owns focus, Escape, the backdrop and focus return. */
export function CommandPalette({ open, onClose, returnFocusTo }: CommandPaletteProps): React.JSX.Element {
  const t = useMessages(commandPaletteMessages);
  const inputRef = useRef<HTMLInputElement>(null);

  // Runs after StagedDialog has opened the dialog (a parent effect runs after its children's), so the field
  // takes focus while it is visible.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  return (
    <StagedDialog
      open={open}
      heading={t.dialogLabel}
      closeLabel={t.close}
      onDiscard={onClose}
      returnFocusTo={returnFocusTo}
      dialogClassName="settings-card command-palette"
      footer={null}
    >
      {open && <PaletteBody onClose={onClose} inputRef={inputRef} />}
    </StagedDialog>
  );
}

/** The search field and results. Mounted only while the palette is open, so each open starts clean. */
function PaletteBody({
  onClose,
  inputRef,
}: {
  readonly onClose: () => void;
  readonly inputRef: RefObject<HTMLInputElement | null>;
}): React.JSX.Element {
  const t = useMessages(commandPaletteMessages);
  const [locale] = useLocale();
  const store = useOptionalStore();
  const lastPersonId = useLastPersonId();
  const person = lastPersonId === undefined ? undefined : store?.state.people.get(lastPersonId);
  const personId = person === undefined ? undefined : lastPersonId;

  const index = useMemo(
    () =>
      buildSearchIndex(
        {
          personId,
          personName: person?.displayName,
          hasBirthMoment: person === undefined ? undefined : person.moment !== undefined,
        },
        locale,
      ),
    [personId, person, locale],
  );

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [stored, setStored] = useState<PaletteState>(readPaletteState);
  const baseId = useId();
  const listId = `${baseId}-list`;

  // Forget recents and pins that no longer exist, but only while a person is known, so the index is complete.
  useEffect(() => {
    if (personId === undefined) return;
    prunePaletteState(new Set(index.map((entry) => entry.id)));
  }, [index, personId]);

  const rows = useMemo(() => rowsFor(query, index, stored), [query, index, stored]);
  const pinnedIds = useMemo(() => new Set(stored.pins), [stored.pins]);
  const current = rows.length === 0 ? -1 : Math.min(active, rows.length - 1);
  const activeRow = rows[current];
  const activeOptionId = current === -1 ? undefined : `${baseId}-option-${current}`;

  function activate(row: Row | undefined): void {
    if (row === undefined || row.entry.disabled === true) return;
    recordRecent(row.entry.id);
    window.location.hash = row.entry.href;
    onClose();
  }

  function togglePinned(entry: SearchEntry): void {
    togglePin(entry.id);
    setStored(readPaletteState());
  }

  function moveActive(step: number): void {
    if (rows.length === 0) return;
    setActive((previous) => (previous + step + rows.length) % rows.length);
  }

  let previousGroup: RowGroup | undefined;
  const listItems: React.JSX.Element[] = [];
  rows.forEach((row, position) => {
    if (query.trim() === '' && row.group !== previousGroup) {
      const heading = row.group === 'pinned' ? t.pinnedHeading : t.recentHeading;
      listItems.push(
        <div role="presentation" className="command-palette-group" key={`group-${row.group}-${position}`}>
          {heading}
        </div>,
      );
    }
    previousGroup = row.group;
    const { entry } = row;
    const pinned = pinnedIds.has(entry.id);
    const isActive = position === current;
    const optionId = `${baseId}-option-${position}`;
    listItems.push(
      <div role="none" className="command-palette-row" key={entry.id}>
        <div
          role="option"
          id={optionId}
          aria-selected={isActive}
          aria-disabled={entry.disabled === true ? true : undefined}
          className={isActive ? 'command-palette-option active' : 'command-palette-option'}
          onMouseMove={() => {
            setActive(position);
          }}
          onClick={() => {
            activate(row);
          }}
        >
          <span className="command-palette-title">{entry.title}</span>
          {entry.breadcrumb !== '' && <span className="command-palette-breadcrumb">{entry.breadcrumb}</span>}
          {entry.disabled === true && <span className="command-palette-hint">{t.disabledHint}</span>}
        </div>
        <Button
          variant="plain"
          className={pinned ? 'command-palette-pin pinned' : 'command-palette-pin'}
          aria-label={pinned ? t.unpin(entry.title) : t.pin(entry.title)}
          aria-pressed={pinned}
          onClick={() => {
            togglePinned(entry);
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 3l3 6 6 .9-4.5 4.2 1.1 6.1L12 17.6 6.4 20.2l1.1-6.1L3 9.9 9 9z" />
          </svg>
        </Button>
      </div>,
    );
  });

  return (
    <>
      <div className="command-palette-header">
        <TextField
          label={t.searchLabel}
          hideLabel
          value={query}
          placeholder={t.placeholder}
          autoComplete="off"
          inputRef={inputRef}
          onChange={(value) => {
            setQuery(value);
            setActive(0);
          }}
          inputProps={{
            role: 'combobox',
            'aria-expanded': true,
            'aria-controls': listId,
            'aria-autocomplete': 'list',
            'aria-activedescendant': activeOptionId,
            onKeyDown: (event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                moveActive(1);
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                moveActive(-1);
              } else if (event.key === 'Enter') {
                event.preventDefault();
                activate(activeRow);
              }
            },
          }}
        />
      </div>
      {/* The listbox always exists, so aria-controls always names a real element, even with no results. */}
      <div role="listbox" id={listId} aria-label={t.resultsLabel} className="command-palette-list">
        {listItems}
      </div>
      {rows.length === 0 &&
        (query.trim() === '' ? (
          <StatusMessage kind="empty" className="command-palette-empty">
            {t.emptyHint}
          </StatusMessage>
        ) : (
          <StatusMessage kind="zero" className="command-palette-empty">
            {t.noMatch(query.trim())}
          </StatusMessage>
        ))}
    </>
  );
}
