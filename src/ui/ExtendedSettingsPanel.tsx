/**
 * The chart's "Extended settings" (#52, #442): house system, zodiac and ayanamsa, which points are shown and
 * which take aspects, the orbs and minor aspects, the wheel colours, the planetary rulers and (as a device
 * preference) the symbols.
 *
 * Shown as a button that summarises what differs from the defaults and opens a right-anchored slide-over drawer
 * (#824, `StagedDialog` with `placement="right"`, 42rem at most, full width on a phone). Three kinds of setting
 * live in it, and the drawer says which is which: the calculation and display settings, the planetary rulers and
 * the custom formula points are edited in a local draft (every one needs a real recompute, so nothing is committed
 * per keystroke) and applied together with "Apply and redraw", or thrown away with Cancel, Escape or a click
 * outside (#806: the rulers and formula points belong to the person, like the other calculation settings); the
 * symbols are device preferences, previewed live (the chart behind the drawer shows them) and put back by Cancel,
 * kept by Apply or Save as my default.
 *
 * The categories are tabs on a wide screen and a labelled select below 40rem (`docs/ui/UI-UX_GUIDELINES.md` §2):
 * Profile and frame, Bodies and orbs, Display and glyphs, Special points. Long astrological explanations sit behind
 * a Disclosure, not inline. A starting point (a preset) fills the profile settings of a tradition in one go and
 * shows "Custom" when the draft matches none.
 */
/**
 * @module ExtendedSettingsPanel
 * @purpose Renders the chart's "Extended settings" drawer: four tabbed categories (profile and frame, bodies and orbs, display and glyphs, special points), the object visibility matrix, the custom formula points, the planetary rulers and the symbol device preference, with a pinned Apply/Cancel footer.
 * @conventions Calculation/display settings, rulers and formula points are edited in a local draft and only committed via "Apply and redraw" (every change needs a real recompute); the symbols are a device preference previewed live and put back by Cancel. The drawer is `StagedDialog placement="right"`. Tabs use the shared `Tabs` primitive, with a labelled Select below 40rem. Text comes from co-located `ExtendedSettingsPanel.messages.ts` via `useMessages()`.
 * @exports ExtendedSettingsPanel
 */
import { Checkbox } from './primitives/Checkbox.js';
import { NumberField } from './primitives/NumberField.js';
import { StagedDialog } from './primitives/StagedDialog.js';
import { tabPanelProps, Tabs } from './primitives/Tabs.js';
import { Disclosure } from './primitives/Disclosure.js';
import { formatDecimal } from './format.js';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
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
import { isStationWindowK, STATION_WINDOW_DEFAULT_K } from '../astrology/planetary-condition.js';
import { aspectDisplayName, bodyDisplayName } from './astro-names.messages.js';
import {
  applyCalculationProfile,
  withoutOrbRules,
  CALCULATION_PROFILE_IDS,
  CALCULATION_PROFILES,
  matchCalculationProfile,
  type CalculationProfileId,
} from '../chart/calculation-profiles.js';
import {
  DEFAULT_EXTENDED_SETTINGS,
  withMotionScore,
  withoutStationWindow,
  type ExtendedSettings,
} from '../chart/extended-settings.js';
import {
  isInterpreted,
  matchObjectPolicyPreset,
  OBJECT_POLICY_PRESET_IDS,
  PRESET_OBJECT_POLICIES,
  type ObjectKey,
  type ObjectPolicy,
  withInterpreted,
} from '../chart/object-policy.js';
import type { CustomPointDefinition } from '../domain/person.js';
import type { FormulaProblem } from './custom-point-problem.js';
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
import { TextField } from './primitives/TextField.js';
import { SortableTable } from './SortableTable.js';
import type { TableColumn } from './table-sort.js';
import { RulershipSetting } from './RulershipSetting.js';
import { writeRulershipChoice } from './rulership-setting.js';
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

const NO_POINTS: readonly CustomPointDefinition[] = [];

/** The four drawer categories, in the order a chart is set up (#824). */
const CATEGORIES = ['profile', 'bodies', 'display', 'special'] as const;
type Category = (typeof CATEGORIES)[number];

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
  readonly symbolClass: SymbolClass;
  readonly look: GlyphLook;
}

/** One row of the visibility matrix (#824). */
interface MatrixRow {
  readonly key: ObjectKey;
  readonly label: string;
}

