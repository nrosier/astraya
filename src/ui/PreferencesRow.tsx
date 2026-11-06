/**
 * One Preferences setting as a two-column row (#966): the title on the left (60%), with its muted description under it
 * or an info icon beside it that discloses the same text as a tooltip (#1185), and the control on the right (40%,
 * right-aligned). Stacks on a phone. The control keeps its own accessible name.
 */
/**
 * @module ui/PreferencesRow
 * @purpose The 60/40 label-to-control row every Preferences setting sits in (#966), shared by the Preferences page and the settings controls it hosts.
 * @conventions Layout only: holds no state and no text of its own, so the caller passes already-translated strings. `info` (with `infoLabel`, the icon's accessible name) puts the explanation in a keyboard-reachable tooltip instead of a paragraph (#1185). Styles are `.preferences-row*` in `app.css`.
 * @exports PreferencesRow
 */
import { Tooltip } from './primitives/Tooltip.js';

export function PreferencesRow({
  title,
  description,
  info,
  infoLabel,
  children,
}: {
  readonly title: string;
  readonly description?: string | undefined;
  /** The explanation, disclosed by an info icon beside the title rather than printed under it. */
  readonly info?: string | undefined;
  /** The info icon's accessible name, e.g. "About Language"; required with `info`. */
  readonly infoLabel?: string | undefined;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="preferences-row">
      <div className="preferences-row-text">
        <p className="preferences-row-title">
          {title}
          {info !== undefined && (
            <>
              {' '}
              <Tooltip text={info} label={infoLabel} className="primitive-tooltip-icon">
                ?
              </Tooltip>
            </>
          )}
        </p>
        {description !== undefined && <p className="preferences-row-description">{description}</p>}
      </div>
      <div className="preferences-row-control">{children}</div>
    </div>
  );
}
