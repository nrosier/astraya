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
import { NumberField } from './primitives/NumberField.js';
import { StagedDialog } from './primitives/StagedDialog.js';
import { formatDecimal } from './format.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ASPECTS, DEFAULT_ORB_CONFIG } from '../astrology/aspects.js';
import { ayanamsaByKey, AYANAMSAS } from '../astrology/ayanamsas.js';
import { HOUSE_SYSTEMS } from '../astrology/houses.js';
import {
  CALCULATION_SCHEME_IDS,
  CALCULATION_SCHEMES,
  matchCalculationScheme,
  type CalculationSchemeId,
} from '../astrology/calculation-scheme.js';
import {
  CITED_ORB_PRESET_IDS,
  ORB_PROFILE_IDS,
  ORB_PROFILES,
  citedPresetSettings,
  isCitedOrbPresetId,
  matchCitedOrbPreset,
  matchOrbProfile,
  type OrbProfileId,
} from '../astrology/orb-profiles.js';
import { DEFAULT_RULERSHIP_CHOICE, type RulershipChoice } from '../astrology/rulership.js';
import { aspectDisplayName, bodyDisplayName } from './astro-names.messages.js';
import {
  applyCalculationProfile,
  withoutOrbRules,
  CALCULATION_PROFILE_IDS,
  CALCULATION_PROFILES,
  matchCalculationProfile,
  type CalculationProfileId,
} from '../chart/calculation-profiles.js';
import { DEFAULT_EXTENDED_SETTINGS, type ExtendedSettings } from '../chart/extended-settings.js';
import {
  isInterpreted,
  matchObjectPolicyPreset,
  OBJECT_POLICY_PRESET_IDS,
  PRESET_OBJECT_POLICIES,
  type ObjectKey,
  type ObjectPolicy,
  withInterpreted,
} from '../chart/object-policy.js';
import { useDefaultCalculationProfile } from './default-calculation-profile.js';
import { extendedSettingsPanelMessages } from './ExtendedSettingsPanel.messages.js';
import { changedSettings, sameSettings } from './extended-settings-summary.js';
import { orbRulesDraftFrom, orbRulesFromDraft, withOrbRules, type OrbRulesDraft } from './orb-rules-draft.js';
import { OrbRulesFields } from './OrbRulesFields.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { Button } from './primitives/Button.js';
import { StatusMessage } from './primitives/StatusMessage.js';
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

const PLANET_KEYS: readonly ObjectKey[] = [
  'sun',
  'moon',
  'mercury',
  'venus',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
  'pluto',
];
const ASTEROID_KEYS: readonly ObjectKey[] = ['ceres', 'pallas', 'juno', 'vesta'];
const POINT_KEYS: readonly ObjectKey[] = ['vertex', 'partOfFortune', 'partOfSpirit'];

function lilithPointKey(variant: ExtendedSettings['lilithVariant']): ObjectKey {
  return variant === 'true' ? 'osculatingLilith' : variant === 'interpolated' ? 'interpolatedLilith' : 'meanLilith';
}

function nodePointKey(variant: ExtendedSettings['nodeVariant']): ObjectKey {
  return variant === 'true' ? 'trueNode' : 'meanNode';
}

