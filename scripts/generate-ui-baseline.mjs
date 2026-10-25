/**
 * Writes the UI behaviour baseline (#507): what the end-to-end suite pins about the app's routes, inputs, outputs,
 * selection, exports and persistence, grouped by area, from the test titles themselves — so the record cannot drift
 * from the tests it describes. Run `node scripts/generate-ui-baseline.mjs` after the suite changes.
 *
 * Output: docs/ui/UI-UX_BASELINE.md and its HTML counterpart docs/html/UI-UX_BASELINE.html (HTML-first docs policy).
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const E2E_DIR = 'e2e';
const AREAS = [
  ['Routes and navigation', /app-nav|app-header|person-nav|about-primer/],
  ['Inputs: the birth record and place', /person-form|birth-place|golden-path\.spec|multi-device/],
  ['Chart workspace and selection', /chart-|extended-settings|symbol-setting|rulership/],
  [
    'Calculation screens',
    /cycles|eclipses|electional|horary|rectification|progressions|profections|solar-arc|transit|synastry|composite|harmonic|draconic|astrocartography|periodic/,
  ],
  ['Exports and documents', /pdf-export/],
  ['Preferences, accounts and persistence', /preferences|admin-roles|control-states|accessibility/],
];

function titlesOf(file) {
  const source = readFileSync(join(E2E_DIR, file), 'utf-8');
  const titles = [];
  for (const match of source.matchAll(/^test\(\s*(['"`])([\s\S]*?)\1\s*,/gm)) {
    titles.push(match[2].replace(/\s+/g, ' ').trim());
  }
  return titles;
}

const files = readdirSync(E2E_DIR)
  .filter((name) => name.endsWith('.spec.ts'))
  .sort();
const grouped = new Map(AREAS.map(([name]) => [name, []]));
const other = [];
for (const file of files) {
  const entry = { file, titles: titlesOf(file) };
  const area = AREAS.find(([, pattern]) => pattern.test(file));
  if (area === undefined) other.push(entry);
  else grouped.get(area[0]).push(entry);
}
if (other.length > 0) grouped.set('Other', other);

const total = [...grouped.values()].flat().reduce((sum, entry) => sum + entry.titles.length, 0);
const intro = [
  `The end-to-end suite pins ${String(total)} behaviours across ${String(files.length)} specs (Playwright, against the built \`dist/\`).`,
  'This is the behaviour any redesign must keep, or change on purpose with the test changed in the same commit.',
  'Each line is a test title, so the record is the tests; regenerate with `node scripts/generate-ui-baseline.mjs`.',
  'Persisted person data is the compatibility boundary (docs/ui/UI-UX_IMPLEMENTATION_PLAN.md §4); routes and UI are not.',
];

const md = ['# UI behaviour baseline', '', ...intro.map((line) => line), ''];
for (const [area, entries] of grouped) {
  md.push(`## ${area}`, '');
  for (const { file, titles } of entries) {
    md.push(`### \`e2e/${file}\``, '', ...titles.map((title) => `- ${title}`), '');
  }
}
writeFileSync('docs/ui/UI-UX_BASELINE.md', md.join('\n').replace(/\n+$/, '\n'));

const esc = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (text) => esc(text).replace(/`([^`]+)`/g, '<code>$1</code>');
const style = /<style>[\s\S]*?<\/style>/.exec(readFileSync('docs/html/CORPUS_KEYS.html', 'utf-8'))?.[0] ?? '';
const body = ['<h1>UI behaviour baseline</h1>', ...intro.map((line) => `<p>${inline(line)}</p>`)];
for (const [area, entries] of grouped) {
  body.push(`<h2>${esc(area)}</h2>`);
  for (const { file, titles } of entries) {
    body.push(
      `<h3><code>e2e/${esc(file)}</code></h3>`,
      '<ul>',
      ...titles.map((title) => `<li>${inline(title)}</li>`),
      '</ul>',
    );
  }
}
writeFileSync(
  'docs/html/UI-UX_BASELINE.html',
  [
    '<!doctype html>',
    '<html lang="en">',
    '  <head>',
    '    <meta charset="UTF-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '    <title>UI behaviour baseline</title>',
    style,
    '  </head>',
    '  <body>',
    '    <main>',
    body.join('\n'),
    '    </main>',
    '  </body>',
    '</html>',
    '',
  ].join('\n'),
);
console.log(`${String(total)} behaviours in ${String(files.length)} specs`);
