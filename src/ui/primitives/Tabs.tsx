/**
 * @module ui/primitives/Tabs
 * @purpose Same-page tabs (`docs/ui/UI-UX_GUIDELINES.md` §5, §9): a few compact, mutually exclusive panels that share one context, with the WAI-ARIA tab pattern's roles, selected state and arrow-key navigation.
 * @conventions Manual activation is not used: the arrow keys, Home and End move focus and select together, because every panel here is cheap to show. Roving tabindex, so the tablist is one Tab stop and the panel is the next. The panel is the caller's, rendered after the strip with `tabPanelProps`, so the primitive owns no content. Route navigation does not use this: links stay links (§9).
 * @exports Tabs, tabPanelProps
 */
import { useRef } from 'react';

export interface TabItem<K extends string> {
  readonly key: K;
  readonly label: string;
}

/** The ids a panel needs to be labelled by its tab, matching what `Tabs` renders. */
export function tabPanelProps(
  idBase: string,
  key: string,
): {
  readonly role: 'tabpanel';
  readonly id: string;
  readonly 'aria-labelledby': string;
  readonly tabIndex: 0;
} {
  return { role: 'tabpanel', id: `${idBase}-panel-${key}`, 'aria-labelledby': `${idBase}-tab-${key}`, tabIndex: 0 };
}

export function Tabs<K extends string>({
  idBase,
  label,
  items,
  active,
  onSelect,
}: {
  /** Shared by the tabs and `tabPanelProps`, so each tab names its panel and each panel its tab. */
  readonly idBase: string;
  /** The accessible name of the tab strip. */
  readonly label: string;
  readonly items: readonly TabItem<K>[];
  readonly active: K;
  readonly onSelect: (key: K) => void;
}): React.JSX.Element {
  const refs = useRef(new Map<K, HTMLButtonElement>());

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const current = items.findIndex((item) => item.key === active);
    let next: number | undefined;
    if (event.key === 'ArrowRight') next = (current + 1) % items.length;
    else if (event.key === 'ArrowLeft') next = (current - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    if (next === undefined) return;
    const target = items[next];
    if (target === undefined) return;
    event.preventDefault();
    onSelect(target.key);
    refs.current.get(target.key)?.focus();
  };

  return (
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {items.map((item) => (
        <button
          key={item.key}
          ref={(element) => {
            if (element === null) refs.current.delete(item.key);
            else refs.current.set(item.key, element);
          }}
          type="button"
          id={`${idBase}-tab-${item.key}`}
          role="tab"
          aria-selected={active === item.key}
          aria-controls={`${idBase}-panel-${item.key}`}
          tabIndex={active === item.key ? 0 : -1}
          className={active === item.key ? 'tab active' : 'tab'}
          onClick={() => {
            onSelect(item.key);
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
