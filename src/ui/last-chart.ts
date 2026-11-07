/**
 * @module ui/last-chart
 * @purpose Remembers the last chart screen a person's chart was opened on (#1173), so the person Overview can offer "continue where you left off".
 * @conventions A device convenience like `last-person.ts`: stored in localStorage under one key per person, never synced, never sent anywhere; only a `#/people/<id>/charts/...` hash of that person is accepted, so a stale or foreign value cannot send the reader elsewhere. A blocked store means nothing is remembered, which is the same as a person with no chart opened yet.
 * @exports readLastChart, writeLastChart
 */
const PREFIX = 'astraya:lastChart:';

/** Whether the hash is a chart screen of this person. */
function isChartHashOf(personId: string, hash: string): boolean {
  return hash.startsWith(`#/people/${personId}/charts/`);
}

export function readLastChart(personId: string): string | undefined {
  try {
    const hash = localStorage.getItem(`${PREFIX}${personId}`);
    return hash !== null && isChartHashOf(personId, hash) ? hash : undefined;
  } catch {
    return undefined;
  }
}

/** Remembers a chart screen of the person; any other hash is ignored. */
export function writeLastChart(personId: string, hash: string): void {
  if (!isChartHashOf(personId, hash)) return;
  try {
    localStorage.setItem(`${PREFIX}${personId}`, hash);
  } catch {
    // Not remembered: the Overview then simply offers no resume link.
  }
}
