/**
 * The app's one way to turn a just-completed chart calculation into its `CalculationArtifact`
 * (#582), supplying the two provenance values only the running app knows: its own build version
 * and the live Swiss Ephemeris version. Shared by the chart screen, the shared-link screen and
 * the PDF builder, so every place that shows a calculation fingerprint builds it the same way.
 */
/**
 * @module ui/chart-artifact
 * @purpose Builds a CalculationArtifact for a completed chart calculation with this build's app and Swiss Ephemeris versions (#582).
 * @conventions Returns `undefined` rather than throwing when the artifact cannot be built — Web Crypto's `subtle` exists only in a secure context, and a self-hosted instance served over plain HTTP on a LAN is not one; callers still show the chart and fall back to the snapshot's own short tag for its fingerprint.
 * @exports buildChartArtifact
 */
import { buildCalculationArtifact, type CalculationArtifact } from '../domain/calculation-artifact.js';
import type { CalculationSnapshot } from '../domain/calculation-snapshot.js';
import type { ChartData } from '../domain/chart-compute.js';
import type { EphemerisProvider } from '../ephemeris/types.js';
import type { BirthMomentInput } from '../time/types.js';
import { APP_VERSION } from '../version.js';

/** The artifact for a calculation of `moment` under `snapshot` that produced `data`, or `undefined` if it cannot be built here. */
export async function buildChartArtifact(
  snapshot: CalculationSnapshot,
  moment: BirthMomentInput,
  data: ChartData,
  provider: EphemerisProvider,
): Promise<CalculationArtifact | undefined> {
  try {
    return await buildCalculationArtifact(snapshot, moment, data, {
      astrayaVersion: APP_VERSION,
      swephVersion: await provider.version(),
    });
  } catch {
    return undefined;
  }
}
