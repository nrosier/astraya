/**
 * One autosaved note text area (#919): shows the text, hands every edit to the autosave hook and reports
 * the save state. Used by the Birth Record notes card and by each Consultation note.
 */
/**
 * @module ui/AutosavedNoteField
 * @purpose Text area bound to `use-note-autosave`: local text seeded from the store head or a recovered journal, autosave on edit, an optional inline save-state line, and the state reported upward for a card header.
 * @conventions Local text wins once the user has typed or a journal was recovered, so a sync pull never overwrites typing; the journal is keyed by the store's device id, which is unique per database; `inline` draws the line under the field (quiet until the first edit), otherwise the parent shows it from `onState`; notes edits never touch the page Save state.
 * @exports AutosavedNoteField, AutosavedNoteFieldProps
 */
import { useEffect, useState } from 'react';
import type { Mutation } from '../store/oplog.js';
import { NoteSaveStatus } from './NoteSaveStatus.js';
import type { NoteSaveState } from './note-autosave.js';
import { TextAreaField } from './primitives/TextAreaField.js';
import { useStore } from './store-context.js';
import { useNoteAutosave } from './use-note-autosave.js';

export interface AutosavedNoteFieldProps {
  readonly label: string;
  readonly hideLabel?: boolean;
  /** The note's text in the store now (empty for a new note). Shown until the user types. */
  readonly storedText: string;
  /** Identifies the note within the database for the journal, and the caller in `onState`. */
  readonly scope: string;
  /** Builds the revision at save time, naming the current head and forks as parents. Undefined writes nothing. */
  readonly toMutation: (text: string) => Mutation | undefined;
  /** Draw the save-state line under the field. */
  readonly inline?: boolean;
  /** Called with the scope and the new state whenever it changes, and with undefined on unmount. */
  readonly onState?: (scope: string, state: NoteSaveState | undefined) => void;
  readonly rows?: number;
}

export function AutosavedNoteField({
  label,
  hideLabel,
  storedText,
  scope,
  toMutation,
  inline = false,
  onState,
  rows = 3,
}: AutosavedNoteFieldProps): React.JSX.Element {
  const store = useStore();
  // The journal is keyed by `store.dbName` inside the hook. Callers key this field by `scope`, so a new note
  // remounts it with fresh local text.
  const autosave = useNoteAutosave({ store, scope, toMutation, headText: storedText });
  const [typed, setTyped] = useState<string | undefined>(undefined);
  const { state } = autosave;
  // Text left by an earlier visit shows until the user types something else.
  const shown = typed ?? autosave.recovered ?? storedText;

  useEffect(() => {
    onState?.(scope, state);
  }, [onState, scope, state]);
  useEffect(
    () => () => {
      onState?.(scope, undefined);
    },
    [onState, scope],
  );

  return (
    <>
      <TextAreaField
        label={label}
        {...(hideLabel === undefined ? {} : { hideLabel })}
        rows={rows}
        value={shown}
        onChange={(value) => {
          setTyped(value);
          autosave.edit(value);
        }}
      />
      {inline && <NoteSaveStatus state={state} hideIdle />}
    </>
  );
}
