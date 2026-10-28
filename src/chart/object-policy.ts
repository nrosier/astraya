/**
 * Every object a chart's visibility/aspect-participation policy can govern (#585), and the
 * default policy that reproduces today's effective behavior exactly.
 *
 * A prior attempt at this (#601) was reverted: it modeled the policy as a `ReadonlySet`, which
 * silently becomes `{}` through every real JSON round trip this app relies on (share links,
 * saved defaults, full-export files). `ObjectPolicy` is a plain, JSON-safe value instead —
 * `{visible, aspectParticipant}` — and `ObjectPolicies` is a plain `Record`, the same shape
 * `extended-settings.ts`'s existing `modernPointVisibility` already uses safely.
 *
 * `OBJECT_KEYS` is hand-written rather than derived from `astrology/bodies.ts`'s `BODIES`,
 * because `BodyDefinition.key` is typed as plain `string`, not a literal union a mapped type
 * could key off of — the same reason `extended-settings.ts`'s `MODERN_POINT_KEYS` is hand-written
 * too. `test/chart-object-policy.test.ts` asserts the two lists can't drift apart.
 */
/**
 * @module chart/object-policy
 * @purpose Defines the full set of chart objects a visibility/aspect-participation policy can govern, the policy shape itself, and the default policy that matches today's pre-#585 behavior exactly.
 * @conventions `ObjectPolicies` is a plain JSON-safe Record, never a Set/Map — the specific mistake a reverted prior attempt (#601) made. Every default here is derived from, and tested against, this app's actual pre-#585 scattered-boolean behavior, not re-decided from scratch.
 * @exports OBJECT_KEYS, ObjectKey, ObjectPolicy, ObjectPolicies, isInterpreted, withInterpreted, interpretationExclusions, DEFAULT_OBJECT_POLICIES, PRESET_OBJECT_POLICIES, ObjectPolicyPresetId, OBJECT_POLICY_PRESET_IDS, matchObjectPolicyPreset
 */

/** The 20 `astrology/bodies.ts` `BODIES` keys, Pholus (`OPT_IN_BODIES`, #804), plus the Vertex and the two Hellenistic lots (Fortune, Spirit) — every object this policy governs. The Ascendant and Midheaven are deliberately excluded: angles are structurally required wherever houses exist, never an optional object. */
export const OBJECT_KEYS = [
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
  'meanNode',
  'trueNode',
  'meanLilith',
  'osculatingLilith',
  'interpolatedLilith',
  'chiron',
  'pholus',
  'ceres',
  'pallas',
  'juno',
  'vesta',
  'vertex',
  'partOfFortune',
  'partOfSpirit',
] as const;

export type ObjectKey = (typeof OBJECT_KEYS)[number];

export interface ObjectPolicy {
  readonly visible: boolean;
  readonly aspectParticipant: boolean;
  /**
   * Whether the written report may speak about this object (#721) — a third, independent switch next
   * to display (`visible`) and calculation (`aspectParticipant`): hiding an object declutters the
   * wheel and never changes the reading, and leaving it out of the reading never hides it. Absent
   * means included, which is every default and every snapshot written before this existed; only an
   * explicit exclusion is stored, so a chart with none serializes exactly as it always did.
   */
  readonly interpreted?: boolean;
}

export type ObjectPolicies = Readonly<Record<ObjectKey, ObjectPolicy>>;

/** Whether `policy` lets the report speak about its object (#721): everything but an explicit `interpreted: false`. */
export function isInterpreted(policy: ObjectPolicy): boolean {
  return policy.interpreted !== false;
}

/**
 * `policy` with its report inclusion set (#721). Only an exclusion is stored: including an object
 * again removes the flag rather than writing `true`, so a chart with no exclusions serializes
 * exactly as it did before the flag existed.
 */
export function withInterpreted(policy: ObjectPolicy, interpreted: boolean): ObjectPolicy {
  const { visible, aspectParticipant } = policy;
  return interpreted ? { visible, aspectParticipant } : { visible, aspectParticipant, interpreted: false };
}

/**
 * The body keys the report must leave out (#721), as a set the interpretation layer can test without
 * knowing about policies. Keys are the objects' own (`BODIES` keys for bodies; the Vertex and lots are
 * listed too, harmlessly, since no report paragraph names them).
 */
export function interpretationExclusions(policies: ObjectPolicies): ReadonlySet<string> {
  return new Set(OBJECT_KEYS.filter((key) => !isInterpreted(policies[key])));
}

