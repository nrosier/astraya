/**
 * Checks whether a full export's recorded natal calculations still reproduce (#582 follow-up).
 *
 * `verifyCalculationArtifact` was built and tested in isolation (#607-#609) but had no caller
 * anywhere in the app — #582's own stated goal, that an old result be "independently verified
 * after an ephemeris, timezone, or calculation-policy upgrade," had no UI surface at all. No
 * `CalculationArtifact` is ever persisted in the live app either: `chart.ts`'s own doc comment
 * explains why a `Chart` holds no computed positions, by design. The only durable artifact
 * anywhere is the one `full-export.ts` writes into a downloaded JSON file — so this is the one
 * place a result can honestly be checked against.
 *
 * Deliberately separate from `full-export-importer.ts`'s restore flow (#587), on purpose:
 * restore never trusts a `calculation` field for what it writes, and checking a file's
 * calculations is a different question from deciding whether to restore people from it — a
 * reader might want one without the other. This reads `calculation` straight off the file's own
 * raw, unvalidated `people` array (not the validated `FullExport`, which `validateFullExport`
 * deliberately never carries a `calculation` field on, for the same reason).
 *
 * No separate strict parser for `CalculationArtifact`'s own shape: `verifyCalculationArtifact`
 * already gates on a SHA-256 integrity check before it ever runs a real calculation, so a
 * malformed `moment`/`snapshot` almost always fails that comparison and comes back
 * `'inconsistent'` on its own. The one gap — a provenance shape missing the fields its own
 * `'changed'` diff reads — is caught per person rather than crashing the whole check.
 */
/**
 * @module full-export-check
 * @purpose Verifies each person's recorded CalculationArtifact in a full-export file against what the current engine actually produces, without restoring or writing anything.
 * @conventions Reads `calculation` off the file's raw, unvalidated people array — `validateFullExport`'s own output never carries it. Each person's check runs independently inside its own try/catch, so one malformed artifact reports as an error for that person rather than failing the whole file.
 * @exports PersonCalculationCheck, CalculationCheckOutcome, checkExportedCalculations
 */
import {
  verifyCalculationArtifact,
  type ArtifactVerification,
  type CalculationArtifact,
  type CalculationArtifactInputs,
  type ProvenanceDifference,
} from './calculation-artifact.js';
import type { FullExport } from './full-export.js';
import type { EphemerisProvider } from '../ephemeris/types.js';

export type CalculationCheckOutcome =
  /** No `calculation` field at all — expected for an export made without Web Crypto, or from before #582. */
  | { readonly kind: 'no-artifact' }
  /** The artifact's shape couldn't be checked at all; never surfaced as a crash. */
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'verified' }
  /** The recorded inputs no longer hash to what the artifact itself claims — edited or damaged. */
  | { readonly kind: 'inconsistent' }
  | { readonly kind: 'changed'; readonly differences: readonly ProvenanceDifference[] };

export interface PersonCalculationCheck {
  readonly id: string;
  readonly displayName: string;
  readonly outcome: CalculationCheckOutcome;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `ArtifactVerification`'s discriminant is `status`; this module's is `kind` (room for `'no-artifact'`/`'error'`, which have no `status` counterpart). */
function toOutcome(verification: ArtifactVerification): CalculationCheckOutcome {
  switch (verification.status) {
    case 'verified':
      return { kind: 'verified' };
    case 'inconsistent':
      return { kind: 'inconsistent' };
    case 'changed':
      return { kind: 'changed', differences: verification.differences };
  }
}

/**
 * Checks every person's recorded natal `calculation`, if there is one, against what `provider`
 * actually computes for its own recorded inputs right now. `rawPeople` must be the same file's
 * untouched `people` array, in the same order as `archive.people` — `archive` only supplies the
 * trusted `id`/`displayName` to label each result with.
 */
export async function checkExportedCalculations(
  archive: FullExport,
  rawPeople: readonly unknown[],
  provider: EphemerisProvider,
  current: CalculationArtifactInputs,
): Promise<readonly PersonCalculationCheck[]> {
  const checks: PersonCalculationCheck[] = [];
  for (const [index, person] of archive.people.entries()) {
    const raw = rawPeople[index];
    const calculation = isRecord(raw) ? raw.calculation : undefined;
    if (calculation === undefined) {
      checks.push({ id: person.id, displayName: person.displayName, outcome: { kind: 'no-artifact' } });
      continue;
    }
    try {
      // Safe despite the cast: `verifyCalculationArtifact`'s first step hashes
      // `{moment, snapshot, technique}` and compares it against `fingerprint.inputHash` before
      // ever running a real calculation — a malformed shape either fails that comparison
      // (`'inconsistent'`) or throws here, caught below, rather than producing a plausible-
      // looking wrong verdict.
      const verification = await verifyCalculationArtifact(calculation as CalculationArtifact, provider, current);
      checks.push({ id: person.id, displayName: person.displayName, outcome: toOutcome(verification) });
    } catch (error) {
      checks.push({
        id: person.id,
        displayName: person.displayName,
        outcome: { kind: 'error', message: error instanceof Error ? error.message : String(error) },
      });
    }
  }
  return checks;
}
