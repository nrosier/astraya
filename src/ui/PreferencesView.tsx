/**
 * The Preferences workspace (#506/#510): durable account/device settings in one stable place,
 * per `docs/UI-UX_GUIDELINES.md` §3's setting-scope model — a reader should never have to
 * remember that the rulers choice lives in a chart's Extended settings and the symbol class
 * lives in the header. Every control here is the *same* control other screens already use
 * (`RulershipSetting`, `SymbolSetting`, `LanguageToggle`, `ThemeToggle`), writing the same
 * shared device/account preference those screens read — this page is one more place to reach
 * it, not a second source of truth for it.
 *
 * Four stable subsections (General / Astrology defaults / Appearance & accessibility / Data &
 * privacy) as headings on one page rather than separate routes or tabs: there is no content yet
 * that would make a reader scroll past a screenful per subsection, so a subsection picker would
 * be premature per `docs/UI-UX_IMPLEMENTATION_PLAN.md`'s own "use ordinary links on wide layouts
 * ... if the subsection navigation cannot fit" — it already fits.
 *
 * Full-data/CSV export lives under Data & privacy per the guidelines (not the header's Export
 * menu, where it still *also* lives today — moving it out of there, and moving Build PDF to a
 * Documents destination, is the remaining Phase 2 task this screen's existence unblocks, not
 * done in this slice).
 */
/**
 * @module ui/PreferencesView
 * @purpose Preferences workspace (#506/#510): General/Astrology defaults/Appearance & accessibility/Data & privacy, each reusing the screen's own existing device/account-preference controls rather than duplicating them.
 * @conventions Every control is the same shared component/hook other screens already use (RulershipSetting.tsx, SymbolSetting.tsx, LanguageToggle.tsx, ThemeToggle.tsx) — this screen never reads or writes a setting's storage directly. Full-data export reuses domain/full-export.js's pure functions, the same ones AppNav.tsx's Export menu calls.
 * @exports PreferencesView
 */
import { useState } from 'react';
import { buildFullExport, fullExportFilename, peopleCsvFilename, peopleToCsv } from '../domain/full-export.js';
import { APP_VERSION } from '../version.js';
import { downloadText } from './download.js';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { LanguageToggle } from './LanguageToggle.js';
import { useMessages } from './messages.js';
import { preferencesViewMessages } from './PreferencesView.messages.js';
import { RulershipSetting } from './RulershipSetting.js';
import { useRulershipChoice } from './rulership-setting.js';
import { sharedMessages } from './shared.messages.js';
import { SymbolSetting } from './SymbolSetting.js';
import { useOptionalStore } from './store-context.js';
import { ThemeToggle } from './ThemeToggle.js';
import { useSymbolClass } from './symbol-setting.js';

interface ExportStatus {
  readonly kind: 'busy' | 'done' | 'error';
  readonly text: string;
}

export function PreferencesView(): React.JSX.Element {
  const t = useMessages(preferencesViewMessages);
  const shared = useMessages(sharedMessages);
  const store = useOptionalStore();
  const { provider } = useEphemerisProvider();
  const [rulership] = useRulershipChoice();
  const [symbolClass] = useSymbolClass();
  const [status, setStatus] = useState<ExportStatus | undefined>(undefined);

  const run = (what: string, action: () => void | Promise<void>): void => {
    setStatus({ kind: 'busy', text: t.exportPreparing(what) });
    void Promise.resolve()
      .then(action)
      .then(() => {
        setStatus({ kind: 'done', text: t.exportDone(what) });
      })
      .catch((error: unknown) => {
        setStatus({ kind: 'error', text: t.exportFailed(error instanceof Error ? error.message : String(error)) });
      });
  };

  const exportEverything = (): void => {
    run(t.exportEverythingName, async () => {
      if (provider === undefined) throw new Error(t.exportNeedsEngine);
      if (store === undefined) throw new Error(t.exportNeedsStore);
      const now = new Date();
      const archive = await buildFullExport({
        people: [...store.state.people.values()],
        provider,
        appVersion: APP_VERSION,
        rulership,
        symbolClass,
        now,
      });
      downloadText(fullExportFilename(now), `${JSON.stringify(archive, null, 2)}\n`, 'application/json');
    });
  };

  const exportPeopleCsv = (): void => {
    run(t.exportPeopleName, () => {
      if (store === undefined) throw new Error(t.exportNeedsStore);
      const now = new Date();
      downloadText(peopleCsvFilename(now), peopleToCsv([...store.state.people.values()]), 'text/csv');
    });
  };

  return (
    <main className="shell">
      <p className="back">
        <a href="#/people">&larr; {shared.back}</a>
      </p>
      <h1>{t.heading}</h1>
      <p>{t.intro}</p>

      <h2 id="preferences-general">{t.generalHeading}</h2>
      <p>{t.languageLabel}</p>
      <LanguageToggle />

      <h2 id="preferences-astrology">{t.astrologyHeading}</h2>
      <p>{t.rulersSubtitle}</p>
      <RulershipSetting />

      <h2 id="preferences-appearance">{t.appearanceHeading}</h2>
      <p>{t.themeLabel}</p>
      <ThemeToggle />
      <SymbolSetting />

      <h2 id="preferences-data">{t.dataHeading}</h2>
      <p>{t.exportEverythingHint}</p>
      <p>
        <button type="button" disabled={store === undefined} onClick={exportEverything}>
          {t.exportEverything}
        </button>{' '}
        <button type="button" disabled={store === undefined} onClick={exportPeopleCsv}>
          {t.exportPeopleCsv}
        </button>
      </p>
      {status !== undefined && (
        <p
          className={`status preferences-export-status ${status.kind}`}
          role={status.kind === 'error' ? 'alert' : 'status'}
        >
          {status.text}
        </p>
      )}
    </main>
  );
}