/** A formula point as the drawer holds it: saved, new, or marked for removal, until Apply commits the list. */
interface FormulaDraftRow {
  readonly key: string;
  readonly id: string;
  readonly name: string;
  readonly formula: string;
  readonly enabled: boolean;
  /** True for a point saved on the person and not yet removed in the draft. */
  readonly saved: boolean;
  /** True for a point the drawer added and Apply has yet to save. */
  readonly added: boolean;
  /** True for a saved point marked for removal in the draft; Apply deletes it. */
  readonly removed: boolean;
}

export function ExtendedSettingsPanel({
  value,
  rulership,
  onRedraw,
  provider,
  customPoints = NO_POINTS,
  onCustomPointsChange,
  checkFormula,
}: {
  readonly value: ExtendedSettings;
  /** The planetary rulers the drawer opens with (#806): the person's own, or the device default when editing that. */
  readonly rulership: RulershipChoice;
  /** Receives the settings and the rulers together. May return a promise (a person's settings are saved asynchronously): a rejection keeps the drawer open and says so. */
  readonly onRedraw: (next: ExtendedSettings, rulers: RulershipChoice) => void | Promise<void>;
  readonly provider: EphemerisProvider;
  /** The person's saved custom formula points (#566, #824). Edited in the drawer's draft and committed by Apply. */
  readonly customPoints?: readonly CustomPointDefinition[] | undefined;
  /** Receives the whole point list on Apply, once it is saved as one atomic register. Omitted: the drawer shows no formula section. */
  readonly onCustomPointsChange?: ((next: readonly CustomPointDefinition[]) => Promise<void>) | undefined;
  /** Checks one formula against the chart's own identifiers (#824); undefined when it is usable. */
  readonly checkFormula?: ((formula: string) => FormulaProblem | undefined) | undefined;
}): React.JSX.Element {
  const [draft, setDraft] = useState<ExtendedSettings>(value);
  // The practitioner's own orb rules (#590) are typed as strings and only become settings when every entry parses,
  // so a half-typed number never reaches the chart. `draft.orbRules` is not read; `effective` below is the draft.
  const [rulesText, setRulesText] = useState<OrbRulesDraft>(() => orbRulesDraftFrom(value.orbRules));
  // The planetary rulers are edited in the draft with everything else and written only on Apply (#806).
  const [rulers, setRulers] = useState<RulershipChoice>(rulership);
  // The formula points are staged in the draft too: a pending add or remove is saved only by Apply (#824, D-824b).
  const [formulaRows, setFormulaRows] = useState<readonly FormulaDraftRow[]>(() => formulaRowsFrom(customPoints));
  const [pointName, setPointName] = useState('');
  const [pointFormula, setPointFormula] = useState('');
  const [pointShown, setPointShown] = useState(true);
  const [pointError, setPointError] = useState<string | undefined>();
  // The device preferences edited in the drawer (symbols) take effect as they are changed, so the chart
  // behind it previews them; what they were when the drawer opened is kept so Cancel can put them back.
  const [atOpen, setAtOpen] = useState<DeviceSnapshot | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>('profile');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const t = useMessages(extendedSettingsPanelMessages);
  const [locale] = useLocale();
  const [savedDefault, setDefaultCalculationProfile] = useDefaultCalculationProfile();
  const [symbolClass, setSymbolClass] = useSymbolClass();
  const [look, setVariant, setWeight] = useGlyphVariants();
  const tabsId = useId();

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

  /** The visibility matrix's rows (#824), in the order the card lists them: planets, minor planets, Chiron, Lilith, the nodes, the points. */
  const matrixRows: readonly MatrixRow[] = [
    ...PLANET_KEYS.map((key) => ({ key, label: bodyDisplayName(key, locale) })),
    ...ASTEROID_KEYS.map((key) => ({ key, label: bodyDisplayName(key, locale) })),
    { key: 'chiron' as const, label: t.chiron },
    { key: lilithPointKey(draft.lilithVariant), label: t.lilithObjectName },
    { key: nodePointKey(draft.nodeVariant), label: t.lunarNodesObjectName },
    ...POINT_KEYS.map((key) => ({
      key,
      label: key === 'vertex' ? t.vertex : key === 'partOfFortune' ? t.partOfFortune : t.spirit,
    })),
  ];

  /** The matrix's three columns as inline checkboxes, so a whole column can be read or set in one pass (#824). */
  const matrixColumns: readonly TableColumn<MatrixRow>[] = [
    { key: 'object', label: t.matrixObjectColumn, valueOf: (row) => row.label, sortable: false },
    {
      key: 'visible',
      label: t.matrixVisibleColumn,
      align: 'center',
      sortable: false,
      valueOf: (row) => draft.objectPolicies[row.key].visible,
      renderCell: (row) => (
        <Checkbox
          hideLabel
          label={t.objectVisibleLabel(row.label)}
          checked={draft.objectPolicies[row.key].visible}
          onChange={(value) => {
            setObjectPolicy(row.key, { visible: value });
          }}
        />
      ),
    },
    {
      key: 'aspects',
      label: t.matrixAspectsColumn,
      align: 'center',
      sortable: false,
      valueOf: (row) => draft.objectPolicies[row.key].aspectParticipant,
      renderCell: (row) => (
        <Checkbox
          hideLabel
          label={t.objectParticipatesLabel(row.label)}
          checked={draft.objectPolicies[row.key].aspectParticipant}
          onChange={(value) => {
            setObjectPolicy(row.key, { aspectParticipant: value });
          }}
        />
      ),
    },
    {
      key: 'reports',
      label: t.matrixReportsColumn,
      labelTooltip: t.matrixReportsHelp,
      align: 'center',
      sortable: false,
      valueOf: (row) => isInterpreted(draft.objectPolicies[row.key]),
      renderCell: (row) => (
        <Checkbox
          hideLabel
          label={t.objectInterpretedLabel(row.label)}
          checked={isInterpreted(draft.objectPolicies[row.key])}
          onChange={(value) => {
            setInterpreted(row.key, value);
          }}
        />
      ),
    },
  ];

  /** One group's All / Clear (the long-list convention, `docs/ui/UI-UX_GUIDELINES.md`), kept beside the matrix rather than inside it. */
  const groupActions = (legend: string, keys: readonly ObjectKey[]): React.JSX.Element => (
    <div className="settings-card-matrix-actions" role="group" aria-label={legend}>
      <span>{legend}</span>
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
    setRulers(rulership);
    setFormulaRows(formulaRowsFrom(customPoints));
    setPointError(undefined);
    setAtOpen({ symbolClass, look });
    setOpen(true);
  };

  /**
   * Closes the drawer; the browser returns focus to the trigger. Whatever was not applied is dropped — including the
   * device preferences previewed in it (#510), unless `keepDevice` says they were saved.
   */
  const closeCard = (keepDevice = false): void => {
    if (!keepDevice && atOpen !== undefined) {
      setSymbolClass(atOpen.symbolClass);
      setWeight(atOpen.look.weight);
      for (const body of VARIANT_BODIES) setVariant(body, atOpen.look[body]);
    }
    setOpen(false);
    setApplyFailed(false);
    replaceDraft(value);
    setRulers(rulership);
    setFormulaRows(formulaRowsFrom(customPoints));
    setPointError(undefined);
    setAtOpen(undefined);
  };

  // A changed value from outside resets the draft while the drawer is closed; leaving the page is StagedDialog's job.
  useEffect(() => {
    if (!open) {
      replaceDraft(value);
      setRulers(rulership);
      setFormulaRows(formulaRowsFrom(customPoints));
    }
  }, [value, rulership, customPoints, open]);

  const parsedRules = orbRulesFromDraft(rulesText);
  const rulesValid = parsedRules !== undefined;
  // What Apply and Save as my default would use: the draft with its typed orb rules turned into real ones.
  const effective = withOrbRules(draft, parsedRules);
  const currentProfile = matchCalculationProfile(effective, rulers);
  const currentObjectPreset = matchObjectPolicyPreset(draft.objectPolicies);
  const currentOrbProfile = effective.orbRules === undefined ? matchOrbProfile(draft.orbScalePercent) : undefined;
  const currentCitedPreset = matchCitedOrbPreset(draft.orbScalePercent, effective.orbRules);
  const currentScheme =
    currentOrbProfile === undefined ? undefined : matchCalculationScheme(draft.boundsScheme, currentOrbProfile);
  const deviceChanged =
    atOpen !== undefined &&
    (symbolClass !== atOpen.symbolClass ||
      look.weight !== atOpen.look.weight ||
      VARIANT_BODIES.some((body) => look[body] !== atOpen.look[body]));
  const formulasChanged = !sameFormulas(formulaRows, customPoints);
  const dirty = !sameSettings(effective, value) || rulers !== rulership || deviceChanged || formulasChanged;

  const [applyFailed, setApplyFailed] = useState(false);
  const apply = (): void => {
    setApplyFailed(false);
    const finish = (): void => {
      setOpen(false);
      setAtOpen(undefined);
    };
    const outcome = onRedraw(effective, rulers);
    // The formula points are saved with the settings: they are a person's register like the rest.
    const pointsSave =
      formulasChanged && onCustomPointsChange !== undefined
        ? onCustomPointsChange(stagedPoints(formulaRows))
        : undefined;
    // A synchronous redraw closes the drawer at once; an asynchronous save closes it only once it is written.
    if (outcome === undefined && pointsSave === undefined) {
      finish();
      return;
    }
    void Promise.all([outcome, pointsSave]).then(finish, () => {
      setApplyFailed(true);
    });
  };

  /** "Save as my default" (#510): remembers the draft and rulers as this device's default for new people (#806) — never redraws the chart currently open and writes nothing on the person, which stay Apply's job alone. */
  const saveAsDefault = (): void => {
    writeRulershipChoice(rulers);
    setDefaultCalculationProfile(effective, rulers);
    closeCard(true);
  };

  /** Both resets name their target (#510): the draft and the rulers go back to that one profile, not to a mix. */
  const resetTo = (settings: ExtendedSettings, targetRulership: RulershipChoice): void => {
    replaceDraft(settings);
    setRulers(targetRulership);
  };

  const chooseProfile = (id: string): void => {
    if (!(CALCULATION_PROFILE_IDS as readonly string[]).includes(id)) return;
    const profileId = id as CalculationProfileId;
    replaceDraft(applyCalculationProfile(effective, profileId));
    setRulers(CALCULATION_PROFILES[profileId].rulership);
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

  /** Stages a new formula point in the draft (#824, D-824b); nothing is saved until Apply. */
  const addFormulaPoint = (): void => {
    const name = pointName.trim();
    const formula = pointFormula.trim();
    if (name === '' || formula === '') return;
    if (formulaRows.some((row) => !row.removed && row.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setPointError(t.formulaDuplicateName);
      return;
    }
    const problem = checkFormula?.(formula);
    if (problem !== undefined) {
      setPointError(
        problem.kind === 'redundant' ? t.formulaRedundant(problem.name) : t.formulaInvalid(problem.message),
      );
      return;
    }
    setFormulaRows((rows) => [
      ...rows,
      {
        key: `new-${String(rows.length)}-${name}`,
        id: `new-${String(rows.length)}-${name}`,
        name,
        formula,
        enabled: pointShown,
        saved: false,
        added: true,
        removed: false,
      },
    ]);
    setPointName('');
    setPointFormula('');
    setPointShown(true);
    setPointError(undefined);
  };

  /** Marks a point for removal in the draft (#824): a saved point is removed on Apply, a new one is dropped at once. */
  const removeFormulaPoint = (key: string): void => {
    setFormulaRows((rows) =>
      rows.flatMap((row) => {
        if (row.key !== key) return [row];
        return row.added ? [] : [{ ...row, removed: true }];
      }),
    );
  };

  /** Puts a marked-for-removal saved point back into the draft. */
  const keepFormulaPoint = (key: string): void => {
    setFormulaRows((rows) => rows.map((row) => (row.key === key ? { ...row, removed: false } : row)));
  };

  const setFormulaMode = (key: string, shown: boolean): void => {
    setFormulaRows((rows) => rows.map((row) => (row.key === key ? { ...row, enabled: shown } : row)));
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
      case 'stationWindow':
        return t.summary.stationWindow(String(value.stationWindow?.k ?? STATION_WINDOW_DEFAULT_K));
      case 'motionScore':
        return t.summary.motionScore;
    }
  });
  const triggerDetail = segments.length === 0 ? '' : `: ${segments.join(' · ')}`;
  const triggerLabel = `${t.heading}${triggerDetail}`;

  // The orbs now in force, so the slider's percentage is not the only thing said about them.
  const factor = 1 + draft.orbScalePercent / 100;
  const orb = (degrees: number): string => formatDecimal(degrees * factor, 1, locale);

  const categoryLabels: Record<Category, string> = {
    profile: t.tabProfile,
    bodies: t.tabBodies,
    display: t.tabDisplay,
    special: t.tabSpecial,
  };
  const categoryTabs = CATEGORIES.map((key) => ({ key, label: categoryLabels[key] }));

  /** The footer's left and right groups (#824): Save and Reset on the left, Cancel and Apply on the right. */
  const footer = (
    <>
      <div className="settings-card-footer-group">
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
        {savedDefault !== undefined ? (
          <button
            type="button"
            className="quiet"
            onClick={() => {
              resetTo(savedDefault.settings, savedDefault.rulership);
            }}
          >
            {t.resetToMyDefaultButton}
          </button>
        ) : (
          <button
            type="button"
            className="quiet"
            title={t.resetNoDefaultHint}
            onClick={() => {
              resetTo(DEFAULT_EXTENDED_SETTINGS, DEFAULT_RULERSHIP_CHOICE);
            }}
          >
            {t.resetToMyDefaultButton}
          </button>
        )}
      </div>
      <div className="settings-card-footer-group">
        <button
          type="button"
          className="quiet"
          onClick={() => {
            closeCard();
          }}
        >
          {t.cancelButton}
        </button>
        <button
          type="button"
          className="primitive-button-primary"
          disabled={!dirty || !rulesValid}
          aria-label={dirty ? t.applyButton : `${t.applyButton} — ${t.nothingChanged}`}
          onClick={apply}
        >
          {t.applyButton}
        </button>
      </div>
    </>
  );

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
        placement="right"
        onDiscard={() => {
          closeCard();
        }}
        returnFocusTo={triggerRef}
        footer={footer}
        subheader={
          <div className="settings-drawer-tabs">
            <div className="settings-drawer-tabs-wide">
              <Tabs
                idBase={tabsId}
                label={t.drawerTabsLabel}
                items={categoryTabs}
                active={category}
                onSelect={setCategory}
              />
            </div>
            <div className="settings-drawer-tabs-narrow">
              <Select
                label={t.categoryLabel}
                value={category}
                options={categoryTabs.map((tab) => ({ value: tab.key, label: tab.label }))}
                onChange={(value) => {
                  if (isCategory(value)) setCategory(value);
                }}
              />
            </div>
          </div>
        }
      >
        {applyFailed && <StatusMessage kind="error">{t.applyFailed}</StatusMessage>}
        <p className="hint">{t.scopeNote}</p>

        <div className="settings-drawer-panel">
          <div {...tabPanelProps(tabsId, 'profile')} hidden={category !== 'profile'}>
            <>
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
                {currentProfile !== undefined && CALCULATION_PROFILES[currentProfile].rulership !== rulership && (
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
                          value === 'sidereal'
                            ? { kind: 'sidereal', ayanamsa: LAHIRI_AYANAMSA_ID }
                            : { kind: 'tropical' },
                      });
                    }}
                  />
                  <Disclosure title={t.aboutZodiac} showLabel={t.showDetails} hideLabel={t.hideDetails}>
                    <p className="settings-card-note">
                      {draft.zodiac.kind === 'tropical' ? t.tropicalDescription : t.siderealDescription}
                    </p>
                  </Disclosure>
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
                <div className="settings-card-block">
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
                  <Disclosure title={t.aboutHouseSystem} showLabel={t.showDetails} hideLabel={t.hideDetails}>
                    <p className="settings-card-note">{t.houseSystemDescription(draft.houseSystem)}</p>
                  </Disclosure>
                </div>
              </fieldset>

              <fieldset className="field-group settings-card-group">
                <legend>{t.rulersLegend}</legend>
                <p className="hint settings-card-tag">{t.appliesOnApply}</p>
                <p className="hint">{t.rulersSubtitle}</p>
                <RulershipSetting value={rulers} onChange={setRulers} />
                <p className="settings-card-note">
                  {/* Display reactive description based on rulers choice */}
                  {rulers === 'modern' && t.modernRulersDescription}
                  {rulers === 'traditional' && t.traditionalRulersDescription}
                  {rulers === 'both' && t.coRulersDescription}
                </p>
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
            </>
          </div>

          <div {...tabPanelProps(tabsId, 'bodies')} hidden={category !== 'bodies'}>
            <>
              <fieldset className="field-group settings-card-group">
                <legend>{t.aspectsLegend}</legend>
                <p className="hint settings-card-tag">{t.appliesOnApply}</p>
                <div className="settings-card-block">
                  <ChoiceGroup
                    label={t.orbScaleSegmentLabel}
                    value={segmentFor(draft.orbScalePercent)}
                    options={ORB_SCALE_SEGMENTS.map((segment) => ({
                      value: segment.value,
                      label: segment.label,
                    }))}
                    onChange={(value) => {
                      const segment = ORB_SCALE_SEGMENTS.find((candidate) => candidate.value === value);
                      if (segment !== undefined)
                        replaceDraft({ ...withoutOrbRules(effective), orbScalePercent: segment.percent });
                    }}
                  />
                </div>
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
                <div className="settings-card-block">
                  <OptionCards
                    label={t.orbProfileLabel}
                    value={currentCitedPreset ?? currentOrbProfile ?? 'custom'}
                    options={[
                      ...(currentOrbProfile === undefined && currentCitedPreset === undefined
                        ? [
                            {
                              value: 'custom',
                              title: t.orbProfileOptions.custom,
                              consequence: t.orbProfileNotes.custom,
                            },
                          ]
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
                </div>
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
                <div className="settings-card-block">
                  <p>{t.minorAspectsLegend}</p>
                  <div className="settings-card-minor-set">
                    <ChoiceGroup
                      label={t.minorSetLabel}
                      value={minorSetFor(draft.enabledMinorAspects)}
                      options={[
                        { value: 'off', label: t.minorSetOptions.off },
                        { value: 'quintiles', label: t.minorSetOptions.quintiles },
                        { value: 'all', label: t.minorSetOptions.all },
                        ...(minorSetFor(draft.enabledMinorAspects) === 'custom'
                          ? [{ value: 'custom', label: t.minorSetOptions.custom }]
                          : []),
                      ]}
                      onChange={(value) => {
                        if (value === 'off') patch({ enabledMinorAspects: [] });
                        else if (value === 'quintiles') patch({ enabledMinorAspects: MINOR_SET_QUINTILES });
                        else if (value === 'all') patch({ enabledMinorAspects: MINOR_ASPECTS.map((a) => a.key) });
                      }}
                    />
                  </div>
                  <Disclosure title={t.minorChooseEach} showLabel={t.showDetails} hideLabel={t.hideDetails}>
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
                  </Disclosure>
                </div>
              </fieldset>

              <fieldset className="field-group settings-card-group">
                <legend>{t.matrixLegend}</legend>
                <p className="hint settings-card-tag">{t.appliesOnApply}</p>
                <div className="settings-card-block">
                  <OptionCards
                    label={t.objectPresetLabel}
                    value={currentObjectPreset ?? 'custom'}
                    options={[
                      ...(currentObjectPreset === undefined
                        ? [
                            {
                              value: 'custom',
                              title: t.objectPresetOptions.custom,
                              consequence: t.objectPresetNotes.custom,
                            },
                          ]
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
                <div className="settings-card-matrix-toolbar">
                  {groupActions(t.planetsGroupLabel, PLANET_KEYS)}
                  {groupActions(t.minorPlanetsLegend, ASTEROID_KEYS)}
                  {groupActions(t.pointsGroupLabel, POINT_KEYS)}
                </div>
                <SortableTable
                  caption={t.matrixLegend}
                  columns={matrixColumns}
                  rows={matrixRows}
                  getRowKey={(row) => row.key}
                />
                <Disclosure title={t.aboutPoints} showLabel={t.showDetails} hideLabel={t.hideDetails}>
                  <p className="hint">{t.vertexHelp}</p>
                  <p className="hint">{t.spiritHelp}</p>
                  <p className="hint">{t.aspectsToHint}</p>
                </Disclosure>
              </fieldset>

              {onCustomPointsChange !== undefined && (
                <fieldset className="field-group settings-card-group">
                  <legend>{t.formulaHeading}</legend>
                  <p className="hint settings-card-tag">{t.appliesOnApply}</p>
                  <p className="hint">{t.formulaStaged}</p>
                  <FormulaPointsSection
                    rows={formulaRows}
                    name={pointName}
                    formula={pointFormula}
                    shown={pointShown}
                    error={pointError}
                    onName={setPointName}
                    onFormula={setPointFormula}
                    onShown={setPointShown}
                    onAdd={addFormulaPoint}
                    onRemove={removeFormulaPoint}
                    onKeep={keepFormulaPoint}
                    onMode={setFormulaMode}
                    t={t}
                  />
                </fieldset>
              )}
            </>
          </div>

          <div {...tabPanelProps(tabsId, 'display')} hidden={category !== 'display'}>
            <>
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
                <legend>{t.symbolsFrameSubtitle}</legend>
                <p className="hint settings-card-tag">{t.devicePreview}</p>
                <SymbolSetting />
              </fieldset>
            </>
          </div>

          <div {...tabPanelProps(tabsId, 'special')} hidden={category !== 'special'}>
            <>
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
                <div className="settings-card-indent">
                  <div className="settings-card-choice-line">
                    <span>{t.lilithLabel}</span>
                    <ChoiceGroup
                      label={t.lilithModelAriaLabel}
                      value={draft.lilithVariant}
                      options={[
                        { value: 'mean', label: t.mean },
                        { value: 'true', label: t.true },
                        { value: 'interpolated', label: t.interpolated },
                      ]}
                      onChange={(value) => {
                        if (value === 'mean' || value === 'true' || value === 'interpolated')
                          patch({ lilithVariant: value });
                      }}
                    />
                  </div>
                  <Disclosure title={t.aboutSpecial} showLabel={t.showDetails} hideLabel={t.hideDetails}>
                    <p className="hint">{t.lilithHelp}</p>
                    <p className="hint">{t.chironHelp}</p>
                    <p className="hint">{t.nodeHelp}</p>
                  </Disclosure>
                </div>
                <div className="settings-card-indent">
                  <div className="settings-card-choice-line">
                    <span>{t.lunarNodesLabel}</span>
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
                </div>
                <div className="settings-card-indent">
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
                </div>
                <div className="settings-card-indent">
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
                        if (value !== '' && Number.isFinite(parsed) && parsed >= 0)
                          patch({ declinationMaxOrb: parsed });
                      }}
                    />
                  </div>
                  <p className="hint settings-card-indent">{t.declinationHint}</p>
                </div>
                <div className="settings-card-indent">
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
                </div>
              </fieldset>

              <fieldset className="field-group settings-card-group">
                <legend>{t.motionLegend}</legend>
                <p className="hint settings-card-tag">{t.appliesOnApply}</p>
                <Disclosure title={t.aboutMotion} showLabel={t.showDetails} hideLabel={t.hideDetails}>
                  <p className="hint">{t.motionHint}</p>
                  <p className="hint">{t.stationWindowHint}</p>
                  <p className="hint">{t.motionScoreHint}</p>
                </Disclosure>
                <Checkbox
                  label={t.stationWindowLabel}
                  checked={draft.stationWindow !== undefined}
                  onChange={(value) => {
                    setDraft((current) =>
                      value
                        ? { ...current, stationWindow: { k: current.stationWindow?.k ?? STATION_WINDOW_DEFAULT_K } }
                        : withoutStationWindow(current),
                    );
                  }}
                />
                {draft.stationWindow !== undefined && (
                  <div className="settings-card-indent">
                    <NumberField
                      label={t.stationWindowKLabel}
                      value={String(draft.stationWindow.k)}
                      min={0.01}
                      max={1}
                      step={0.01}
                      decreaseLabel={t.stationWindowKDecreaseLabel}
                      increaseLabel={t.stationWindowKIncreaseLabel}
                      onChange={(value) => {
                        const parsed = Number(value);
                        // Rounded to four places so a stepper's float arithmetic (0.05 + 0.01) never leaves a stray tail in the draft.
                        if (value !== '' && isStationWindowK(parsed)) {
                          patch({ stationWindow: { k: Math.round(parsed * 10000) / 10000 } });
                        }
                      }}
                    />
                  </div>
                )}
                <Checkbox
                  label={t.motionScoreLabel}
                  checked={draft.motionScore === true}
                  onChange={(value) => {
                    setDraft((current) => withMotionScore(current, value));
                  }}
                />
              </fieldset>
            </>
          </div>
        </div>
      </StagedDialog>
    </div>
  );
}

// The orb scale's segmented control (#824): the three named steps the Orb profile cards also stand for.
const ORB_SCALE_SEGMENTS = [
  { value: 'tight', label: '-50%', percent: -50 },
  { value: 'standard', label: '0%', percent: 0 },
  { value: 'wide', label: '+40%', percent: 40 },
] as const;

/** The segment the scale sits on, or `custom` between them. */
function segmentFor(percent: number): string {
  return ORB_SCALE_SEGMENTS.find((segment) => segment.percent === percent)?.value ?? 'custom';
}

/** The quintile minor aspects, the "Quintiles" minor set (#824). */
const MINOR_SET_QUINTILES: readonly string[] = MINOR_ASPECTS.filter(
  (aspect) => aspect.angle === 72 || aspect.angle === 144,
).map((aspect) => aspect.key);

/** Which minor set the enabled aspects match, or `custom` when they match none. */
function minorSetFor(enabled: readonly string[]): 'off' | 'quintiles' | 'all' | 'custom' {
  const keys = [...enabled].sort().join(',');
  if (keys === '') return 'off';
  if (keys === [...MINOR_SET_QUINTILES].sort().join(',')) return 'quintiles';
  if (
    keys ===
    MINOR_ASPECTS.map((a) => a.key)
      .sort()
      .join(',')
  )
    return 'all';
  return 'custom';
}

function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

/** The drawer's formula rows from the saved points: every saved point starts as saved, none marked. */
function formulaRowsFrom(points: readonly CustomPointDefinition[]): readonly FormulaDraftRow[] {
  return points.map((point) => ({
    key: point.id,
    id: point.id,
    name: point.name,
    formula: point.formula,
    enabled: point.enabled !== false,
    saved: true,
    added: false,
    removed: false,
  }));
}

/** Whether the drawer's formula list differs from the saved one (a pending add, edit or removal). */
function sameFormulas(rows: readonly FormulaDraftRow[], saved: readonly CustomPointDefinition[]): boolean {
  return JSON.stringify(stagedPoints(rows)) === JSON.stringify(savedAsDraft(saved));
}

function savedAsDraft(points: readonly CustomPointDefinition[]): readonly CustomPointDefinition[] {
  return points.map((point) => ({
    id: point.id,
    name: point.name,
    formula: point.formula,
    ...(point.enabled === false ? { enabled: false } : {}),
  }));
}

/** The point list Apply saves: every saved point not marked for removal, then the added ones, in draft order. */
function stagedPoints(rows: readonly FormulaDraftRow[]): readonly CustomPointDefinition[] {
  return rows
    .filter((row) => !row.removed)
    .map((row) => ({
      id: row.id,
      name: row.name,
      formula: row.formula,
      ...(row.enabled ? {} : { enabled: false }),
    }));
}

/**
 * The formula points section of the Bodies and orbs tab (#824): the name and formula inputs, the Show/Aspect choice,
 * the add button, and a compact list where a pending add or removal is labelled as a draft until Apply.
 */
function FormulaPointsSection({
  rows,
  name,
  formula,
  shown,
  error,
  onName,
  onFormula,
  onShown,
  onAdd,
  onRemove,
  onKeep,
  onMode,
  t,
}: {
  readonly rows: readonly FormulaDraftRow[];
  readonly name: string;
  readonly formula: string;
  readonly shown: boolean;
  readonly error: string | undefined;
  readonly onName: (value: string) => void;
  readonly onFormula: (value: string) => void;
  readonly onShown: (value: boolean) => void;
  readonly onAdd: () => void;
  readonly onRemove: (key: string) => void;
  readonly onKeep: (key: string) => void;
  readonly onMode: (key: string, shown: boolean) => void;
  readonly t: (typeof extendedSettingsPanelMessages)['en'];
}): React.JSX.Element {
  const columns: readonly TableColumn<FormulaDraftRow>[] = [
    {
      key: 'name',
      label: t.formulaColumnName,
      sortable: false,
      valueOf: (row) => row.name,
      renderCell: (row) => (
        <>
          {row.name} {row.added && <span className="settings-card-draft-tag">{t.formulaDraftTag}</span>}
          {row.removed && <span className="settings-card-draft-tag">{t.formulaRemovedTag}</span>}
        </>
      ),
    },
    { key: 'formula', label: t.formulaColumnFormula, sortable: false, valueOf: (row) => row.formula },
    {
      key: 'mode',
      label: t.formulaColumnMode,
      sortable: false,
      valueOf: (row) => row.enabled,
      renderCell: (row) =>
        row.removed ? null : (
          <ChoiceGroup
            label={`${t.formulaModeLabel}: ${row.name}`}
            value={row.enabled ? 'show' : 'hidden'}
            options={[
              { value: 'show', label: t.formulaModeShow },
              { value: 'hidden', label: t.formulaModeHidden },
            ]}
            onChange={(value) => {
              onMode(row.key, value === 'show');
            }}
          />
        ),
    },
    {
      key: 'action',
      label: t.formulaColumnAction,
      sortable: false,
      valueOf: (row) => row.name,
      renderCell: (row) =>
        row.removed ? (
          <Button
            onClick={() => {
              onKeep(row.key);
            }}
          >
            {t.formulaKeep(row.name)}
          </Button>
        ) : (
          <Button
            onClick={() => {
              onRemove(row.key);
            }}
          >
            {t.formulaRemove(row.name)}
          </Button>
        ),
    },
  ];
  return (
    <div className="settings-card-block">
      <div className="settings-card-formula-add">
        <TextField label={t.formulaColumnName} value={name} onChange={onName} />
        <TextField label={t.formulaColumnFormula} value={formula} onChange={onFormula} />
        <Checkbox label={t.formulaModeShow} checked={shown} onChange={onShown} />
        <Button onClick={onAdd} disabled={name.trim() === '' || formula.trim() === ''}>
          {t.formulaAdd}
        </Button>
      </div>
      {error !== undefined && <StatusMessage kind="error">{error}</StatusMessage>}
      {rows.length === 0 ? (
        <p className="hint">{t.formulaEmpty}</p>
      ) : (
        <SortableTable caption={t.formulaListCaption} columns={columns} rows={rows} getRowKey={(row) => row.key} />
      )}
    </div>
  );
}
