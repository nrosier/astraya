/**
 * The content header (#506/#509): the page title and the current screen's own exports, together
 * — per `docs/UI-UX_GUIDELINES.md`, "the content header contains the page title, compact
 * calculation basis, primary page action, and actions that affect only this page. It does not
 * repeat global navigation."
 *
 * Reads the exact same `export-registry.tsx` context the header's old global Export menu read:
 * a screen that calls `useRegisterExports` does not need to change at all for its exports to show
 * up here instead of (now: as well as) that global menu — moving them is a matter of which
 * component reads the registry, not a new registration mechanism. `ChartView.tsx` is the only
 * screen that registers anything today; `AppNav.tsx`'s "This page" section was removed in the
 * same change that introduced this component, so a chart's exports now live only here.
 *
 * Deliberately not reusing `.app-nav-menu`/`.app-nav-group` (the header rail's dropdown classes):
 * those carry a `min-width: 64rem` override that opens the popup sideways, written for a narrow
 * rail — correct there, surprising on a full-width content page. New, page-scoped classes avoid
 * that coupling even though the shape (a toggle button, a popup list) is the same.
 */
/**
 * @module ui/PageHeader
 * @purpose Content-header primitive (#506/#509): page title, optional basis line, and the current screen's own registered exports, replacing the old global "This page" Export submenu.
 * @conventions Reads `export-registry.tsx`'s existing context directly — a screen's useRegisterExports call needs no change. Uses its own `useExclusiveOpen` instance (not the header's) for the export dropdown's open/close/Escape/outside-click behavior.
 * @exports PageHeader
 */
import { useState } from 'react';
import { useExportItems, type ExportItem } from './export-registry.js';
import { useMessages } from './messages.js';
import { pageHeaderMessages } from './PageHeader.messages.js';
import { useExclusiveOpen } from './use-exclusive-open.js';

interface ExportStatus {
  readonly kind: 'busy' | 'done' | 'error';
  readonly text: string;
}

export function PageHeader({
  title,
  basis,
  children,
}: {
  readonly title: string;
  /** A compact calculation-basis line, e.g. "Tropical · Placidus · Modern rulers". */
  readonly basis?: string | undefined;
  /** The primary page action and anything else that belongs beside the title (e.g. a share link). */
  readonly children?: React.ReactNode;
}): React.JSX.Element {
  const t = useMessages(pageHeaderMessages);
  const items = useExportItems();
  const dropdown = useExclusiveOpen<'export'>('page-header-export');
  const [status, setStatus] = useState<ExportStatus | undefined>(undefined);
  const isOpen = dropdown.open === 'export';

  const run = (label: string, action: () => void | Promise<void>): void => {
    dropdown.close();
    setStatus({ kind: 'busy', text: t.exportPreparing(label) });
    void Promise.resolve()
      .then(action)
      .then(() => {
        setStatus({ kind: 'done', text: t.exportDone(label) });
        window.setTimeout(() => {
          setStatus((current) => (current?.kind === 'done' ? undefined : current));
        }, 3000);
      })
      .catch((error: unknown) => {
        setStatus({ kind: 'error', text: t.exportFailed(error instanceof Error ? error.message : String(error)) });
      });
  };

  const groups = new Map<string, ExportItem[]>();
  const ungrouped: ExportItem[] = [];
  for (const item of items) {
    if (item.group === undefined) ungrouped.push(item);
    else groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
  }
  const itemButton = (item: ExportItem): React.JSX.Element => (
    <button
      key={item.key}
      type="button"
      className="page-header-export-item"
      disabled={item.disabled === true}
      onClick={() => {
        run(item.label, item.run);
      }}
    >
      {item.label}
    </button>
  );

  return (
    <div className="page-header">
      <div className="page-header-row">
        <h1>{title}</h1>
        {children}
        {items.length > 0 && (
          <div
            ref={dropdown.groupRef('export')}
            className={isOpen ? 'page-header-export open' : 'page-header-export'}
            onBlur={(event) => {
              dropdown.onGroupBlur('export', event);
            }}
          >
            {/* `aria-label` pins the accessible name to just the label: Chromium folds the CSS-
                generated caret (`.page-header-export-toggle::after`) into a name otherwise, same
                reasoning `AppNav.tsx`'s own `NavGroup` button already documents. */}
            <button
              type="button"
              ref={dropdown.buttonRef('export')}
              className="page-header-export-toggle"
              aria-label={t.exportLabel}
              aria-expanded={isOpen}
              aria-controls={isOpen ? 'page-header-export-menu' : undefined}
              onClick={() => {
                dropdown.toggle('export');
              }}
            >
              {t.exportLabel}
            </button>
            {isOpen && (
              <div id="page-header-export-menu" className="page-header-export-menu" aria-label={t.exportLabel}>
                {ungrouped.map(itemButton)}
                {[...groups].map(([group, groupItems]) => (
                  <div key={group} className="page-header-export-group">
                    <p className="page-header-export-group-heading">{group}</p>
                    {groupItems.map(itemButton)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {basis !== undefined && <p className="hint page-header-basis">{basis}</p>}
      {status !== undefined && (
        <p
          className={`status page-header-export-status ${status.kind}`}
          role={status.kind === 'error' ? 'alert' : 'status'}
        >
          {status.text}
        </p>
      )}
    </div>
  );
}
