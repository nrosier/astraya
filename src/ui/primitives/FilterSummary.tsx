/**
 * @module ui/primitives/FilterSummary
 * @purpose The one line that says a result list is filtered (`docs/UI-UX_GUIDELINES.md` §6): the filter's name, how many of the total are shown, and the action that changes it.
 * @conventions The count is a polite live region, so a change of filter is announced; the action is optional because a screen that only reports the filter (a read-only summary) has nothing to change. Wording, including the count sentence, comes from the caller's locale file.
 * @exports FilterSummary
 */
import type { Ref } from 'react';

export function FilterSummary({
  summary,
  changeLabel,
  onChange,
  changeRef,
  changeProps,
}: {
  /** The whole sentence, e.g. "Important · 12 of 87 shown". */
  readonly summary: string;
  /** The text of the action that opens the filter controls, e.g. "Change filters". */
  readonly changeLabel?: string | undefined;
  readonly onChange?: (() => void) | undefined;
  /** For a caller that returns focus to the action when its dialog closes. */
  readonly changeRef?: Ref<HTMLButtonElement> | undefined;
  readonly changeProps?: React.ButtonHTMLAttributes<HTMLButtonElement> | undefined;
}): React.JSX.Element {
  return (
    // A summary with nothing to change reads as a hint, as the counts it replaces did.
    <p className={onChange === undefined ? 'filter-summary hint' : 'filter-summary'}>
      <span role="status" className="filter-summary-count">
        {summary}
      </span>
      {changeLabel !== undefined && onChange !== undefined && (
        <>
          {' '}
          <button type="button" className="quiet" ref={changeRef} {...changeProps} onClick={onChange}>
            {changeLabel}
          </button>
        </>
      )}
    </p>
  );
}
