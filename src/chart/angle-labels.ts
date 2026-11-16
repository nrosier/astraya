/**
 * @module chart/angle-labels
 * @purpose Single source of truth for the text labels of the four chart angles (AC, DC, MC, IC), used by every chart and table that labels them.
 * @conventions Plain ASCII text abbreviations, set in the existing chart-label style; no alchemical or other symbol characters and no artwork (owner decision, 2026-11-16, #1649).
 * @exports ANGLE_LABEL, AngleKey.
 */

export const ANGLE_LABEL = {
  asc: 'AC',
  dsc: 'DC',
  mc: 'MC',
  ic: 'IC',
} as const;

export type AngleKey = keyof typeof ANGLE_LABEL;
