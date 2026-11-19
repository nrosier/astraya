/**
 * @module ui/RailNavItem
 * @purpose One sidebar entry for the icon rail (#1747): an icon and a visible label inside a link (or a disabled button), with a sibling tooltip that names the item when the rail is collapsed.
 * @conventions The icon and the label span are the only children of the link or button, so its `textContent` is the label alone; the tooltip is a sibling `role="tooltip"` span, never inside it. Class names `app-nav-item`, `active` and `disabled` are kept. The collapsed look is CSS only (`app.css`, from 64rem); the DOM is the same in both states. Escape dismisses the tooltip (WCAG 1.4.13).
 * @exports RailNavItem, RailIconKey, RAIL_ICONS, isRailIconKey
 */
import { useState } from 'react';
import type { JSX } from 'react';
import { Button } from './primitives/Button.js';
import {
  BookOpen,
  CalendarClock,
  Compass,
  FileDown,
  GitMerge,
  Globe,
  IdCard,
  LayoutDashboard,
  MessageSquareText,
  TrendingUp,
  Wrench,
} from './nav-icons.js';

/** Which icon each sidebar entry uses, keyed by tab or section key (#1747). */
export const RAIL_ICONS = {
  'birth-record': IdCard,
  overview: LayoutDashboard,
  consultation: MessageSquareText,
  chart: Compass,
  report: BookOpen,
  astrocartography: Globe,
  'transits-forecast': CalendarClock,
  'progressions-directions': TrendingUp,
  'relationship-charts': GitMerge,
  tools: Wrench,
  pdf: FileDown,
} as const;

export type RailIconKey = keyof typeof RAIL_ICONS;

/** Narrows a tab or section key to one that has a rail icon. */
export function isRailIconKey(key: string): key is RailIconKey {
  return Object.hasOwn(RAIL_ICONS, key);
}

interface CommonProps {
  /** Selects the icon. */
  readonly iconKey: RailIconKey;
  /** The visible label; also the link's `aria-label` and the tooltip text. */
  readonly label: string;
}

interface LinkProps extends CommonProps {
  readonly kind: 'link';
  readonly href: string;
  readonly active: boolean;
  readonly title?: string | undefined;
  readonly onNavigate: () => void;
}

interface DisabledProps extends CommonProps {
  readonly kind: 'disabled';
  /** The accessible name of the disabled button (#1697). */
  readonly accessibleName: string;
  /** The native tooltip that says why the entry is off. */
  readonly hint: string;
}

export function RailNavItem(props: LinkProps | DisabledProps): JSX.Element {
  const [dismissed, setDismissed] = useState(false);
  const Icon = RAIL_ICONS[props.iconKey];
  const content = (
    <>
      <Icon />
      <span className="rail-nav-label">{props.label}</span>
    </>
  );
  return (
    <span
      className="rail-nav-item"
      data-tooltip-dismissed={dismissed ? 'true' : undefined}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setDismissed(true);
      }}
      onMouseLeave={() => {
        setDismissed(false);
      }}
      onBlur={() => {
        setDismissed(false);
      }}
    >
      {props.kind === 'link' ? (
        <a
          href={props.href}
          className={props.active ? 'app-nav-item active' : 'app-nav-item'}
          aria-label={props.label}
          aria-current={props.active ? 'page' : undefined}
          title={props.title}
          onClick={props.onNavigate}
        >
          {content}
        </a>
      ) : (
        <Button
          variant="plain"
          disabled
          className="app-nav-item disabled"
          aria-label={props.accessibleName}
          title={props.hint}
        >
          {content}
        </Button>
      )}
      <span className="rail-nav-tooltip" role="tooltip">
        {props.label}
      </span>
    </span>
  );
}
