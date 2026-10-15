/**
 * Validates and imports FullExport data, detecting conflicts with existing records.
 *
 * An import operation must be strictly validated: reject unsupported schema versions,
 * validate all required fields are present, check for conflicts before applying changes.
 * This module provides the validation layer before any data is persisted (#587).
 */

/**
 * @module domain/full-export-importer
 * @purpose Validates and imports FullExport data with strict schema checking and conflict detection.
 * @conventions Strict validation rejects unsupported versions and incomplete records; conflict detection compares against existing person IDs; always perform validation before persistence.
 * @exports validateFullExport, ImportConflict, ImportValidationResult, detectConflicts
 */

import { CURRENT_SNAPSHOT_VERSION, validateSnapshotVersion } from './calculation-snapshot.js';
import type { FullExport, ExportedPerson } from './full-export.js';

/** A conflict detected during import validation. */
export interface ImportConflict {
  readonly type: 'version-mismatch' | 'schema-violation' | 'duplicate-person' | 'incomplete-person';
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly personId?: string;
  readonly field?: string;
}

/** Result of validating a FullExport for import. */
export interface ImportValidationResult {
  readonly valid: boolean;
  readonly conflicts: readonly ImportConflict[];
  /** Export is valid despite warnings (conflicts with severity 'warning' only). */
  readonly importable: boolean;
}

/**
 * Validate a FullExport object for import.
 * Checks schema version, required fields, and structural integrity.
 * Errors (version mismatches, missing fields) prevent import.
 * Warnings (incomplete person records) allow import with user acknowledgement.
 */
export function validateFullExport(data: unknown): ImportValidationResult {
  const conflicts: ImportConflict[] = [];

  if (typeof data !== 'object' || data === null) {
    conflicts.push({
      type: 'schema-violation',
      severity: 'error',
      message: 'Export data must be an object',
    });
    return { valid: false, conflicts, importable: false };
  }

  const export_ = data as Record<string, unknown>;

  // Check format
  if (export_.format !== 'astraya-export') {
    conflicts.push({
      type: 'schema-violation',
      severity: 'error',
      message: `Invalid export format: expected 'astraya-export', got '${String(export_.format)}'`,
    });
  }

  // Check version
  if (!validateSnapshotVersion(export_.version)) {
    conflicts.push({
      type: 'version-mismatch',
      severity: 'error',
      message: `Unsupported export version: ${String(export_.version)}. This app supports version ${CURRENT_SNAPSHOT_VERSION}.`,
    });
  }

  // Check required top-level fields
  if (typeof export_.exportedAt !== 'string') {
    conflicts.push({
      type: 'schema-violation',
      severity: 'error',
      message: 'Export missing or invalid exportedAt timestamp',
      field: 'exportedAt',
    });
  }

  if (typeof export_.app !== 'object' || export_.app === null) {
    conflicts.push({
      type: 'schema-violation',
      severity: 'error',
      message: 'Export missing or invalid app metadata',
      field: 'app',
    });
  }

  // Check people array
  if (!Array.isArray(export_.people)) {
    conflicts.push({
      type: 'schema-violation',
      severity: 'error',
      message: 'Export people field must be an array',
      field: 'people',
    });
    return { valid: conflicts.filter((c) => c.severity === 'error').length === 0, conflicts, importable: false };
  }

  // Validate each person
  const seenIds = new Set<string>();
  (export_.people as unknown[]).forEach((person: unknown, index: number) => {
    if (typeof person !== 'object' || person === null) {
      conflicts.push({
        type: 'schema-violation',
        severity: 'error',
        message: `Person at index ${index} is not an object`,
      });
      return;
    }

    const p = person as Record<string, unknown>;
    if (typeof p.id !== 'string' || !p.id) {
      conflicts.push({
        type: 'schema-violation',
        severity: 'error',
        message: `Person at index ${index} missing or invalid id`,
      });
      return;
    }

    // Check for duplicates within the export
    if (seenIds.has(p.id)) {
      conflicts.push({
        type: 'duplicate-person',
        severity: 'error',
        message: `Duplicate person ID in export: ${p.id}`,
        personId: p.id,
      });
    }
    seenIds.add(p.id);

    // Check required person fields
    if (typeof p.displayName !== 'string') {
      conflicts.push({
        type: 'schema-violation',
        severity: 'warning',
        message: `Person ${p.id} missing displayName`,
        personId: p.id,
        field: 'displayName',
      });
    }

    if (typeof p.placeLabel !== 'string') {
      conflicts.push({
        type: 'incomplete-person',
        severity: 'warning',
        message: `Person ${p.id} missing placeLabel`,
        personId: p.id,
        field: 'placeLabel',
      });
    }

    // birth and natalChart are optional but should be checked for consistency
    if (typeof p.birth !== 'object' && p.birth !== undefined) {
      conflicts.push({
        type: 'schema-violation',
        severity: 'warning',
        message: `Person ${p.id} has invalid birth field`,
        personId: p.id,
        field: 'birth',
      });
    }
  });

  const hasErrors = conflicts.some((c) => c.severity === 'error');
  return {
    valid: !hasErrors,
    conflicts,
    importable: !hasErrors,
  };
}

/**
 * Detect conflicts between export people and existing person IDs.
 * Returns conflicts for any duplicates found in the existing person set.
 */
export function detectConflicts(
  exportData: FullExport,
  existingPersonIds: Set<string>,
): readonly ImportConflict[] {
  const conflicts: ImportConflict[] = [];

  exportData.people.forEach((person) => {
    if (existingPersonIds.has(person.id)) {
      conflicts.push({
        type: 'duplicate-person',
        severity: 'warning',
        message: `Person ${person.id} (${person.displayName || 'unnamed'}) already exists. Importing will update existing record.`,
        personId: person.id,
      });
    }
  });

  return conflicts;
}
