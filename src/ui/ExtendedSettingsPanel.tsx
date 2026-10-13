/**
 * The chart's "Extended settings" (#52, #442): house system, zodiac and ayanamsa, which points are shown and
 * which take aspects, the orbs and minor aspects, the wheel colours, and (as device preferences) the planetary
 * rulers and the symbols.
 *
 * Shown as a button that summarises what differs from the defaults and opens a modal card. Three kinds of setting
 * live in it, and the card says which is which: the calculation and display settings are edited in a local draft
 * (every one needs a real recompute, so nothing is committed per keystroke) and applied together with "Apply and
 * redraw", or thrown away with Cancel, Escape or a click outside; the planetary rulers and the symbols are device
 * preferences, previewed live (the chart behind the card shows them) and put back by Cancel, kept by Apply or Save as my default.
 *
 * The groups follow how a chart is set up: the frame (zodiac, then houses), what is drawn on it, then its aspects.
 * A starting point (a preset) fills the profile settings of a tradition in one go and shows "Custom" when the draft
 * matches none. The dialog is the browser's own modal `<dialog>`, which gives the focus trap, Escape, the backdrop
 * and the return of focus to the trigger; `dialog.showModal` is missing in some test DOMs, hence the fallback.
 */
/**
 * @module ExtendedSettingsPanel
 * @purpose Renders the chart's "Extended settings" modal: house system, zodiac/ayanamsa, visible points/aspects, orb scale, minor aspects, wheel colours, plus the planetary-rulership and symbol device preferences.
 * @conventions Calculation/display settings are edited in a local draft and only committed via "Apply and redraw" (every change needs a real recompute); planetary rulers and symbols are device preferences previewed live and put back by Cancel, kept by Apply or Save as my default. A preset (`extended-settings-presets.js`) can fill the whole profile in one go. Text comes from co-located `ExtendedSettingsPanel.messages.ts` via `useMessages()`.
 * @exports ExtendedSettingsPanel
 */
import { Checkbox } from './primitives/Checkbox.js';
import { StagedDialog } from './primitives/StagedDialog.js';
import { formatDecimal } from './format.js';
import { useEffect, useRef, useState } from 'react';
import { ASPECTS, DEFAULT_ORB_CONFIG } from '../astrology/aspects.js';
import { ayanamsaByKey, AYANAMSAS } from '../astrology/ayanamsas.js';
import { HOUSE_SYSTEMS } from '../astrology/houses.js';
import { ORB_PROFILE_IDS, ORB_PROFILES, matchOrbProfile, type OrbProfileId } from '../astrology/orb-profiles.js';
import { DEFAULT_RULERSHIP_CHOICE, type RulershipChoice } from '../astrology/rulership.js';
import { aspectDisplayName } from './astro-names.messages.js';
import {
  applyCalculationProfile,
  CALCULATION_PROFILE_IDS,
  CALCULATION_PROFILES,
  matchCalculationProfile,
  type CalculationProfileId,
} from '../chart/calculation-profiles.js';
import { DEFAULT_EXTENDED_SETTINGS, type ExtendedSettings } from '../chart/extended-settings.js';
import { useDefaultCalculationProfile } from './default-calculation-profile.js';
import { extendedSettingsPanelMessages } from './ExtendedSettingsPanel.messages.js';
import { changedSettings, sameSettings } from './extended-settings-summary.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { ChoiceGroup } from './primitives/ChoiceGroup.js';
import { OptionCards } from './primitives/OptionCards.js';
import { Select } from './primitives/Select.js';
import { RulershipSetting } from './RulershipSetting.js';
import { useRulershipChoice } from './rulership-setting.js';
import { SymbolSetting } from './SymbolSetting.js';
import { useGlyphVariants, type GlyphLook } from './glyph-variant-setting.js';
import { useSymbolClass } from './symbol-setting.js';
import { VARIANT_BODIES } from '../chart/glyph-variants.js';
import type { SymbolClass } from '../chart/symbol-class.js';
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