const ALWAYS_ON: ObjectPolicy = { visible: true, aspectParticipant: true };
const VISIBLE_ONLY: ObjectPolicy = { visible: true, aspectParticipant: false };
/** Hidden by default today (`modernPointVisibility`'s own default), but with no participation gate at all — kept participating so a chart's *computed* aspect data doesn't change, only what is shown does. */
const HIDDEN_BUT_PARTICIPATING: ObjectPolicy = { visible: false, aspectParticipant: true };
const OFF: ObjectPolicy = { visible: false, aspectParticipant: false };

/**
 * Reproduces pre-#585 behavior exactly, key by key:
 * - Sun through Pluto: always shown, always participated — no gate ever existed.
 * - Chiron: `chironVisible` defaulted true; `aspectsToChiron` defaulted false.
 * - Pholus (#804, new, so no pre-#585 behavior to match): hidden and not participating, so no existing chart changes.
 * - Both nodes, all three Liliths: `modernPointVisibility` defaulted false; `aspectsToLunarNodes`/`aspectsToLilith` defaulted false.
 * - The four asteroids: `modernPointVisibility` defaulted false (hidden), but had no participation gate at all (kept participating).
 * - Vertex, Part of Fortune, Part of Spirit: all three defaulted false for both visibility and `aspectsTo`.
 */
export const DEFAULT_OBJECT_POLICIES: ObjectPolicies = {
  sun: ALWAYS_ON,
  moon: ALWAYS_ON,
  mercury: ALWAYS_ON,
  venus: ALWAYS_ON,
  mars: ALWAYS_ON,
  jupiter: ALWAYS_ON,
  saturn: ALWAYS_ON,
  uranus: ALWAYS_ON,
  neptune: ALWAYS_ON,
  pluto: ALWAYS_ON,
  meanNode: OFF,
  trueNode: OFF,
  meanLilith: OFF,
  osculatingLilith: OFF,
  interpolatedLilith: OFF,
  chiron: VISIBLE_ONLY,
  pholus: OFF,
  ceres: HIDDEN_BUT_PARTICIPATING,
  pallas: HIDDEN_BUT_PARTICIPATING,
  juno: HIDDEN_BUT_PARTICIPATING,
  vesta: HIDDEN_BUT_PARTICIPATING,
  vertex: OFF,
  partOfFortune: OFF,
  partOfSpirit: OFF,
};

export const OBJECT_POLICY_PRESET_IDS = ['core', 'traditional', 'all'] as const;
export type ObjectPolicyPresetId = (typeof OBJECT_POLICY_PRESET_IDS)[number];

function policiesFrom(onKeys: readonly ObjectKey[]): ObjectPolicies {
  const onSet = new Set<ObjectKey>(onKeys);
  return Object.fromEntries(OBJECT_KEYS.map((key) => [key, onSet.has(key) ? ALWAYS_ON : OFF])) as ObjectPolicies;
}

/**
 * Three consultation-density presets (#585) — each a complete `ObjectPolicies`, applied
 * atomically like `calculation-profiles.ts`'s own profiles, not merged over the current draft.
 * "Modern" was considered and dropped: at object-visibility granularity it is identical to
 * "All" (the modern/traditional split is a rulership question, not a question of which bodies
 * exist), so a fourth, functionally-redundant preset wasn't added.
 */
export const PRESET_OBJECT_POLICIES: Readonly<Record<ObjectPolicyPresetId, ObjectPolicies>> = {
  /** A tight, quick-read set: the luminaries and the three personal planets closest to them. */
  core: policiesFrom(['sun', 'moon', 'mercury', 'venus', 'mars']),
  /** The seven classical planets, plus the two Hellenistic lots — traditional astrology's own standard object set, not an invented grouping. */
  traditional: policiesFrom([
    'sun',
    'moon',
    'mercury',
    'venus',
    'mars',
    'jupiter',
    'saturn',
    'partOfFortune',
    'partOfSpirit',
  ]),
  /** Every object visible and participating. */
  all: policiesFrom(OBJECT_KEYS),
};

/** Which preset (if any) `policies` currently matches exactly — `undefined` for a hand-customized draft, the same "named preset, or Custom" pattern `calculation-profiles.ts`'s `matchCalculationProfile` already uses. */
export function matchObjectPolicyPreset(policies: ObjectPolicies): ObjectPolicyPresetId | undefined {
  return OBJECT_POLICY_PRESET_IDS.find((id) => JSON.stringify(policies) === JSON.stringify(PRESET_OBJECT_POLICIES[id]));
}
