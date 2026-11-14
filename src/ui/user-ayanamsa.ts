/**
 * @module ui/user-ayanamsa
 * @purpose Splits a user-defined ayanamsa (#1407) into the whole degrees and minutes the settings fields show, and joins typed fields back into degrees.
 * @conventions Pure, no React. Minutes show two decimals (a hundredth of an arcminute, 0.6 arcseconds), so a prefilled value shows without float noise; the stored value keeps full precision until the reader edits it; a typed value is refused, not clamped, when it is not a whole number of degrees 0-359 or minutes 0 up to 60.
 * @exports DegreesMinutes, splitDegrees, joinDegrees
 */

export interface DegreesMinutes {
  readonly degrees: number;
  readonly minutes: number;
}

/** 23.8536 -> { degrees: 23, minutes: 51.22 }, with the minutes rounded to two decimals and carried at 60. */
export function splitDegrees(value: number): DegreesMinutes {
  let degrees = Math.floor(value);
  let minutes = Math.round((value - degrees) * 6000) / 100;
  if (minutes >= 60) {
    degrees += 1;
    minutes = 0;
  }
  return { degrees: degrees % 360, minutes };
}

/** The degrees two typed fields give, or undefined when either is not a valid entry (see the module conventions). */
export function joinDegrees(degreesText: string, minutesText: string): number | undefined {
  if (degreesText.trim() === '' || minutesText.trim() === '') return undefined;
  const degrees = Number(degreesText);
  const minutes = Number(minutesText);
  if (!Number.isInteger(degrees) || degrees < 0 || degrees > 359) return undefined;
  if (!Number.isFinite(minutes) || minutes < 0 || minutes >= 60) return undefined;
  return degrees + minutes / 60;
}
