/**
 * The chart's "Extended settings" (#52, #442): house system, zodiac and ayanamsa, which points are shown and
 * which take aspects, the orbs and minor aspects, the wheel colours, and (as device preferences) the planetary
 * rulers and the symbols.
 *
 * Shown as a button that summarises what differs from the defaults and opens a modal card. Three kinds of setting
 * live in it, and the card says which is which: the calculation and display settings are edited in a local draft
 * (every one needs a real recompute, so nothing is committed per keystroke) and applied together with "Apply and
 * redraw", or thrown away with Cancel, Escape or a click outside; the planetary rulers and the symbols are device
 * preferences, saved and applied at once, outside the draft.
 *
 * The groups follow how a chart is set up: the frame (zodiac, then houses), what is drawn on it, then its aspects.
 * A starting point (a preset) fills the profile settings of a tradition in one go and shows "Custom" when the draft
 * matches none. The dialog is the browser's own modal `<dialog>`, which gives the focus trap, Escape, the backdrop
 * and the return of focus to the trigger; `dialog.showModal` is missing in some test DOMs, hence the fallback.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { ASPECTS, DEFAULT_ORB_CONFIG } from '../astrology/aspects.js';
import { ayanamsaByKey, AYANAMSAS } from '../astrology/ayanamsas.js';
import { HOUSE_SYSTEMS } from '../astrology/houses.js';
import type { RulershipChoice } from '../astrology/rulership.js';
import { aspectDisplayName } from './astro-names.messages.js';
import { DEFAULT_EXTENDED_SETTINGS, type ExtendedSettings } from '../chart/extended-settings.js';
import { applyPreset, matchPreset, PRESET_KEYS, PRESETS, type PresetKey } from '../chart/extended-settings-presets.js';
import { extendedSettingsPanelMessages } from './ExtendedSettingsPanel.messages.js';
import { changedSettings, sameSettings } from './extended-settings-summary.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { RulershipSetting } from './RulershipSetting.js';
import { useRulershipChoice } from './rulership-setting.js';
import { SymbolSetting } from './SymbolSetting.js';
import type { EphemerisProvider } from '../ephemeris/types.js';

const MINOR_ASPECTS = ASPECTS.filter((aspect) => aspect.family === 'minor');

const LAHIRI_AYANAMSA_ID = ayanamsaByKey('lahiri')?.id ?? AYANAMSAS[0]?.id ?? 1;

/** Fetches every house-system/ayanamsa display name once, falling back to the machine key while pending. */
function useNameLookup<T extends number | string>(
  ids: readonly T[],
  fetchName: ((id: T) => Promise<string>) | undefined,
): ReadonlyMap<T, string> {
  const [names, setNames] = useState<ReadonlyMap<T, string>>(new Map());

  useEffect(() => {
    if (fetchName === undefined) return undefined;
    const effect = { cancelled: false };
    void Promise.all(ids.map((id) => fetchName(id).then((name): readonly [T, string] => [id, name])))
      .then((entries) => {
        if (!effect.cancelled) setNames(new Map(entries));
      })
      // Names are cosmetic labels; the machine key already shown is a fine fallback on failure.
      .catch(() => undefined);
    return () => {
      effect.cancelled = true;
    };
    // `ids`/`fetchName` are treated as stable for the lifetime of one provider instance.
  }, [fetchName === undefined]);

  return names;
}