/** The device preferences the card can change live, as they were when it opened. */
interface DeviceSnapshot {
  readonly rulers: RulershipChoice;
  readonly symbolClass: SymbolClass;
  readonly look: GlyphLook;
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
  // The device preferences edited in the card (rulers, symbols) take effect as they are changed, so the chart
  // behind it previews them; what they were when the card opened is kept so Cancel can put them back.
  const [atOpen, setAtOpen] = useState<DeviceSnapshot | undefined>(undefined);
  const [open, setOpen] = useState(false);
  // Capture the current rulership choice for reactive description updates
  const [rulershipChoice] = useRulershipChoice();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const t = useMessages(extendedSettingsPanelMessages);
  const [locale] = useLocale();
  const [rulers, setRulers] = useRulershipChoice();
  const [savedDefault, setDefaultCalculationProfile] = useDefaultCalculationProfile();
  const [symbolClass, setSymbolClass] = useSymbolClass();
  const [look, setVariant, setWeight] = useGlyphVariants();

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
    setAtOpen({ rulers, symbolClass, look });
    setOpen(true);
  };

  /**
   * Closes the card; the browser returns focus to the trigger. Whatever was not applied is dropped — including the
   * device preferences previewed in it (#510), unless `keepDevice` says they were saved.
   */
  const closeCard = (keepDevice = false): void => {
    if (!keepDevice && atOpen !== undefined) {
      setRulers(atOpen.rulers);
      setSymbolClass(atOpen.symbolClass);
      setWeight(atOpen.look.weight);
      for (const body of VARIANT_BODIES) setVariant(body, atOpen.look[body]);
    }
    setOpen(false);
    setDraft(value);
    setPendingRulers(undefined);
    setAtOpen(undefined);
  };

  // A changed value from outside resets the draft while the card is closed; leaving the page is StagedDialog's job.
  useEffect(() => {
    if (!open) setDraft(value);
  }, [value, open]);

  const effectiveRulers = pendingRulers ?? rulers;
  const currentProfile = matchCalculationProfile(draft, effectiveRulers);
  const currentOrbProfile = matchOrbProfile(draft.orbScalePercent);
  const deviceChanged =
    atOpen !== undefined &&
    (rulers !== atOpen.rulers ||
      symbolClass !== atOpen.symbolClass ||
      look.weight !== atOpen.look.weight ||
      VARIANT_BODIES.some((body) => look[body] !== atOpen.look[body]));
  const dirty = !sameSettings(draft, value) || pendingRulers !== undefined || deviceChanged;

  const apply = (): void => {
    if (pendingRulers !== undefined) setRulers(pendingRulers);
    onRedraw(draft);
    setOpen(false);
    setPendingRulers(undefined);
    setAtOpen(undefined);
  };

  /** "Save as my default" (#510): remembers the draft and rulers for every future chart on this device — never redraws the chart currently open, which stays Apply's job alone. */
  const saveAsDefault = (): void => {
    if (pendingRulers !== undefined) setRulers(pendingRulers);
    setDefaultCalculationProfile(draft, effectiveRulers);
    closeCard(true);
  };

  /** Both resets name their target (#510): the draft and the rulers go back to that one profile, not to a mix. */
  const resetTo = (settings: ExtendedSettings, rulership: RulershipChoice): void => {
    setDraft(settings);
    setPendingRulers(rulership === rulers ? undefined : rulership);
  };

  const chooseProfile = (id: string): void => {
    if (!(CALCULATION_PROFILE_IDS as readonly string[]).includes(id)) return;
    const profileId = id as CalculationProfileId;
    setDraft((current) => applyCalculationProfile(current, profileId));
    const profileRulers = CALCULATION_PROFILES[profileId].rulership;
    setPendingRulers(profileRulers === rulers ? undefined : profileRulers);
  };

  /** Named orb-scale quick-pick (#543) — only ever touches `orbScalePercent`, never any other field, unlike `chooseProfile`. */
  const chooseOrbProfile = (id: string): void => {
    if (!(ORB_PROFILE_IDS as readonly string[]).includes(id)) return;
    const profileId = id as OrbProfileId;
    patch({ orbScalePercent: ORB_PROFILES[profileId].config.scalePercent });
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
      case 'spirit':
        return t.summary.spirit;
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
  const orb = (degrees: number): string => formatDecimal(degrees * factor, 1, locale);

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

      <StagedDialog
        open={open}
        heading={t.heading}
        closeLabel={t.closeLabel}
        onDiscard={() => {
          closeCard();
        }}
        returnFocusTo={triggerRef}
        footer={
          <>
            <button
              type="button"
              className="quiet"
              disabled={!dirty}
              aria-label={dirty ? t.applyButton : `${t.applyButton} — ${t.nothingChanged}`}
              onClick={apply}
            >
              {t.applyButton}
            </button>
            <button
              type="button"
              className="quiet"
              disabled={!dirty}
              aria-label={dirty ? t.saveAsDefaultButton : `${t.saveAsDefaultButton} — ${t.nothingChanged}`}
              title={t.saveAsDefaultHint}
              onClick={saveAsDefault}
            >
              {t.saveAsDefaultButton}
            </button>
            <button
              type="button"
              className="quiet"
              onClick={() => {
                closeCard();
              }}
            >
              {t.cancelButton}
            </button>
            {savedDefault !== undefined && (
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  resetTo(savedDefault.settings, savedDefault.rulership);
                }}
              >
                {t.resetToMyDefaultButton}
              </button>
            )}
            <button
              type="button"
              className="quiet"
              onClick={() => {
                resetTo(DEFAULT_EXTENDED_SETTINGS, DEFAULT_RULERSHIP_CHOICE);
              }}
            >
              {t.resetToAstrayaDefaultButton}
            </button>
          </>
        }
      >
        <p className="hint">{t.scopeNote}</p>

        <fieldset className="field-group settings-card-group">
          <legend>{t.presetLabel}</legend>
          <p className="hint settings-card-tag">{t.appliesOnApply}</p>
          <OptionCards
            label={t.presetLabel}
            value={currentProfile ?? 'custom'}
            options={[
              ...(currentProfile === undefined
                ? [{ value: 'custom', title: t.presetOptions.custom, consequence: t.presetNotes.custom }]
                : []),
              ...CALCULATION_PROFILE_IDS.map((id) => ({
                value: id,
                title: t.presetOptions[id],
                consequence: t.presetNotes[id],
              })),
            ]}
            onChange={chooseProfile}
          />
          {currentProfile !== undefined && CALCULATION_PROFILES[currentProfile].rulership !== rulers && (
            <p className="hint">
              {t.presetRulership(t.rulershipNames[CALCULATION_PROFILES[currentProfile].rulership])}
            </p>
          )}
        </fieldset>

        <fieldset className="field-group settings-card-group">
          <legend>{t.zodiacHousesLegend}</legend>
          <p className="hint settings-card-tag">{t.appliesOnApply}</p>
          <p className="hint">{t.zodiacFrameSubtitle}</p>

          {/* Zodiac */}
          <div className="settings-card-block">
            <ChoiceGroup
              label={t.zodiacLegend}
              value={draft.zodiac.kind}
              options={[
                { value: 'tropical', label: t.tropical },
                { value: 'sidereal', label: t.sidereal },
              ]}
              onChange={(value) => {
                patch({
                  zodiac:
                    value === 'sidereal' ? { kind: 'sidereal', ayanamsa: LAHIRI_AYANAMSA_ID } : { kind: 'tropical' },
                });
              }}
            />
            <p className="settings-card-note">
              {draft.zodiac.kind === 'tropical' ? t.tropicalDescription : t.siderealDescription}
            </p>
          </div>

          {draft.zodiac.kind === 'sidereal' && (
            <div className="settings-card-indent settings-card-block">
              <Select
                label={t.ayanamsaLabel}
                value={String(ayanamsaId)}
                options={AYANAMSAS.map((ayanamsa) => ({
                  value: String(ayanamsa.id),
                  label: ayanamsaNames.get(ayanamsa.id) ?? ayanamsa.key,
                }))}
                onChange={(value) => {
                  patch({ zodiac: { kind: 'sidereal', ayanamsa: Number(value) } });
                }}
              />
            </div>
          )}

          {/* House System */}
          <div>
            <Select
              label={t.houseSystemLegend}
              value={draft.houseSystem}
              options={HOUSE_SYSTEMS.map((system) => ({
                value: system.code,
                label: houseSystemNames.get(system.code) ?? system.key,
              }))}
              onChange={(value) => {
                patch({ houseSystem: value });
              }}
            />
            <p className="settings-card-note">{t.houseSystemDescription(draft.houseSystem)}</p>
          </div>
        </fieldset>

        <fieldset className="field-group settings-card-group">
          <legend>{t.bodiesLegend}</legend>
          <p className="hint settings-card-tag">{t.appliesOnApply}</p>
          <Checkbox
            label={t.partOfFortune}
            checked={draft.fortuneVisible}
            onChange={(value) => {
              patch({ fortuneVisible: value });
            }}
          />
          <Checkbox
            label={t.vertex}
            checked={draft.vertexVisible}
            onChange={(value) => {
              patch({ vertexVisible: value });
            }}
          />
          <Checkbox
            label={t.spirit}
            checked={draft.spiritVisible}
            onChange={(value) => {
              patch({ spiritVisible: value });
            }}
          />
          <Checkbox
            label={t.midpoints}
            checked={draft.midpointsVisible}
            onChange={(value) => {
              patch({ midpointsVisible: value });
            }}
          />
          <Checkbox
            label={t.chiron}
            checked={draft.chironVisible}
            onChange={(value) => {
              patch({ chironVisible: value });
            }}
          />
          <div className="settings-card-indent">
            <Checkbox
              label={t.aspectsToChiron}
              checked={draft.aspectsToChiron}
              onChange={(value) => {
                patch({ aspectsToChiron: value });
              }}
            />
          </div>
          <div className="settings-card-indent">
            {t.lilithLabel}{' '}
            <ChoiceGroup
              label={t.lilithModelAriaLabel}
              value={draft.lilithVariant}
              options={[
                { value: 'mean', label: t.mean },
                { value: 'true', label: t.true },
                { value: 'interpolated', label: t.interpolated },
              ]}
              onChange={(value) => {
                if (value === 'mean' || value === 'true' || value === 'interpolated') patch({ lilithVariant: value });
              }}
            />
          </div>
          <p className="hint settings-card-indent">{t.lilithHelp}</p>
          <div className="settings-card-indent">
            <Checkbox
              label={t.aspectsToLilith}
              checked={draft.aspectsToLilith}
              onChange={(value) => {
                patch({ aspectsToLilith: value });
              }}
            />
          </div>
          <div className="settings-card-indent">
            {t.lunarNodesLabel}{' '}
            <ChoiceGroup
              label={t.lunarNodeModelAriaLabel}
              value={draft.nodeVariant}
              options={[
                { value: 'mean', label: t.mean },
                { value: 'true', label: t.true },
              ]}
              onChange={(value) => {
                if (value === 'mean' || value === 'true') patch({ nodeVariant: value });
              }}
            />
          </div>
          <p className="hint settings-card-indent">{t.nodeHelp}</p>
          <div className="settings-card-indent">
            <Checkbox
              label={t.aspectsToLunarNodes}
              checked={draft.aspectsToLunarNodes}
              onChange={(value) => {
                patch({ aspectsToLunarNodes: value });
              }}
            />
          </div>
          <div className="settings-card-indent">
            <Checkbox
              label={t.aspectsToVertex}
              checked={draft.aspectsToVertex}
              onChange={(value) => {
                patch({ aspectsToVertex: value });
              }}
            />
          </div>
          <div className="settings-card-indent">
            <Checkbox
              label={t.aspectsToPartOfFortune}
              checked={draft.aspectsToPartOfFortune}
              onChange={(value) => {
                patch({ aspectsToPartOfFortune: value });
              }}
            />
          </div>
          <div className="settings-card-indent">
            <Checkbox
              label={t.aspectsToPartOfSpirit}
              checked={draft.aspectsToPartOfSpirit}
              onChange={(value) => {
                patch({ aspectsToPartOfSpirit: value });
              }}
            />
          </div>
          <p className="hint">{t.aspectsToHint}</p>
        </fieldset>

        <fieldset className="field-group settings-card-group">
          <legend>{t.aspectsLegend}</legend>
          <p className="hint settings-card-tag">{t.appliesOnApply}</p>
          <OptionCards
            label={t.orbProfileLabel}
            value={currentOrbProfile ?? 'custom'}
            options={[
              ...(currentOrbProfile === undefined
                ? [{ value: 'custom', title: t.orbProfileOptions.custom, consequence: t.orbProfileNotes.custom }]
                : []),
              ...ORB_PROFILE_IDS.map((id) => ({
                value: id,
                title: t.orbProfileOptions[id],
                consequence: t.orbProfileNotes[id],
              })),
            ]}
            onChange={chooseOrbProfile}
          />
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
            <Checkbox
              key={aspect.key}
              label={`${String(aspect.angle)}° ${aspectDisplayName(aspect.key, locale)}`}
              checked={draft.enabledMinorAspects.includes(aspect.key)}
              onChange={(value) => {
                setMinorAspect(aspect.key, value);
              }}
            />
          ))}
        </fieldset>

        <fieldset className="field-group settings-card-group">
          <legend>{t.wheelLegend}</legend>
          <p className="hint settings-card-tag">{t.appliesOnApply}</p>
          <Checkbox
            label={t.rainbowColorZodiac}
            checked={draft.rainbowZodiac}
            onChange={(value) => {
              patch({ rainbowZodiac: value });
            }}
          />
        </fieldset>

        <fieldset className="field-group settings-card-group">
          <legend>{t.rulersLegend}</legend>
          <p className="hint settings-card-tag">{t.devicePreview}</p>
          <p className="hint">{t.rulersSubtitle}</p>
          <RulershipSetting />
          <p className="settings-card-note">
            {/* Display reactive description based on rulers choice */}
            {rulershipChoice === 'modern' && t.modernRulersDescription}
            {rulershipChoice === 'traditional' && t.traditionalRulersDescription}
            {rulershipChoice === 'both' && t.coRulersDescription}
          </p>
        </fieldset>

        <fieldset className="field-group settings-card-group">
          <legend>{t.symbolsFrameSubtitle}</legend>
          <p className="hint settings-card-tag">{t.devicePreview}</p>
          <SymbolSetting />
        </fieldset>
      </StagedDialog>
    </div>
  );
}
