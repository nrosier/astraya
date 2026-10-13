/**
 * A relocated chart (#559): the exact natal moment, recast for a different place — the same
 * "fixed moment, free place" primitive `return-chart.ts` already uses for solar/lunar returns,
 * applied directly to the natal chart itself rather than to a found return instant.
 *
 * Deliberately computes the natal chart alongside the relocated one, not just the relocated
 * chart alone: every planetary longitude is identical between the two (geocentric longitude
 * does not depend on the observer's place), so the only thing a relocation actually changes is
 * houses/angles and whatever derives from them (Vertex, Fortune/Spirit via the Ascendant) —
 * callers comparing the two need both charts side by side to see that, not just the new one.
 */
/**
 * @module domain/relocated-chart
 * @purpose Computes a natal chart's angles/houses recast for a different place at the same birth moment, alongside the unmoved natal chart, for a side-by-side comparison.
 * @conventions Built directly on `computeChartDataAtJd` (the same primitive `return-chart.ts` uses) rather than a new calculation path; both the natal and relocated `ChartData` are returned so a caller can compare rather than only see the relocated result.
 * @exports computeRelocatedChart, RelocatedChartData, relocatedComparisonRows, RelocatedComparisonRow
 */
import { computeChartDataAtJd, type ChartCalculationOptions, type ChartData } from './chart-compute.js';
import { angleRows, degreeParts, houseCuspRows, type DegreeParts } from './chart-tables.js';
import { julianDayFor } from '../time/julian.js';
import { resolveMoment } from '../time/resolve.js';
import type { BirthMomentInput } from '../time/types.js';
import type { Degrees, EphemerisProvider, GeoPosition, JulianDayUT } from '../ephemeris/types.js';

export interface RelocatedChartData {
  readonly natalJd: JulianDayUT;
  readonly natalPlace: GeoPosition;
  readonly relocationPlace: GeoPosition;
  readonly natal: ChartData;
  readonly relocated: ChartData;
}

/** The natal chart and the same moment recast at `relocationPlace`, both as complete `ChartData`. */
export async function computeRelocatedChart(
  natalMoment: BirthMomentInput,
  relocationPlace: GeoPosition,
  provider: EphemerisProvider,
  options: ChartCalculationOptions = {},
): Promise<RelocatedChartData> {
  const resolved = resolveMoment(natalMoment);
  const natalJd = await julianDayFor(provider, resolved);
  const natalPlace: GeoPosition = { ...natalMoment.coordinates, altitude: 0 };
  const [natal, relocated] = await Promise.all([
    computeChartDataAtJd(natalJd, natalPlace, provider, options),
    computeChartDataAtJd(natalJd, relocationPlace, provider, options),
  ]);
  return { natalJd, natalPlace, relocationPlace, natal, relocated };
}

export interface RelocatedComparisonRow {
  readonly label: string;
  readonly natalLongitude: Degrees;
  readonly natal: DegreeParts;
  readonly relocatedLongitude: Degrees;
  readonly relocated: DegreeParts;
}

/**
 * House cusps 1–12 plus the four non-cusp angles (#559), natal vs relocated, one row each —
 * the "comparison view shows both charts' angles/houses side by side" the issue asks for.
 * Positions/aspects/dignities are deliberately not compared row-by-row here: they are identical
 * between the two charts (see this module's own header), so a comparison table for them would
 * be a long list of "no change" rows.
 */
export function relocatedComparisonRows(data: RelocatedChartData): readonly RelocatedComparisonRow[] {
  const natalHouses = houseCuspRows(data.natal);
  const relocatedHouses = houseCuspRows(data.relocated);
  const houseRows = natalHouses.map((natalRow, index): RelocatedComparisonRow => {
    const relocatedRow = relocatedHouses[index];
    const relocatedLongitude = relocatedRow?.longitude ?? natalRow.longitude;
    return {
      label: `House ${String(natalRow.house)}`,
      natalLongitude: natalRow.longitude,
      natal: degreeParts(natalRow.longitude),
      relocatedLongitude,
      relocated: degreeParts(relocatedLongitude),
    };
  });

  const natalAngles = angleRows(data.natal);
  const relocatedAngles = angleRows(data.relocated);
  const angleCompareRows = natalAngles.map((natalRow, index): RelocatedComparisonRow => {
    const relocatedRow = relocatedAngles[index];
    const relocatedLongitude = relocatedRow?.longitude ?? natalRow.longitude;
    return {
      label: natalRow.label,
      natalLongitude: natalRow.longitude,
      natal: degreeParts(natalRow.longitude),
      relocatedLongitude,
      relocated: degreeParts(relocatedLongitude),
    };
  });

  return [...houseRows, ...angleCompareRows];
}