const HOUSE_SYSTEM_CODES = HOUSE_SYSTEMS.map((system) => system.code);
const AYANAMSA_IDS = AYANAMSAS.map((ayanamsa) => ayanamsa.id);

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
  }, [ids, fetchName]);

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
  // The practitioner's own orb rules (#590) are typed as strings and only become settings when every entry parses,
  // so a half-typed number never reaches the chart. `draft.orbRules` is not read; `effective` below is the draft.
  const [rulesText, setRulesText] = useState<OrbRulesDraft>(() => orbRulesDraftFrom(value.orbRules));
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
    HOUSE_SYSTEM_CODES,
    useCallback((code: string) => provider.houseSystemName(code), [provider]),
  );
  const ayanamsaNames = useNameLookup(
    AYANAMSA_IDS,
    useCallback((id: number) => provider.ayanamsaName(id), [provider]),
  );

  const patch = (partial: Partial<ExtendedSettings>): void => {
    setDraft((current) => ({ ...current, ...partial }));
  };

  /** Puts a whole settings value (and its orb rules) into the draft, the one way every reset and quick-pick does. */
  const replaceDraft = (next: ExtendedSettings): void => {
    setDraft(next);
    setRulesText(orbRulesDraftFrom(next.orbRules));
  };

  /** One object's whole policy, replaced atomically — never a hybrid of two partial patches racing each other. */
  const setObjectPolicy = (key: ObjectKey, next: Partial<ObjectPolicy>): void => {
    patch({ objectPolicies: { ...draft.objectPolicies, [key]: { ...draft.objectPolicies[key], ...next } } });
  };

  /** Whether the report reads this object (#721). */
  const setInterpreted = (key: ObjectKey, interpreted: boolean): void => {
    patch({
      objectPolicies: { ...draft.objectPolicies, [key]: withInterpreted(draft.objectPolicies[key], interpreted) },
    });
  };

  /** Group-level "All"/"Clear" (#585), matching `TransitFilterPanel.tsx`'s own established pattern for a long checkbox group. */
  const setGroupPolicy = (keys: readonly ObjectKey[], policy: ObjectPolicy): void => {
    const updates: Partial<Record<ObjectKey, ObjectPolicy>> = {};
    // "All" reads every object again; "Clear" only hides and unlinks, leaving what the report reads as it was (#721).
    for (const key of keys)
      updates[key] = withInterpreted(policy, policy.visible ? true : isInterpreted(draft.objectPolicies[key]));
    patch({ objectPolicies: { ...draft.objectPolicies, ...updates } });
  };

  /** Named object-visibility preset (#585) — applies a complete `ObjectPolicies` snapshot, the same atomic-replace pattern `chooseProfile` uses for a calculation profile. */
  const choosePreset = (id: string): void => {
    if (!(OBJECT_POLICY_PRESET_IDS as readonly string[]).includes(id)) return;
    patch({ objectPolicies: PRESET_OBJECT_POLICIES[id as (typeof OBJECT_POLICY_PRESET_IDS)[number]] });
  };

  /** One object's row: its name once, then its three independent checkboxes — visible, takes aspects, and read in the report (#721). */
  const objectRow = (key: ObjectKey, label: string): React.JSX.Element => {
    const policy: ObjectPolicy = draft.objectPolicies[key];
    return (
      <div className="settings-card-object-row" key={key}>
        <span className="settings-card-object-name">{label}</span>
        <Checkbox
          label={t.objectVisibleLabel(label)}
          checked={policy.visible}
          onChange={(value) => {
            setObjectPolicy(key, { visible: value });
          }}
        />
        <Checkbox
          label={t.objectParticipatesLabel(label)}
          checked={policy.aspectParticipant}
          onChange={(value) => {
            setObjectPolicy(key, { aspectParticipant: value });
          }}
        />
        <Checkbox
          label={t.objectInterpretedLabel(label)}
          checked={isInterpreted(policy)}
          onChange={(value) => {
            setInterpreted(key, value);
          }}
        />
      </div>
    );
  };

  /** A group of object rows with the long-list "Select all"/"Clear" convention (`docs/UI-UX_GUIDELINES.md`'s decision matrix). */
  const objectGroup = (
    legend: string,
    keys: readonly ObjectKey[],
    labelFor: (key: ObjectKey) => string,
  ): React.JSX.Element => (
    <fieldset className="field-group settings-card-indent">
      <legend>{legend}</legend>
      <div className="transit-filter-group-actions">
        <Button
          size="compact"
          onClick={() => {
            setGroupPolicy(keys, { visible: true, aspectParticipant: true });
          }}
        >
          {t.groupAll}
        </Button>
        <Button
          size="compact"
          onClick={() => {
            setGroupPolicy(keys, { visible: false, aspectParticipant: false });
          }}
        >
          {t.groupClear}
        </Button>
      </div>
      {keys.map((key) => objectRow(key, labelFor(key)))}
    </fieldset>
  );

  const setMinorAspect = (key: string, enabled: boolean): void => {
    patch({
      enabledMinorAspects: enabled
        ? [...draft.enabledMinorAspects, key]
        : draft.enabledMinorAspects.filter((enabledKey) => enabledKey !== key),
    });
  };

  const openCard = (): void => {
    replaceDraft(value);
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
    replaceDraft(value);
    setPendingRulers(undefined);
    setAtOpen(undefined);
  };

  // A changed value from outside resets the draft while the card is closed; leaving the page is StagedDialog's job.
  useEffect(() => {
    if (!open) replaceDraft(value);
  }, [value, open]);

  const parsedRules = orbRulesFromDraft(rulesText);
  const rulesValid = parsedRules !== undefined;
  // What Apply and Save as my default would use: the draft with its typed orb rules turned into real ones.
  const effective = withOrbRules(draft, parsedRules);
  const effectiveRulers = pendingRulers ?? rulers;
  const currentProfile = matchCalculationProfile(effective, effectiveRulers);
  const currentObjectPreset = matchObjectPolicyPreset(draft.objectPolicies);
  const currentOrbProfile = effective.orbRules === undefined ? matchOrbProfile(draft.orbScalePercent) : undefined;
  const currentCitedPreset = matchCitedOrbPreset(draft.orbScalePercent, effective.orbRules);
  const currentScheme =
    currentOrbProfile === undefined ? undefined : matchCalculationScheme(draft.boundsScheme, currentOrbProfile);
  const deviceChanged =
    atOpen !== undefined &&
    (rulers !== atOpen.rulers ||
      symbolClass !== atOpen.symbolClass ||
      look.weight !== atOpen.look.weight ||
      VARIANT_BODIES.some((body) => look[body] !== atOpen.look[body]));
  const dirty = !sameSettings(effective, value) || pendingRulers !== undefined || deviceChanged;

  const apply = (): void => {
    if (pendingRulers !== undefined) setRulers(pendingRulers);
    onRedraw(effective);
    setOpen(false);
    setPendingRulers(undefined);
    setAtOpen(undefined);
  };

  /** "Save as my default" (#510): remembers the draft and rulers for every future chart on this device — never redraws the chart currently open, which stays Apply's job alone. */
  const saveAsDefault = (): void => {
    if (pendingRulers !== undefined) setRulers(pendingRulers);
    setDefaultCalculationProfile(effective, effectiveRulers);
    closeCard(true);
  };

  /** Both resets name their target (#510): the draft and the rulers go back to that one profile, not to a mix. */
  const resetTo = (settings: ExtendedSettings, rulership: RulershipChoice): void => {
    replaceDraft(settings);
    setPendingRulers(rulership === rulers ? undefined : rulership);
  };

  const chooseProfile = (id: string): void => {
    if (!(CALCULATION_PROFILE_IDS as readonly string[]).includes(id)) return;
    const profileId = id as CalculationProfileId;
    replaceDraft(applyCalculationProfile(effective, profileId));
    const profileRulers = CALCULATION_PROFILES[profileId].rulership;
    setPendingRulers(profileRulers === rulers ? undefined : profileRulers);
  };

  /** Named orb-scale quick-pick (#543) — only ever touches `orbScalePercent`, never any other field, unlike `chooseProfile`. */
  const chooseOrbProfile = (id: string): void => {
    if (isCitedOrbPresetId(id)) {
      // A cited preset is its moieties at scale 0 and replaces any rules of the card's own (#590).
      const preset = citedPresetSettings(id);
      replaceDraft(
        withOrbRules(
          { ...effective, orbScalePercent: preset.scalePercent },
          { aspectOrbs: {}, bodyOrbs: preset.bodyOrbs },
        ),
      );
      return;
    }
    if (!(ORB_PROFILE_IDS as readonly string[]).includes(id)) return;
    const profileId = id as OrbProfileId;
    replaceDraft({ ...withoutOrbRules(effective), orbScalePercent: ORB_PROFILES[profileId].config.scalePercent });
  };

  /** Named traditional scheme quick-pick (#549) — sets bounds table and orb scale together, the one coherent unit a scheme bundle actually is. */
  const chooseScheme = (id: string): void => {
    if (!(CALCULATION_SCHEME_IDS as readonly string[]).includes(id)) return;
    const schemeId = id as CalculationSchemeId;
    const scheme = CALCULATION_SCHEMES[schemeId];
    replaceDraft({
      ...withoutOrbRules(effective),
      boundsScheme: scheme.boundsScheme,
      orbScalePercent: ORB_PROFILES[scheme.orbProfileId].config.scalePercent,
    });
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
      case 'orbRules':
        return t.summary.orbRules;
      case 'boundsScheme':
        return t.summary.boundsScheme(value.boundsScheme);
      case 'minorAspects':
        return t.summary.minorAspects(String(value.enabledMinorAspects.length));
      case 'objectPolicies':
        return t.summary.objectPolicies;
      case 'midpoints':
        return t.summary.midpoints;
      case 'lilith':
        return t.summary.lilith(modelName(value.lilithVariant));
      case 'node':
        return t.summary.node(modelName(value.nodeVariant));
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
              disabled={!dirty || !rulesValid}
              aria-label={dirty ? t.applyButton : `${t.applyButton} — ${t.nothingChanged}`}
              onClick={apply}
            >
              {t.applyButton}
            </button>
            <button
              type="button"
              className="quiet"
              disabled={!dirty || !rulesValid}
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
            label={t.midpoints}
            checked={draft.midpointsVisible}
            onChange={(value) => {
              patch({ midpointsVisible: value });
            }}
          />

          {/* Object visibility/aspect-participation (#585): one unified policy, replacing what
              used to be eleven separate fields. Three presets apply a complete policy at once,
              matching how a calculation profile below applies a complete snapshot. */}
          <div className="settings-card-block">
            <OptionCards
              label={t.objectPresetLabel}
              value={currentObjectPreset ?? 'custom'}
              options={[
                ...(currentObjectPreset === undefined
                  ? [{ value: 'custom', title: t.objectPresetOptions.custom, consequence: t.objectPresetNotes.custom }]
                  : []),
                ...OBJECT_POLICY_PRESET_IDS.map((id) => ({
                  value: id,
                  title: t.objectPresetOptions[id],
                  consequence: t.objectPresetNotes[id],
                })),
              ]}
              onChange={choosePreset}
            />
          </div>
          <p className="hint" role="status">
            {t.objectVisibleCount(
              String(Object.values(draft.objectPolicies).filter((policy) => policy.visible).length),
              String(Object.keys(draft.objectPolicies).length),
            )}
          </p>

          {objectGroup(t.planetsGroupLabel, PLANET_KEYS, (key) => bodyDisplayName(key, locale))}

          <div className="settings-card-indent">{objectRow('chiron', t.chiron)}</div>
          {objectGroup(t.minorPlanetsLegend, ASTEROID_KEYS, (key) => bodyDisplayName(key, locale))}

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
            {objectRow(lilithPointKey(draft.lilithVariant), t.lilithObjectName)}
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
            {objectRow(nodePointKey(draft.nodeVariant), t.lunarNodesObjectName)}
          </div>

          {objectGroup(t.pointsGroupLabel, POINT_KEYS, (key) =>
            key === 'vertex' ? t.vertex : key === 'partOfFortune' ? t.partOfFortune : t.spirit,
          )}
          <p className="hint">{t.aspectsToHint}</p>
          <Checkbox
            label={t.antiscia}
            checked={draft.antisciaVisible}
            onChange={(value) => {
              patch({ antisciaVisible: value });
            }}
          />
          <div className="settings-card-indent">
            <NumberField
              label={t.antisciaMaxOrbLabel}
              value={String(draft.antisciaMaxOrb)}
              min={0}
              max={10}
              step={0.5}
              decreaseLabel={t.antisciaMaxOrbDecreaseLabel}
              increaseLabel={t.antisciaMaxOrbIncreaseLabel}
              onChange={(value) => {
                const parsed = Number(value);
                if (value !== '' && Number.isFinite(parsed) && parsed >= 0) patch({ antisciaMaxOrb: parsed });
              }}
            />
          </div>
          <p className="hint settings-card-indent">{t.antisciaHint}</p>
          <Checkbox
            label={t.declination}
            checked={draft.declinationVisible}
            onChange={(value) => {
              patch({ declinationVisible: value });
            }}
          />
          <div className="settings-card-indent">
            <NumberField
              label={t.declinationMaxOrbLabel}
              value={String(draft.declinationMaxOrb)}
              min={0}
              max={10}
              step={0.5}
              decreaseLabel={t.declinationMaxOrbDecreaseLabel}
              increaseLabel={t.declinationMaxOrbIncreaseLabel}
              onChange={(value) => {
                const parsed = Number(value);
                if (value !== '' && Number.isFinite(parsed) && parsed >= 0) patch({ declinationMaxOrb: parsed });
              }}
            />
          </div>
          <p className="hint settings-card-indent">{t.declinationHint}</p>
          <Checkbox
            label={t.dial90}
            checked={draft.dial90Visible}
            onChange={(value) => {
              patch({ dial90Visible: value });
            }}
          />
          <div className="settings-card-indent">
            <NumberField
              label={t.midpointTreeOrbLabel}
              value={String(draft.midpointTreeOrb)}
              min={0}
              max={10}
              step={0.5}
              decreaseLabel={t.midpointTreeOrbDecreaseLabel}
              increaseLabel={t.midpointTreeOrbIncreaseLabel}
              onChange={(value) => {
                const parsed = Number(value);
                if (value !== '' && Number.isFinite(parsed) && parsed >= 0) patch({ midpointTreeOrb: parsed });
              }}
            />
          </div>
          <p className="hint settings-card-indent">{t.dial90Hint}</p>
        </fieldset>

        <fieldset className="field-group settings-card-group">
          <legend>{t.schemeLegend}</legend>
          <p className="hint settings-card-tag">{t.appliesOnApply}</p>
          <p className="hint">{t.schemeHint}</p>
          <OptionCards
            label={t.schemeLabel}
            value={currentScheme ?? 'custom'}
            options={[
              ...(currentScheme === undefined
                ? [{ value: 'custom', title: t.schemeOptions.custom, consequence: t.schemeNotes.custom }]
                : []),
              ...CALCULATION_SCHEME_IDS.map((id) => ({
                value: id,
                title: CALCULATION_SCHEMES[id].name,
                consequence: CALCULATION_SCHEMES[id].description,
              })),
            ]}
            onChange={chooseScheme}
          />
        </fieldset>

        <fieldset className="field-group settings-card-group">
          <legend>{t.aspectsLegend}</legend>
          <p className="hint settings-card-tag">{t.appliesOnApply}</p>
          <OptionCards
            label={t.orbProfileLabel}
            value={currentCitedPreset ?? currentOrbProfile ?? 'custom'}
            options={[
              ...(currentOrbProfile === undefined && currentCitedPreset === undefined
                ? [{ value: 'custom', title: t.orbProfileOptions.custom, consequence: t.orbProfileNotes.custom }]
                : []),
              ...ORB_PROFILE_IDS.map((id) => ({
                value: id,
                title: t.orbProfileOptions[id],
                consequence: t.orbProfileNotes[id],
              })),
              ...CITED_ORB_PRESET_IDS.map((id) => ({
                value: id,
                title: t.citedOrbPresetOptions[id],
                consequence: t.citedOrbPresetNotes[id],
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
          {effective.orbRules === undefined && (
            <p className="hint" aria-live="polite">
              {t.orbPreview(
                orb(DEFAULT_ORB_CONFIG.majorOrb.base),
                orb(DEFAULT_ORB_CONFIG.majorOrb.base + DEFAULT_ORB_CONFIG.majorOrb.luminaryBonus),
                orb(DEFAULT_ORB_CONFIG.sextileOrb.base),
                orb(DEFAULT_ORB_CONFIG.sextileOrb.base + DEFAULT_ORB_CONFIG.sextileOrb.luminaryBonus),
                orb(DEFAULT_ORB_CONFIG.minorOrb),
              )}
            </p>
          )}
          <OrbRulesFields draft={rulesText} onChange={setRulesText} />
          {!rulesValid && <StatusMessage kind="error">{t.orbRulesInvalid}</StatusMessage>}
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
