/**
 * The shared radio primitive (#506/#508) — see `Checkbox`'s doc comment for the shared-anatomy
 * rationale. Always used in a `name`-grouped set; `ChoiceGroup` builds the common "two to four
 * exclusive choices" segmented-control case on top of this.
 *
 * An optional `term` (#1867) puts a glossary definition on one word of the label. The word is a
 * plain, non-interactive span: a click on it is an ordinary click on label text, so it selects
 * the radio, and no button ever sits inside the `<label>`. Its popup follows `Tooltip`'s rules
 * through `use-tooltip-state` (hover after a delay, click pins, Escape and outside click close);
 * keyboard focus on the radio itself reveals it, and blur closes it unless pinned. The popup is
 * always mounted, `aria-hidden` and linked with `aria-describedby`, so the radio's accessible
 * name stays exactly `label` and the definition is read as its description.
 */
/**
 * @module ui/primitives/Radio
 * @purpose Shared radio control: a real <input type="radio"> plus its label, sharing anatomy with Checkbox, with an optional glossary popup on one word of the label.
 * @conventions Always rendered inside a caller-owned `role="radiogroup"`/`name` group — this primitive is one option, not the group. A `term` word is a non-interactive span inside the label (never a button); its popup is aria-hidden and wired by aria-describedby, so the accessible name is `label` exactly.
 * @exports Radio, RadioProps, RadioTerm
 */
import { useTooltipState } from './use-tooltip-state.js';

export interface RadioTerm {
  /** The exact text of the word in `label` that carries the definition (first occurrence). */
  readonly word: string;
  /** The definition shown in the word's popup and read as the radio's description. */
  readonly definition: string;
}

export interface RadioProps {
  readonly label: string;
  readonly name: string;
  readonly checked: boolean;
  readonly onChange: () => void;
  readonly disabled?: boolean | undefined;
  /** A glossary definition on one word of `label`; if the word is not found, the label renders plain. */
  readonly term?: RadioTerm | undefined;
}

export function Radio({ label, name, checked, onChange, disabled, term }: RadioProps): React.JSX.Element {
  const at = term === undefined || term.word === '' ? -1 : label.indexOf(term.word);
  if (term === undefined || at < 0) {
    return (
      <label className="primitive-choice">
        <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onChange} /> {label}
      </label>
    );
  }
  return (
    <TermRadio
      before={label.slice(0, at)}
      after={label.slice(at + term.word.length)}
      term={term}
      name={name}
      checked={checked}
      onChange={onChange}
      disabled={disabled}
    />
  );
}

interface TermRadioProps {
  readonly before: string;
  readonly after: string;
  readonly term: RadioTerm;
  readonly name: string;
  readonly checked: boolean;
  readonly onChange: () => void;
  readonly disabled: boolean | undefined;
}

function TermRadio({ before, after, term, name, checked, onChange, disabled }: TermRadioProps): React.JSX.Element {
  const { open, popoverId, wrapperRef, openNow, closeUnlessSticky, toggleSticky, onPointerEnter, onPointerLeave } =
    useTooltipState();
  return (
    <label className="primitive-choice">
      <input
        type="radio"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        aria-describedby={popoverId}
        onFocus={openNow}
        onBlur={closeUnlessSticky}
      />{' '}
      <span>
        {before}
        <span
          ref={wrapperRef}
          className="primitive-tooltip glossary-term"
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
        >
          {/* A plain span with a click handler, not a control: the click still reaches the label and selects the radio, and keyboard users reach the popup through the radio's own focus. */}
          <span className="primitive-tooltip-trigger" onClick={toggleSticky}>
            {term.word}
          </span>
          <span
            id={popoverId}
            role="tooltip"
            className="primitive-tooltip-popup"
            data-placement="beside"
            aria-hidden="true"
            hidden={!open}
            onPointerEnter={onPointerEnter}
            // The popup sits inside the label, so a click on its text would otherwise select the option.
            onClick={(event) => {
              event.preventDefault();
            }}
          >
            {term.definition}
          </span>
        </span>
        {after}
      </span>
    </label>
  );
}
