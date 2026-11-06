// @vitest-environment jsdom
/**
 * The shared result-state message (#513): an error is announced at once, every other state politely, a working state
 * is marked busy — and no screen hand-rolls the `.warning`/`.status` paragraph any more.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { STATUS_KINDS, StatusMessage } from '../src/ui/primitives/StatusMessage.js';

function render(kind: (typeof STATUS_KINDS)[number]): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  act(() => {
    createRoot(container).render(<StatusMessage kind={kind}>text</StatusMessage>);
  });
  const message = container.querySelector('p');
  if (message === null) throw new Error('no message rendered');
  return message;
}

describe('StatusMessage (#513)', () => {
  it.each(STATUS_KINDS)('%s carries its kind and the right live-region role', (kind) => {
    const message = render(kind);
    expect(message.dataset.kind).toBe(kind);
    expect(message.getAttribute('role')).toBe(kind === 'error' ? 'alert' : 'status');
    expect(message.getAttribute('aria-busy') === 'true').toBe(kind === 'loading' || kind === 'updating');
  });

  it('puts an optional detail inside the same live region, not in a second paragraph (#1162)', () => {
    const container = document.createElement('div');
    document.body.append(container);
    act(() => {
      createRoot(container).render(
        <StatusMessage kind="error" detail="why">
          headline
        </StatusMessage>,
      );
    });
    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(container.querySelector('p')?.getAttribute('role')).toBe('alert');
    expect(container.querySelector('.status-detail')?.textContent).toBe('why');
    act(() => {
      createRoot(container).render(<StatusMessage kind="error">headline</StatusMessage>);
    });
    expect(container.querySelector('.status-detail')).toBeNull();
  });

  it('is used instead of a hand-rolled warning or loading paragraph', () => {
    const offenders = readdirSync('src/ui')
      .filter((name) => name.endsWith('.tsx'))
      .filter((name) =>
        /<p className="(?:warning" role="alert|status)">/.test(readFileSync(`src/ui/${name}`, 'utf-8')),
      );
    expect(offenders).toEqual([]);
  });

  // #1162: these screens must not hand-roll a live-region paragraph; a `<p>` carrying `role=` is the hand-rolled form.
  const HAND_ROLLED_ROLE_PARAGRAPH = /<p\b[^>]*\brole=/;

  it('detects a hand-rolled role paragraph (self-check of the pattern)', () => {
    expect(HAND_ROLLED_ROLE_PARAGRAPH.test('<p role="alert">x</p>')).toBe(true);
    expect(HAND_ROLLED_ROLE_PARAGRAPH.test('<StatusMessage kind="error">x</StatusMessage>')).toBe(false);
  });

  it.each(['ReportView.tsx', 'PdfAiInterpretationPicker.tsx', 'PreferencesView.tsx'])(
    '%s renders status and alert text through StatusMessage (#1162)',
    (name) => {
      const source = readFileSync(`src/ui/${name}`, 'utf-8');
      expect(HAND_ROLLED_ROLE_PARAGRAPH.test(source)).toBe(false);
    },
  );

  // #1162 (S5), a ratchet: no NEW hand-rolled status or alert element. A `<p>` or `<div>` whose `role` is "status" or
  // "alert" (or an expression naming either) belongs in `StatusMessage`. The recorded exceptions (§7) are allowlisted by
  // file with the number each may keep; the list can only shrink. The pattern reads one tag up to
  // the first `>`, so an arrow function in an attribute before `role=` hides a tag from it.
  const HAND_ROLLED_LIVE_REGION = /<(?:p|div)\b[^>]*?\brole=(?:"(?:alert|status)"|\{[^}]*(?:alert|status)[^}]*\})/gs;
  const ALLOWED_HAND_ROLLED: Readonly<Record<string, number>> = {
    // A recorded exception (#1162, S2): popup rows inside a listbox, not result-region messages.
    'BirthPlaceSearch.tsx': 3,
    // Recorded exceptions (#1211), each with its reason in docs/ui/UI-UX_GUIDELINES.md §7.
    'ChartView.tsx': 1,
    'NoteSaveStatus.tsx': 1,
    'PageHeader.tsx': 1,
    'PdfExportBuilder.tsx': 1,
    'PwaStatus.tsx': 1,
    'SelectionInspector.tsx': 1,
    'SidebarFooter.tsx': 1,
    'SyncBadge.tsx': 1,
  };

  function uiSources(directory: string): readonly string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) return entry.name === 'primitives' ? [] : uiSources(path);
      return entry.name.endsWith('.tsx') ? [path] : [];
    });
  }

  it('detects a hand-rolled live region (self-check of the ratchet pattern)', () => {
    const count = (source: string): number => source.match(HAND_ROLLED_LIVE_REGION)?.length ?? 0;
    expect(count('<p className="hint" role="status">x</p>')).toBe(1);
    expect(count('<div\n  className="x"\n  role="alert"\n>')).toBe(1);
    expect(count('<p role={kind === "error" ? "alert" : "status"}>x</p>')).toBe(1);
    expect(count('<div role="listbox">')).toBe(0);
    expect(count('<StatusMessage kind="error">x</StatusMessage>')).toBe(0);
  });

  it('no screen adds a hand-rolled status or alert beyond the allowlist (#1162, ratchet)', () => {
    const found: Record<string, number> = {};
    for (const path of uiSources('src/ui')) {
      const count = readFileSync(path, 'utf-8').match(HAND_ROLLED_LIVE_REGION)?.length ?? 0;
      if (count > 0) found[path.slice(path.lastIndexOf('/') + 1)] = count;
    }
    const overAllowance = Object.entries(found).filter(([name, count]) => count > (ALLOWED_HAND_ROLLED[name] ?? 0));
    expect(overAllowance).toEqual([]);
    // A converted spot must leave the list, so the allowlist cannot quietly outlive the code it excuses.
    const stale = Object.entries(ALLOWED_HAND_ROLLED).filter(([name, allowed]) => (found[name] ?? 0) < allowed);
    expect(stale).toEqual([]);
  });

  it('ReportView no longer wraps its AI-rejection message in a hand-rolled alert div (#1162)', () => {
    expect(/<div\b[^>]*\brole="alert"/.test(readFileSync('src/ui/ReportView.tsx', 'utf-8'))).toBe(false);
  });
});