export function ExtendedSettingsPanel({
  value,
  onRedraw,
  provider,
}: {
  readonly value: ExtendedSettings;
  readonly onRedraw: (next: ExtendedSettings) => void;
  readonly provider: EphemerisProvider;
}): React.JSX.Element {
  const [draft, setDraft] = useState<ExtendedSettings>(value);
  // A starting point can also set the planetary rulers, which are a device preference; they are written only on Apply.
  const [pendingRulers, setPendingRulers] = useState<RulershipChoice | undefined>(undefined);
  // Symbols are also a device preference (localStorage), but we track if they changed to enable the Apply button.
  const [symbolsChanged, setSymbolsChanged] = useState(false);
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  const t = useMessages(extendedSettingsPanelMessages);
  const [locale] = useLocale();
  const [rulers, setRulers] = useRulershipChoice();

  const houseSystemNames = useNameLookup(
    HOUSE_SYSTEMS.map((system) => system.code),
    (code) => provider.houseSystemName(code),
  );
  const ayanamsaNames = useNameLookup(
    AYANAMSAS.map((ayanamsa) => ayanamsa.id),
    (id) => provider.ayanamsaName(id),
  );

  const patch = (partial: Partial<ExtendedSettings>): void => {
    setDraft((current) => ({ ...current, ...partial }));
  };

  const setMinorAspect = (key: string, enabled: boolean): void => {
    patch({
      enabledMinorAspects: enabled
        ? [...draft.enabledMinorAspects, key]
        : draft.enabledMinorAspects.filter((enabledKey) => enabledKey !== key),
    });
  };

  const openCard = (): void => {
    setDraft(value);
    setPendingRulers(undefined);
    setSymbolsChanged(false);
    setOpen(true);
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  };

  /** Closes the card; the browser returns focus to the trigger. Whatever was not applied is dropped. */
  const closeCard = (): void => {
    const dialog = dialogRef.current;
    if (dialog !== null) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
    setOpen(false);
    setDraft(value);
    setPendingRulers(undefined);
    setSymbolsChanged(false);
    triggerRef.current?.focus();
  };

  // Leaving the page closes the card (the same rule the menus follow), and a changed value from outside resets the draft.
  useEffect(() => {
    const onHashChange = (): void => {
      if (open) closeCard();
    };
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
    };
  });
  useEffect(() => {
    if (!open) setDraft(value);
  }, [value, open]);

  const effectiveRulers = pendingRulers ?? rulers;
  const currentPreset = matchPreset(draft, effectiveRulers);
  const dirty = !sameSettings(draft, value) || pendingRulers !== undefined || symbolsChanged;

  const apply = (): void => {
    if (pendingRulers !== undefined) setRulers(pendingRulers);
    onRedraw(draft);
    const dialog = dialogRef.current;
    if (dialog !== null) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
    setOpen(false);
    setPendingRulers(undefined);
    triggerRef.current?.focus();
  };

  const choosePreset = (key: string): void => {
    if (!(PRESET_KEYS as readonly string[]).includes(key)) return;
    const preset = key as PresetKey;
    setDraft((current) => applyPreset(current, preset));
    setPendingRulers(PRESETS[preset].rulership === rulers ? undefined : PRESETS[preset].rulership);
  };

  const ayanamsaId = draft.zodiac.kind === 'sidereal' ? draft.zodiac.ayanamsa : undefined;

  const houseName = (code: string): string =>
    houseSystemNames.get(code) ?? HOUSE_SYSTEMS.find((system) => system.code === code)?.key ?? code;
  const ayanamsaName = (id: number): string =>
    ayanamsaNames.get(id) ?? AYANAMSAS.find((ayanamsa) => ayanamsa.id === id)?.key ?? String(id);

  // What the trigger says: only what differs from the defaults, by name.
  const changes = changedSettings(value);
  const percent = value.orbScalePercent > 0 ? `+${String(value.orbScalePercent)}` : String(value.orbScalePercent);
  const modelName = (model: string): string =>
    model === 'mean' ? t.mean : model === 'true' ? t.true : model === 'interpolated' ? t.interpolated : model;
  const segments = changes.map((change): string => {
    switch (change) {
      case 'houseSystem':
        return houseName(value.houseSystem);
      case 'zodiac':
        return value.zodiac.kind === 'sidereal'
          ? t.summary.sidereal(ayanamsaName(value.zodiac.ayanamsa))
          : t.summary.tropical;
      case 'orbScale':
        return t.summary.orbs(percent);
      case 'minorAspects':
        return t.summary.minorAspects(String(value.enabledMinorAspects.length));
      case 'fortune':
        return t.summary.fortune;
      case 'vertex':
        return t.summary.vertex;
      case 'chiron':
        return t.summary.chironHidden;
      case 'midpoints':
        return t.summary.midpoints;
      case 'lilith':
        return t.summary.lilith(modelName(value.lilithVariant));
      case 'node':
        return t.summary.node(modelName(value.nodeVariant));
      case 'aspectsTo':
        return t.summary.aspectsTo;
      case 'rainbow':
        return t.summary.rainbow;
    }
  });
  const triggerDetail = segments.length === 0 ? '' : `: ${segments.join(' · ')}`;
  const triggerLabel = `${t.heading}${triggerDetail}`;

  // The orbs now in force, so the slider's percentage is not the only thing said about them.
  const factor = 1 + draft.orbScalePercent / 100;
  const number = new Intl.NumberFormat(locale === 'nl' ? 'nl-NL' : 'en-GB', { maximumFractionDigits: 1 });
  const orb = (degrees: number): string => number.format(degrees * factor);

  return (
    <div className="extended-settings">
      <button
        type="button"
        ref={triggerRef}
        className="extended-settings-trigger"
        aria-haspopup="dialog"
        aria-label={triggerLabel}
        title={triggerLabel}
        onClick={openCard}
      >
        <span className="extended-settings-trigger-name">{t.heading}</span>
        {segments.length > 0 && (
          <>
            <span className="extended-settings-trigger-detail">{segments.join(' · ')}</span>
            <span className="extended-settings-trigger-count">{t.triggerChanged(String(segments.length))}</span>
          </>
        )}
      </button>

      <dialog
        ref={dialogRef}
        className="settings-card"
        aria-labelledby={headingId}
        onCancel={(event) => {
          // Escape: the browser would close it silently; closing it ourselves also drops the draft.
          event.preventDefault();
          closeCard();
        }}
        onClick={(event) => {
          // A press on the backdrop is a press on the dialog element itself.
          if (event.target === dialogRef.current) closeCard();
        }}
      >
        <div className="settings-card-header">
          <h2 id={headingId}>{t.heading}</h2>
          <button type="button" className="quiet" aria-label={t.closeLabel} onClick={closeCard}>
            ×
          </button>
        </div>

        <div className="settings-card-body">
          <p className="hint">{t.scopeNote}</p>

          <p className="rulership-setting">
            <label>
              {t.presetLabel}{' '}
              <select
                value={currentPreset ?? 'custom'}
                onChange={(event) => {
                  choosePreset(event.target.value);
                }}
              >
                <option value="custom" disabled={currentPreset !== undefined}>
                  {t.presetOptions.custom}
                </option>
                {PRESET_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {t.presetOptions[key]}
                  </option>
                ))}
              </select>
            </label>
            <span className="hint rulership-setting-hint">
              {' '}
              {t.presetNotes[currentPreset ?? 'custom']}
              {currentPreset !== undefined && PRESETS[currentPreset].rulership !== rulers
                ? ` ${t.presetRulership(t.rulershipNames[PRESETS[currentPreset].rulership])}`
                : ''}
            </span>
          </p>

          <fieldset className="field-group settings-card-group">
            <legend>{t.zodiacHousesLegend}</legend>
            <p className="hint settings-card-tag">{t.appliesOnApply}</p>
            <div role="radiogroup" aria-label={t.zodiacLegend}>
              <label>
                <input
                  type="radio"
                  name="extended-settings-zodiac"
                  checked={draft.zodiac.kind === 'tropical'}
                  onChange={() => {
                    patch({ zodiac: { kind: 'tropical' } });
                  }}
                />{' '}
                {t.tropical}
              </label>{' '}
              <label>
                <input
                  type="radio"
                  name="extended-settings-zodiac"
                  checked={draft.zodiac.kind === 'sidereal'}
                  onChange={() => {
                    patch({ zodiac: { kind: 'sidereal', ayanamsa: LAHIRI_AYANAMSA_ID } });
                  }}
                />{' '}
                {t.sidereal}
              </label>
            </div>
            {draft.zodiac.kind === 'sidereal' && (
              <label>
                {t.ayanamsaLabel}
                <select
                  aria-label={t.ayanamsaLabel}
                  value={ayanamsaId}
                  onChange={(event) => {
                    patch({ zodiac: { kind: 'sidereal', ayanamsa: Number(event.target.value) } });
                  }}
                >
                  {AYANAMSAS.map((ayanamsa) => (
                    <option key={ayanamsa.id} value={ayanamsa.id}>
                      {ayanamsaNames.get(ayanamsa.id) ?? ayanamsa.key}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="field-grid">
              <label>
                {t.systemLabel}
                <select
                  aria-label={t.houseSystemLegend}
                  value={draft.houseSystem}
                  onChange={(event) => {
                    patch({ houseSystem: event.target.value });
                  }}
                >
                  {HOUSE_SYSTEMS.map((system) => (
                    <option key={system.code} value={system.code}>
                      {houseSystemNames.get(system.code) ?? system.key}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>

          <fieldset className="field-group settings-card-group">
            <legend>{t.bodiesLegend}</legend>
            <p className="hint settings-card-tag">{t.appliesOnApply}</p>
            <label>
              <input
                type="checkbox"
                checked={draft.fortuneVisible}
                onChange={(event) => {
                  patch({ fortuneVisible: event.target.checked });
                }}
              />{' '}
              {t.partOfFortune}
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft.vertexVisible}
                onChange={(event) => {
                  patch({ vertexVisible: event.target.checked });
                }}
              />{' '}
              {t.vertex}
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft.midpointsVisible}
                onChange={(event) => {
                  patch({ midpointsVisible: event.target.checked });
                }}
              />{' '}
              {t.midpoints}
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft.chironVisible}
                onChange={(event) => {
                  patch({ chironVisible: event.target.checked });
                }}
              />{' '}
              {t.chiron}
            </label>
            <label className="settings-card-indent">
              <input
                type="checkbox"
                checked={draft.aspectsToChiron}
                onChange={(event) => {
                  patch({ aspectsToChiron: event.target.checked });
                }}
              />{' '}
              {t.aspectsToChiron}
            </label>
            <div role="radiogroup" aria-label={t.lilithModelAriaLabel}>
              {t.lilithLabel}{' '}
              <label>
                <input
                  type="radio"
                  name="extended-settings-lilith"
                  checked={draft.lilithVariant === 'mean'}
                  onChange={() => {
                    patch({ lilithVariant: 'mean' });
                  }}
                />{' '}
                {t.mean}
              </label>{' '}
              <label>
                <input
                  type="radio"
                  name="extended-settings-lilith"
                  checked={draft.lilithVariant === 'true'}
                  onChange={() => {
                    patch({ lilithVariant: 'true' });
                  }}
                />{' '}
                {t.true}
              </label>{' '}
              <label>
                <input
                  type="radio"
                  name="extended-settings-lilith"
                  checked={draft.lilithVariant === 'interpolated'}
                  onChange={() => {
                    patch({ lilithVariant: 'interpolated' });
                  }}
                />{' '}
                {t.interpolated}
              </label>
            </div>
            <p className="hint settings-card-indent">{t.lilithHelp}</p>
            <label className="settings-card-indent">
              <input
                type="checkbox"
                checked={draft.aspectsToLilith}
                onChange={(event) => {
                  patch({ aspectsToLilith: event.target.checked });
                }}
              />{' '}
              {t.aspectsToLilith}
            </label>
            <div role="radiogroup" aria-label={t.lunarNodeModelAriaLabel}>
              {t.lunarNodesLabel}{' '}
              <label>
                <input
                  type="radio"
                  name="extended-settings-node"
                  checked={draft.nodeVariant === 'mean'}
                  onChange={() => {
                    patch({ nodeVariant: 'mean' });
                  }}
                />{' '}
                {t.mean}
              </label>{' '}
              <label>
                <input
                  type="radio"
                  name="extended-settings-node"
                  checked={draft.nodeVariant === 'true'}
                  onChange={() => {
                    patch({ nodeVariant: 'true' });
                  }}
                />{' '}
                {t.true}
              </label>
            </div>
            <p className="hint settings-card-indent">{t.nodeHelp}</p>
            <label className="settings-card-indent">
              <input
                type="checkbox"
                checked={draft.aspectsToLunarNodes}
                onChange={(event) => {
                  patch({ aspectsToLunarNodes: event.target.checked });
                }}
              />{' '}
              {t.aspectsToLunarNodes}
            </label>
            <p className="hint">{t.aspectsToHint}</p>
          </fieldset>

          <fieldset className="field-group settings-card-group">
            <legend>{t.aspectsLegend}</legend>
            <p className="hint settings-card-tag">{t.appliesOnApply}</p>
            <label>
              {t.scaleLabel}
              {draft.orbScalePercent > 0 ? '+' : ''}
              {draft.orbScalePercent}%
              <input
                type="range"
                aria-label={t.orbScaleAriaLabel}
                min={-90}
                max={90}
                step={10}
                value={draft.orbScalePercent}
                onChange={(event) => {
                  patch({ orbScalePercent: Number(event.target.value) });
                }}
              />
            </label>
            <p className="hint" aria-live="polite">
              {t.orbPreview(
                orb(DEFAULT_ORB_CONFIG.majorOrb.base),
                orb(DEFAULT_ORB_CONFIG.majorOrb.base + DEFAULT_ORB_CONFIG.majorOrb.luminaryBonus),
                orb(DEFAULT_ORB_CONFIG.sextileOrb.base),
                orb(DEFAULT_ORB_CONFIG.sextileOrb.base + DEFAULT_ORB_CONFIG.sextileOrb.luminaryBonus),
                orb(DEFAULT_ORB_CONFIG.minorOrb),
              )}
            </p>
            <p>{t.minorAspectsLegend}</p>
            {MINOR_ASPECTS.map((aspect) => (
              <label key={aspect.key}>
                <input
                  type="checkbox"
                  checked={draft.enabledMinorAspects.includes(aspect.key)}
                  onChange={(event) => {
                    setMinorAspect(aspect.key, event.target.checked);
                  }}
                />{' '}
                {aspect.angle}° {aspectDisplayName(aspect.key, locale)}
              </label>
            ))}
          </fieldset>

          <fieldset className="field-group settings-card-group">
            <legend>{t.wheelLegend}</legend>
            <p className="hint settings-card-tag">{t.appliesOnApply}</p>
            <label>
              <input
                type="checkbox"
                checked={draft.rainbowZodiac}
                onChange={(event) => {
                  patch({ rainbowZodiac: event.target.checked });
                }}
              />{' '}
              {t.rainbowColorZodiac}
            </label>
          </fieldset>

          <fieldset className="field-group settings-card-group">
            <legend>{t.deviceLegend}</legend>
            <p className="hint settings-card-tag">{t.savedOnDevice}</p>
            <RulershipSetting />
            <SymbolSetting
              onChanged={() => {
                setSymbolsChanged(true);
              }}
            />
          </fieldset>
        </div>

        <div className="settings-card-footer">
          <button
            type="button"
            className="quiet"
            disabled={!dirty}
            aria-label={dirty ? t.applyButton : `${t.applyButton} — ${t.nothingChanged}`}
            onClick={apply}
          >
            {t.applyButton}
          </button>
          <button type="button" className="quiet" onClick={closeCard}>
            {t.cancelButton}
          </button>
          <button
            type="button"
            className="quiet"
            onClick={() => {
              setDraft(DEFAULT_EXTENDED_SETTINGS);
            }}
          >
            {t.resetToDefaultsButton}
          </button>
        </div>
      </dialog>
    </div>
  );
}
