/**
 * The Preferences workspace (#506/#510): durable account/device settings in one stable place,
 * per `docs/UI-UX_GUIDELINES.md` §3's setting-scope model — a reader should never have to
 * remember that the rulers choice lives in a chart's Extended settings and the symbol class
 * lives in the header. Every control here is the *same* control other screens already use
 * (`RulershipSetting`, `SymbolSetting`, `LanguageToggle`, `ThemeToggle`), writing the same
 * shared device/account preference those screens read — this page is one more place to reach
 * it, not a second source of truth for it.
 *
 * Three tabs (Appearance & accessibility / Astrology defaults / Data & privacy, #650): the page had
 * grown past a screenful per subsection, and the panels are mutually exclusive and share one
 * context, which is the guidelines' case for same-page tabs (§5). `#/preferences/:section` still
 * deep-links to a tab; switching tabs replaces the URL in place, so it adds no history entry. Language
 * sits under Appearance, with the other things that change how the app looks and reads.
 *
 * Full-data/CSV export lives under Data & privacy per the guidelines (not the header's Export
 * menu, where it still *also* lives today — moving it out of there, and moving Build PDF to a
 * Documents destination, is the remaining Phase 2 task this screen's existence unblocks, not
 * done in this slice).
 *
 * Restore (#587) and "Check a calculation file" (#582) are two separate actions, deliberately:
 * restoring people and verifying an old chart's calculation are different questions, and restore
 * never trusts a `calculation` field for what it writes. Check only ever reads a file and shows
 * results — it writes nothing, so it has no confirm step the way restore does.
 */
/**
 * @module ui/PreferencesView
 * @purpose Preferences workspace (#506/#510): General/Astrology defaults/Appearance & accessibility/Data & privacy, each reusing the screen's own existing device/account-preference controls rather than duplicating them.
 * @conventions Every control is the same shared component/hook other screens already use (RulershipSetting.tsx, SymbolSetting.tsx, LanguageToggle.tsx, ThemeToggle.tsx) — this screen never reads or writes a setting's storage directly. Full-data export reuses domain/full-export.js's pure functions, the same ones AppNav.tsx's Export menu calls. "Check a calculation file" (#582) reuses validateFullExport for the same format/version errors Restore gives, but reads `calculation` off the raw parsed JSON directly, since the validated FullExport never carries that field.
 * @exports PreferencesView
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { aafToExportedPeople, isAafText, peopleToAaf } from '../domain/aaf-people.js';
import {
  buildFullExport,
  fullExportFilename,
  peopleAafFilename,
  peopleCsvFilename,
  peopleToCsv,
} from '../domain/full-export.js';
import {
  stageFullExportRestore,
  validateFullExport,
  type RestoreItem,
  type RestorePreview,
} from '../domain/full-export-importer.js';
import { checkExportedCalculations, type PersonCalculationCheck } from '../domain/full-export-check.js';
import { APP_VERSION } from '../version.js';
import { PREFERENCES_SECTIONS, routeHref, type PreferencesSection } from './route.js';
import { replaceRoute } from './nav-history.js';
import { Tabs, tabPanelProps } from './primitives/Tabs.js';
import {
  DENSITY_CHOICES,
  isDensityChoice,
  isMotionChoice,
  MOTION_CHOICES,
  useDensity,
  useMotion,
} from './appearance-settings.js';
import { Button } from './primitives/Button.js';
import { FileInput } from './primitives/FileInput.js';
import { Select } from './primitives/Select.js';
import { downloadText } from './download.js';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { LanguageToggle } from './LanguageToggle.js';
import { useMessages } from './messages.js';
import { SortableTable } from './SortableTable.js';
import type { TableColumn } from './table-sort.js';
import { preferencesViewMessages } from './PreferencesView.messages.js';
import { DEFAULT_EXTENDED_SETTINGS } from '../chart/extended-settings.js';
import { readDefaultCalculationProfile } from './default-calculation-profile.js';
import { ExtendedSettingsPanel } from './ExtendedSettingsPanel.js';
import { useExtendedSettings } from './extended-settings-store.js';
import { RulershipSetting } from './RulershipSetting.js';
import { OrbLibraryEditor } from './OrbLibraryEditor.js';
import { useOrbContextSource, useOrbLibrary } from './orb-library-store.js';
import { useRulershipChoice } from './rulership-setting.js';
import { SymbolSetting } from './SymbolSetting.js';
import { useOptionalStore } from './store-context.js';
import { ThemeToggle } from './ThemeToggle.js';
import { useSymbolClass } from './symbol-setting.js';
import { BackLink } from './BackLink.js';

interface ExportStatus {
  readonly kind: 'busy' | 'done' | 'error';
  readonly text: string;
}

/**
 * Puts focus on a tab's heading when a link to that section was followed: on purpose, so a screen reader says where
 * it landed. It does not scroll: the tabs sit just above the heading, and scrolling the heading to the top would
 * hide the page title and the tab strip the reader needs to move on.
 */
