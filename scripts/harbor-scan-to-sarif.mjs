#!/usr/bin/env node
/**
 * @module scripts/harbor-scan-to-sarif
 * @purpose Convert a Harbor vulnerability scan report into SARIF 2.1.0 so GitHub code scanning can show each CVE.
 * @conventions Reads a Harbor scan report JSON file (the body of GET /api/v2.0/projects/{p}/repositories/{r}/artifacts/{tag}/additions/vulnerabilities) and writes SARIF to stdout. Exits non-zero on malformed input. No network access.
 * @exports main (run when executed directly)
 */
import { readFileSync } from 'node:fs';

/**
 * Map a Harbor severity word to a SARIF level.
 * @param {string} severity
 * @returns {'error' | 'warning' | 'note'}
 */
export function sarifLevel(severity) {
  const s = String(severity).toLowerCase();
  if (s === 'critical' || s === 'high') return 'error';
  if (s === 'medium') return 'warning';
  return 'note';
}

/**
 * Build a SARIF log from a parsed Harbor vulnerability report.
 * @param {unknown} report Parsed JSON, expected shape { vulnerabilities: [...] }.
 * @returns {object} SARIF 2.1.0 log.
 */
export function harborReportToSarif(report) {
  if (typeof report !== 'object' || report === null || !Array.isArray(report.vulnerabilities)) {
    throw new Error('Harbor report has no vulnerabilities array');
  }
  const rules = new Map();
  const results = [];
  for (const v of report.vulnerabilities) {
    const id = String(v.id ?? '').trim();
    if (id === '') continue;
    if (!rules.has(id)) {
      rules.set(id, {
        id,
        shortDescription: { text: id },
        fullDescription: { text: String(v.description ?? id) },
        helpUri: v.links?.[0] ?? `https://nvd.nist.gov/vuln/detail/${id}`,
        properties: { 'security-severity': severityScore(v.severity) },
      });
    }
    const pkg = String(v.package ?? 'unknown');
    const version = String(v.version ?? 'unknown');
    const fix = v.fix_version ? ` Fixed in ${v.fix_version}.` : ' No fixed version listed.';
    results.push({
      ruleId: id,
      level: sarifLevel(v.severity),
      message: { text: `${pkg} ${version} is affected by ${id} (${v.severity ?? 'unknown'}).${fix}` },
      locations: [{ physicalLocation: { artifactLocation: { uri: 'Dockerfile' } } }],
    });
  }
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [{ tool: { driver: { name: 'Harbor', rules: [...rules.values()] } }, results }],
  };
}

/**
 * Numeric score GitHub uses to rank a rule (security-severity).
 * @param {string | undefined} severity
 * @returns {string}
 */
function severityScore(severity) {
  switch (String(severity).toLowerCase()) {
    case 'critical':
      return '9.0';
    case 'high':
      return '7.0';
    case 'medium':
      return '5.0';
    case 'low':
      return '2.0';
    default:
      return '0.0';
  }
}

/**
 * CLI entry: node scripts/harbor-scan-to-sarif.mjs <report.json>
 * @returns {void}
 */
function main() {
  const file = process.argv[2];
  if (!file) {
    process.stderr.write('usage: harbor-scan-to-sarif.mjs <report.json>\n');
    process.exit(2);
  }
  const report = JSON.parse(readFileSync(file, 'utf8'));
  process.stdout.write(JSON.stringify(harborReportToSarif(report), null, 2) + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
