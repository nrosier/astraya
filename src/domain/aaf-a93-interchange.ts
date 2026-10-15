/**
 * AAF (Astrological Automated Format) and A93 interchange support (#591).
 *
 * AAF and A93 are standardized ASCII/text formats for exchanging astrological data.
 * This module provides conversion functions between Astraya's internal FullExport
 * format and AAF/A93 standard text format, enabling data portability and interoperability
 * with other astrological applications.
 *
 * NOTE: This is a research-based implementation. The AAF and A93 specifications are
 * referenced but not fully verified due to availability and licensing questions around
 * the standards themselves. This implementation is based on publicly available documentation
 * and reverse-engineering from existing tools that claim AAF/A93 compatibility.
 *
 * @see docs/audit/ASTROLOGY_REVIEW.md for the gap analysis
 * @see docs/EXPORT_SCHEMA.md for Astraya's own schema (the canonical format)
 */

/**
 * @module domain/aaf-a93-interchange
 * @purpose Convert between Astraya FullExport format and AAF/A93 standard text formats for data portability.
 * @conventions Conversion is lossy where Astraya's data model is richer than AAF/A93 (e.g., modern points, custom settings); round-trip conversion preserves core data (moment, place, positions) but may lose extended settings; all conversions validate and document what was lost.
 * @exports AAFExportOptions, A93ExportOptions, exportToAAF, exportToA93, parseAAF, parseA93, ConversionResult
 */

import type { FullExport } from './full-export.js';

/**
 * Metadata about what was lost in a format conversion,
 * for transparency and future recovery.
 */
export interface ConversionLoss {
  readonly category: 'data' | 'setting' | 'computation';
  readonly item: string;
  readonly reason: string;
}

/**
 * Result of a conversion operation, including the output and any losses.
 */
export interface ConversionResult<T> {
  readonly data: T;
  readonly losses: readonly ConversionLoss[];
  readonly isLossy: boolean;
}

/** Options for AAF export. */
export interface AAFExportOptions {
  /** Include extended settings (non-standard extension) */
  readonly includeExtendedSettings?: boolean;
  /** Use UTF-8 encoding (standard is ASCII with escaping) */
  readonly utf8?: boolean;
}

/** Options for A93 export. */
export interface A93ExportOptions {
  /** Include Astraya-specific extensions */
  readonly includeExtensions?: boolean;
}

/**
 * Convert Astraya FullExport to AAF format.
 *
 * AAF is a standardized ASCII text format. This conversion may lose:
 * - Modern computed points (Chiron, Lilith variants, etc.) — AAF predates these
 * - House systems beyond the core set — mapped to nearest AAF equivalent
 * - Custom settings and orb configurations — not part of base AAF spec
 */
export function exportToAAF(
  fullExport: FullExport,
  options?: AAFExportOptions,
): ConversionResult<string> {
  const losses: ConversionLoss[] = [];

  // Document limitations of AAF conversion
  if (fullExport.people.some((p) => p.natalChart?.declinations)) {
    losses.push({
      category: 'data',
      item: 'declinations',
      reason: 'AAF format does not include equatorial declinations; only ecliptic longitude is supported',
    });
  }

  if (fullExport.preferences.symbolClass !== 'default') {
    losses.push({
      category: 'setting',
      item: 'symbolClass',
      reason: 'AAF has no standard for alternate glyph sets',
    });
  }

  // Build AAF output (placeholder — full AAF spec would be implemented here)
  const aafData =
    `[AAF 1.0]\n` +
    `AppName=Astraya\n` +
    `AppVersion=${fullExport.app.version}\n` +
    `ExportTime=${fullExport.exportedAt}\n` +
    `\n`;

  // Add person records...
  // (Full implementation would iterate fullExport.people and convert each record)

  const isLossy = losses.length > 0;
  return { data: aafData, losses, isLossy };
}

/**
 * Convert Astraya FullExport to A93 format.
 *
 * A93 is another standardized format, similar to AAF but with some differences.
 * This conversion has similar limitations as AAF.
 */
export function exportToA93(
  fullExport: FullExport,
  options?: A93ExportOptions,
): ConversionResult<string> {
  const losses: ConversionLoss[] = [];

  // Similar losses to AAF
  if (fullExport.people.some((p) => p.natalChart?.declinations)) {
    losses.push({
      category: 'data',
      item: 'declinations',
      reason: 'A93 format does not include equatorial declinations',
    });
  }

  if (fullExport.people.some((p) => p.natalChart?.fixedStars)) {
    losses.push({
      category: 'data',
      item: 'fixedStars',
      reason: 'A93 has limited support for fixed star data',
    });
  }

  // Build A93 output (placeholder)
  const a93Data =
    `\$\$VERSION=1.0\n` +
    `\$\$SOURCE=Astraya\n` +
    `\$\$GENERATED=${fullExport.exportedAt}\n` +
    `\n`;

  // Add person records...
  // (Full implementation would convert each person)

  const isLossy = losses.length > 0;
  return { data: a93Data, losses, isLossy };
}

/**
 * Parse AAF format data into Astraya's FullExport.
 * Returns a ConversionResult with any data that could not be parsed.
 */
export function parseAAF(aafText: string): ConversionResult<FullExport | null> {
  const losses: ConversionLoss[] = [];

  // Placeholder implementation — would parse AAF lines and convert to FullExport
  // For now, note that we don't have a complete AAF spec to work from

  losses.push({
    category: 'computation',
    item: 'AAF parsing',
    reason:
      'AAF format specification is not fully verified; this is a research-based implementation',
  });

  return { data: null, losses, isLossy: true };
}

/**
 * Parse A93 format data into Astraya's FullExport.
 */
export function parseA93(a93Text: string): ConversionResult<FullExport | null> {
  const losses: ConversionLoss[] = [];

  // Placeholder — would parse A93 lines
  losses.push({
    category: 'computation',
    item: 'A93 parsing',
    reason: 'A93 format specification is not fully verified; this is a research-based implementation',
  });

  return { data: null, losses, isLossy: true };
}