function focusSection(section: PreferencesSection): void {
  document.getElementById(`preferences-${section}`)?.focus({ preventScroll: true });
}

export function PreferencesView({
  section,
}: { readonly section?: PreferencesSection | undefined } = {}): React.JSX.Element {
  const t = useMessages(preferencesViewMessages);
  const [motion, setMotion] = useMotion();
  const [density, setDensity] = useDensity();
  const store = useOptionalStore();
  const { provider } = useEphemerisProvider();
  const [rulership] = useRulershipChoice();
  const [extendedSettings, setExtendedSettings] = useExtendedSettings();
  const orbLibrary = useOrbLibrary();
  const orbSources = useOrbContextSource();
  const [symbolClass] = useSymbolClass();
  const [status, setStatus] = useState<ExportStatus | undefined>(undefined);
  const [preview, setPreview] = useState<RestorePreview | undefined>(undefined);
  const [restoring, setRestoring] = useState(false);
  const [checks, setChecks] = useState<readonly PersonCalculationCheck[] | undefined>(undefined);
  // Two near-identical result tables can be on screen at once (restore, then check, or vice versa); each has its
  // own caption, so a reader is not left telling them apart by column header text alone.
  const restoreColumns = useMemo<readonly TableColumn<RestoreItem>[]>(
    () => [
      {
        key: 'name',
        label: t.restoreNameColumn,
        valueOf: (item) => (item.displayName === '' ? t.restoreNoName : item.displayName),
      },
      { key: 'status', label: t.restoreStatusColumn, valueOf: (item) => t.restoreStatusWord[item.status] },
    ],
    [t],
  );
  const checkColumns = useMemo<readonly TableColumn<PersonCalculationCheck>[]>(
    () => [
      {
        key: 'name',
        label: t.restoreNameColumn,
        valueOf: (check) => (check.displayName === '' ? t.restoreNoName : check.displayName),
      },
      { key: 'result', label: t.checkResultColumn, valueOf: (check) => t.checkResult(check.outcome) },
    ],
    [t],
  );

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

  const exportPeopleAaf = (): void => {
    if (store === undefined) {
      setStatus({ kind: 'error', text: t.exportNeedsStore });
      return;
    }
    const { text, skipped } = peopleToAaf([...store.state.people.values()]);
    downloadText(peopleAafFilename(new Date()), text, 'text/plain');
    // AAF needs a date and a place, so a person without them cannot be written; the status says who was left out.
    const done = t.exportDone(t.exportPeopleAafName);
    setStatus({ kind: 'done', text: skipped.length === 0 ? done : `${done} ${t.exportAafSkipped(skipped.length)}` });
  };

  const exportPeopleCsv = (): void => {
    run(t.exportPeopleName, () => {
      if (store === undefined) throw new Error(t.exportNeedsStore);
      const now = new Date();
      downloadText(peopleCsvFilename(now), peopleToCsv([...store.state.people.values()]), 'text/csv');
    });
  };

  // Validate and stage only — nothing is written here. `confirmRestore` below is the one
  // place that calls `store.mutate`, and it does so once, for every person's mutations
  // flattened into a single batch, so the whole restore commits atomically or not at all.
  const onRestoreFileChosen = (file: File | undefined): void => {
    if (file === undefined) return;
    if (store === undefined) {
      setStatus({ kind: 'error', text: t.exportNeedsStore });
      return;
    }
    setPreview(undefined);
    setStatus({ kind: 'busy', text: t.restorePreparing });
    void file
      .text()
      .then((text) => {
        // An AAF file (#591) is staged through the same reviewed restore as a full export.
        if (isAafText(text)) {
          const { people, errors } = aafToExportedPeople(text);
          const staged = stageFullExportRestore({ people }, store.state.people, store.state.deleted.people);
          setPreview(staged);
          const firstError = errors[0];
          setStatus({
            kind: 'done',
            text:
              firstError === undefined
                ? t.restoreReadyToReview
                : `${t.restoreReadyToReview} ${t.restoreAafErrors(errors.length, `line ${String(firstError.line)}: ${firstError.message}`)}`,
          });
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error(t.restoreInvalidJson);
        }
        const result = validateFullExport(parsed);
        if (!result.ok) throw new Error(t.restoreInvalid(result.error));
        const staged = stageFullExportRestore(result.value, store.state.people, store.state.deleted.people);
        setPreview(staged);
        // The counts themselves are shown once, inside the preview panel below (`restoreStaged`)
        // — this status line only has to say there's something to look at, not repeat it.
        setStatus({ kind: 'done', text: t.restoreReadyToReview });
      })
      .catch((error: unknown) => {
        setStatus({ kind: 'error', text: error instanceof Error ? error.message : String(error) });
      });
  };

  const confirmRestore = (): void => {
    if (preview === undefined || store === undefined) return;
    const mutations = preview.items.flatMap((item) => item.mutations);
    if (mutations.length === 0) {
      setPreview(undefined);
      setStatus({ kind: 'done', text: t.restoreNothingToApply });
      return;
    }
    if (!window.confirm(t.restoreConfirm(preview.newCount, preview.updatedCount, preview.deletedLocallyCount))) return;
    setRestoring(true);
    setStatus({ kind: 'busy', text: t.restoreApplying });
    void store
      .mutate(mutations)
      .then(() => {
        setPreview(undefined);
        setStatus({
          kind: 'done',
          text: t.restoreApplied(preview.newCount, preview.updatedCount, preview.deletedLocallyCount),
        });
      })
      .catch((error: unknown) => {
        setStatus({ kind: 'error', text: t.restoreFailed(error instanceof Error ? error.message : String(error)) });
      })
      .finally(() => {
        setRestoring(false);
      });
  };

  // Reads a calculation file and checks it (#582) — never writes anything, so there is no
  // confirm step, unlike restore. Reads `calculation` off the *raw* parsed JSON, not off
  // `validateFullExport`'s own result, which deliberately never carries that field through.
  const onCheckFileChosen = (file: File | undefined): void => {
    if (file === undefined) return;
    if (provider === undefined) {
      setStatus({ kind: 'error', text: t.exportNeedsEngine });
      return;
    }
    setChecks(undefined);
    setStatus({ kind: 'busy', text: t.checkPreparing });
    void file
      .text()
      .then(async (text) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error(t.restoreInvalidJson);
        }
        const result = validateFullExport(parsed);
        if (!result.ok) throw new Error(t.restoreInvalid(result.error));
        const rawPeople =
          typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { people?: unknown }).people)
            ? (parsed as { people: readonly unknown[] }).people
            : [];
        const current = { astrayaVersion: APP_VERSION, swephVersion: await provider.version() };
        const results = await checkExportedCalculations(result.value, rawPeople, provider, current);
        setChecks(results);
        const counts = { verified: 0, changed: 0, inconsistent: 0, 'no-artifact': 0, error: 0 };
        for (const { outcome } of results) counts[outcome.kind] += 1;
        setStatus({
          kind: 'done',
          text: t.checkStaged(
            counts.verified,
            counts.changed,
            counts.inconsistent,
            counts['no-artifact'],
            counts.error,
          ),
        });
      })
      .catch((error: unknown) => {
        setStatus({ kind: 'error', text: t.checkFailed(error instanceof Error ? error.message : String(error)) });
      });
  };

  // Set by a tab switch, so the effect below does not pull focus off the tab the reader is on (#650). A link to a
  // section (the other way the section changes) is followed on purpose and does move focus to the panel heading.
  const switchedByTab = useRef(false);
  useEffect(() => {
    if (switchedByTab.current) {
      switchedByTab.current = false;
      return;
    }
    if (section !== undefined) focusSection(section);
  }, [section]);

  const tabItems = PREFERENCES_SECTIONS.map((key) => ({ key, label: t.tabLabels[key] }));
  // A tab switch is a view of one page, not a page (it adds no history entry); a link to a section opens its tab.
  const active: PreferencesSection = section ?? PREFERENCES_SECTIONS[0];
  const selectTab = (next: PreferencesSection): void => {
    switchedByTab.current = true;
    replaceRoute(routeHref({ kind: 'preferences', section: next }));
  };

  return (
    <main className="shell">
      <BackLink fallback="#/people" />
      <h1>{t.heading}</h1>
      <p>{t.intro}</p>

      <Tabs idBase="preferences" label={t.tablistLabel} items={tabItems} active={active} onSelect={selectTab} />

      <div {...tabPanelProps('preferences', active)} className="preferences-panel">
        <h2 id={`preferences-${active}`} tabIndex={-1}>
          {t.tabLabels[active]}
        </h2>
        <p className="hint preferences-scope">{t.scope[active]}</p>

        {active === 'appearance' && (
          <>
            <p>{t.languageLabel}</p>
            <LanguageToggle />

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
          </>
        )}

        {active === 'astrology' && (
          <>
            <p>{t.rulersSubtitle}</p>
            <RulershipSetting />

            <OrbLibraryEditor profiles={orbLibrary.profiles} sources={orbSources} />

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
          </>
        )}

        {active === 'data' && (
          <>
            <p>{t.exportEverythingHint}</p>
            <p>
              <button
                type="button"
                disabled={store === undefined}
                aria-label={store === undefined ? `${t.exportEverything} — ${t.exportNeedsStore}` : undefined}
                onClick={exportEverything}
              >
                {t.exportEverything}
              </button>{' '}
              <button
                type="button"
                disabled={store === undefined}
                aria-label={store === undefined ? `${t.exportPeopleCsv} — ${t.exportNeedsStore}` : undefined}
                onClick={exportPeopleCsv}
              >
                {t.exportPeopleCsv}
              </button>{' '}
              <button
                type="button"
                disabled={store === undefined}
                aria-label={store === undefined ? `${t.exportPeopleAaf} — ${t.exportNeedsStore}` : undefined}
                onClick={exportPeopleAaf}
              >
                {t.exportPeopleAaf}
              </button>
            </p>
            <p>{t.restoreHint}</p>
            <p>
              <FileInput
                buttonLabel={t.restoreFromFile}
                accept="application/json,.json,.aaf,text/plain"
                disabled={store === undefined}
                disabledReason={t.exportNeedsStore}
                onChange={onRestoreFileChosen}
              />
            </p>
            {preview !== undefined && (
              <div>
                <p>
                  {t.restoreStaged(
                    preview.newCount,
                    preview.updatedCount,
                    preview.unchangedCount,
                    preview.deletedLocallyCount,
                  )}
                </p>
                <SortableTable
                  wrap
                  caption={t.restorePreviewHeading}
                  columns={restoreColumns}
                  rows={preview.items}
                  getRowKey={(item) => item.id}
                />
                <p>
                  <Button variant="primary" busy={restoring} busyLabel={t.restoreApplying} onClick={confirmRestore}>
                    {t.restoreApply}
                  </Button>
                </p>
              </div>
            )}
            <p>{t.checkHint}</p>
            <p>
              <FileInput
                buttonLabel={t.checkFromFile}
                accept="application/json"
                disabled={provider === undefined}
                disabledReason={t.exportNeedsEngine}
                onChange={onCheckFileChosen}
              />
            </p>
            {checks !== undefined && (
              <SortableTable
                wrap
                caption={t.checkResultsHeading}
                columns={checkColumns}
                rows={checks}
                getRowKey={(check) => check.id}
              />
            )}
            {status !== undefined && (
              <p
                className={`status preferences-export-status ${status.kind}`}
                role={status.kind === 'error' ? 'alert' : 'status'}
              >
                {status.text}
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
