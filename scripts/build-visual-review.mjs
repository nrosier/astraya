// Builds the owner's visual review page (docs/ops/VISUAL-REVIEW.md): one HTML file with every screen in
// e2e/visual-review-screens.json at 390, 1920 and 1280 in light and dark, taken from the screenshots a
// `VISUAL_REVIEW_OUT=<dir> npx playwright test e2e/visual-review.spec.ts` run wrote, each with a verdict row and a box
// that copies the owner's notes back. Usage: node scripts/build-visual-review.mjs <screenshot-dir> <out.html> [slug,slug,...]
// The optional list keeps only those screens, so a review of what changed stays under the 16 MB artifact limit.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir, out, only] = process.argv.slice(2);
if (dir === undefined || out === undefined) {
  console.error('usage: node scripts/build-visual-review.mjs <screenshot-dir> <out.html>');
  process.exit(2);
}

const wanted = only === undefined ? undefined : only.split(',').map((slug) => slug.trim());
const screens = JSON.parse(readFileSync(new URL('../e2e/visual-review-screens.json', import.meta.url), 'utf8')).filter(
  ({ slug }) => wanted === undefined || wanted.some((prefix) => slug === prefix || slug.startsWith(`${prefix}-`)),
);
if (screens.length === 0) {
  // The screen list is empty when no review is needed (it is local and git-ignored). Fail clearly rather than write a blank page.
  console.error('No screens to build. Fill e2e/visual-review-screens.json for a review, then run again.');
  process.exit(1);
}
const template = readFileSync(new URL('./visual-review-template.html', import.meta.url), 'utf8');
const SIZES = [
  ['390', 'Phone 390'],
  ['1280', 'Laptop 1280'],
  ['1920', 'Desktop 1920'],
];
const THEMES = ['light', 'dark'];
const escape = (text) =>
  String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const uri = (name) => `data:image/jpeg;base64,${readFileSync(join(dir, name)).toString('base64')}`;

const cards = screens.map(({ slug, title, issues, check }) => {
  const rows = THEMES.map((theme) => {
    const figures = SIZES.flatMap(([size, label]) => {
      const name = `${slug}__${size}__${theme}.jpg`;
      if (!existsSync(join(dir, name))) return [];
      const id = `${slug}-${size}-${theme}`;
      return [
        `<figure class="shot s${size}"><button type="button" class="zoom" data-src-id="${id}" aria-label="Enlarge ${escape(title)}, ${label}, ${theme}">` +
          `<img id="${id}" loading="lazy" alt="${escape(title)} at ${label}, ${theme} theme" src="${uri(name)}"></button>` +
          `<figcaption>${label}</figcaption></figure>`,
      ];
    });
    return `<div class="theme-row" data-theme-row="${theme}"><h4>${theme[0].toUpperCase()}${theme.slice(1)}</h4><div class="shots">${figures.join('')}</div></div>`;
  });
  return (
    `<section class="screen" id="${slug}"><header><h3>${escape(title)}</h3><span class="issue">${escape(issues)}</span></header>` +
    `<p class="note">${escape(check)}</p>${rows.join('')}` +
    `<div class="verdict" role="group" aria-label="Verdict for ${escape(title)}">` +
    `<label><input type="radio" name="v-${slug}" value="ok"> Looks right</label>` +
    `<label><input type="radio" name="v-${slug}" value="change"> Needs a change</label>` +
    `<input type="text" id="n-${slug}" class="comment" placeholder="What should change?" aria-label="Comment for ${escape(title)}"></div></section>`
  );
});
const nav = screens.map(({ slug, title }) => `<a href="#${slug}">${escape(title)}</a>`).join('');
writeFileSync(out, template.replace('{{NAV}}', nav).replace('{{CARDS}}', cards.join('')));
console.log(`wrote ${out}`);
