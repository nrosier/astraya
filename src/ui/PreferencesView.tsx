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
import { useEffect, useState } from 'react';
import { buildFullExport, fullExportFilename, peopleCsvFilename, peopleToCsv } from '../domain/full-export.js';
import { APP_VERSION } from '../version.js';
import type { PreferencesSection } from './route.js';
import {
  DENSITY_CHOICES,
  isDensityChoice,
  isMotionChoice,
  MOTION_CHOICES,
  prefersReducedMotion,
  useDensity,
  useMotion,
} from './appearance-settings.js';
import { Select } from './primitives/Select.js';
import { downloadText } from './download.js';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { LanguageToggle } from './LanguageToggle.js';
import { useMessages } from './messages.js';
import { preferencesViewMessages } from './PreferencesView.messages.js';
import { DEFAULT_EXTENDED_SETTINGS } from '../chart/extended-settings.js';
import { readDefaultCalculationProfile } from './default-calculation-profile.js';
import { ExtendedSettingsPanel } from './ExtendedSettingsPanel.js';
import { useExtendedSettings } from './extended-settings-store.js';
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

/** Scrolls to a section heading, without animation for a reader who asked for less motion, and moves focus there: the link was followed on purpose. */
function revealSection(section: PreferencesSection): void {
  const heading = document.getElementById(`preferences-${section}`);
  if (heading === null) return;
  heading.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  heading.focus({ preventScroll: true });
}

export function PreferencesView({
  section,
}: { readonly section?: PreferencesSection | undefined } = {}): React.JSX.Element {
  const t = useMessages(preferencesViewMessages);
  const [motion, setMotion] = useMotion();
  const [density, setDensity] = useDensity();
  const shared = useMessages(sharedMessages);
  const store = useOptionalStore();
  const { provider } = useEphemerisProvider();
  const [rulership] = useRulershipChoice();
  const [extendedSettings, setExtendedSettings] = useExtendedSettings();
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
      // This device's own default calculation settings (#541) — not a fixed claim about
      // "application defaults" that would go stale once a user has customized anything.
      const settings = readDefaultCalculationProfile()?.settings ?? DEFAULT_EXTENDED_SETTINGS;
      const archive = await buildFullExport({
        people: [...store.state.people.values()],
        provider,
        appVersion: APP_VERSION,
        settings,
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

  useEffect(() => {
    if (section !== undefined) revealSection(section);
  }, [section]);

  return (
    <main className="shell">
      <p className="back">
        <a href="#/people">&larr; {shared.back}</a>
      </p>
      <h1>{t.heading}</h1>
      <p>{t.intro}</p>

      <h2 id="preferences-general" tabIndex={-1}>
        {t.generalHeading}
      </h2>
      <p>{t.languageLabel}</p>
      <LanguageToggle />

      <h2 id="preferences-astrology" tabIndex={-1}>
        {t.astrologyHeading}
      </h2>
      <p>{t.rulersSubtitle}</p>
      <RulershipSetting />

      {/* The chart-setup editor (#563): the same ExtendedSettingsPanel every chart screen
          already uses, reachable here as its own dedicated entry point rather than only hidden
          behind a chart's own "Extended settings" trigger — one place to review every
          calculation-affecting setting before computing, per the audit's own ask. Bound to the
          same page-lifetime-shared store (extended-settings-store.ts) ChartView.tsx reads, so a
          change made here previews on the next chart drawn, exactly like changing it there. */}
      <p>{t.chartSetupSubtitle}</p>
      {provider === undefined ? (
        <p className="hint">{t.chartSetupNeedsEngine}</p>
      ) : (
        <ExtendedSettingsPanel value={extendedSettings} onRedraw={setExtendedSettings} provider={provider} />
      )}

      <h2 id="preferences-appearance" tabIndex={-1}>
        {t.appearanceHeading}
      </h2>
      <p>{t.themeLabel}</p>
      <ThemeToggle />
      <SymbolSetting />
      <Select
        label={t.motionLabel}
        value={motion}
        help={t.motionHint}
        options={MOTION_CHOICES.map((choice) => ({ value: choice, label: t.motionOptions[choice] }))}
        onChange={(value) => {
          if (isMotionChoice(value)) setMotion(value);
        }}
      />
      <Select
        label={t.densityLabel}
        value={density}
        help={t.densityHint}
        options={DENSITY_CHOICES.map((choice) => ({ value: choice, label: t.densityOptions[choice] }))}
        onChange={(value) => {
          if (isDensityChoice(value)) setDensity(value);
        }}
      />

      <h2 id="preferences-data" tabIndex={-1}>
        {t.dataHeading}
      </h2>
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
