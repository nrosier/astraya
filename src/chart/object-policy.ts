/**
 * Unified visibility policy for all calculated objects in charts (#585).
 *
 * Replaces individual boolean flags (fortuneVisible, vertexVisible, etc.) with
 * a single ObjectPolicy that controls which calculated points, enrichments, and
 * derived features are displayed. This reduces settings bloat and makes it
 * easier to add new objects in the future.
 *
 * An ObjectPolicy is a set of feature keys that are "active" — anything not
 * in the set is inactive by default. This matches the convention: new objects
 * opt-in via explicit inclusion rather than opt-out via explicit exclusion.
 */

/**
 * @module chart/object-policy
 * @purpose Unified visibility policy for all calculated chart objects, replacing point-specific booleans.
 * @conventions ObjectPolicy is a Set of feature keys; presence = visible, absence = hidden; used by chart computation and rendering to determine which objects to include; all objects default to hidden unless explicitly included in the policy.
 * @exports ObjectPolicy, ObjectPolicyKey, createObjectPolicy, isObjectVisible, DEFAULT_OBJECT_POLICY, POINT_POLICY_KEYS
 */

/** The canonical set of all objects that can be controlled by visibility policy. */
export const POINT_POLICY_KEYS = [
  'fortune', // Part of Fortune
  'spirit', // Part of Spirit
  'vertex', // Vertex
  'chiron', // Chiron
  'midpoints', // Midpoint tree
  'antiscia', // Antiscia / Contraanticsia
  'declinations', // Declinations / Parallels / Contraparallels
  'dial90', // 90° dial midpoints
] as const;

export type ObjectPolicyKey = (typeof POINT_POLICY_KEYS)[number];

/**
 * A set of visible objects. An object is visible if its key is in the set;
 * anything not in the set is hidden by default.
 */
export type ObjectPolicy = ReadonlySet<ObjectPolicyKey>;

/** Objects visible by default — chiron always, others opt-in. */
export const DEFAULT_OBJECT_POLICY: ObjectPolicy = new Set<ObjectPolicyKey>(['chiron']);

/**
 * Create an ObjectPolicy from a list of visible keys.
 * Filters out unknown keys silently.
 */
export function createObjectPolicy(keys: readonly unknown[]): ObjectPolicy {
  const validKeys = keys.filter((key): key is ObjectPolicyKey =>
    typeof key === 'string' && (POINT_POLICY_KEYS as readonly string[]).includes(key),
  );
  return new Set(validKeys);
}

/**
 * Check if an object is visible according to a policy.
 */
export function isObjectVisible(key: ObjectPolicyKey, policy: ObjectPolicy): boolean {
  return policy.has(key);
}

/**
 * Convert an ObjectPolicy to a JSON-serializable array for storage/transmission.
 */
export function serializeObjectPolicy(policy: ObjectPolicy): readonly ObjectPolicyKey[] {
  return Array.from(policy);
}

/**
 * Parse an ObjectPolicy from a JSON array.
 */
export function parseObjectPolicy(data: unknown): ObjectPolicy {
  if (!Array.isArray(data)) return DEFAULT_OBJECT_POLICY;
  return createObjectPolicy(data);
}
