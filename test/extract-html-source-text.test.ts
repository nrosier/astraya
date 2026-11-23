/**
 * The html-to-text conversion behind scripts/extract-html-source-text.mjs (#1798): tags and script/style content are
 * dropped, table cells stay separated, <pre> columns survive, entities are decoded, and the CLI writes <id>.txt.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs script without type declarations
import { htmlToText } from '../scripts/extract-html-source-text.mjs';

const convert = htmlToText as (html: string) => string;

describe('htmlToText', () => {
  it('drops tags and keeps the visible text', () => {
    expect(convert('<p>Full <b>Moon</b> <a href="x">Mar 8</a></p>')).toBe('Full Moon Mar 8\n');
  });

  it('drops script and style content, and comments', () => {
    const html = '<style>.a{color:red}</style><script>var x = "Jan 1 00:00";</script><!-- hidden --><p>kept</p>';
    expect(convert(html)).toBe('kept\n');
  });

  it('keeps the cells of a table row separated', () => {
    const out = convert('<table><tr><td>Mar 8</td><td>13:10</td></tr><tr><td>Mar 22</td><td>21:05</td></tr></table>');
    expect(out.split('\n')[0]).toBe('Mar 8\t13:10');
    expect(out).toContain('Mar 22\t21:05');
  });

  it('decodes entities', () => {
    expect(convert('<p>A&nbsp;&amp;&nbsp;B &lt;ok&gt; &#916;T &#x41;</p>')).toBe('A & B <ok> ΔT A\n');
  });

  it('keeps the column spacing and line breaks inside <pre>', () => {
    const out = convert('<pre>\n Feb 21  04:03     Mar  1  07:59\n<span>Mar 22</span>  21:05\n</pre>');
    expect(out).toContain('Feb 21  04:03     Mar  1  07:59\nMar 22  21:05');
  });
});

describe('extract-html-source-text CLI', () => {
  it('writes <id>.txt and prints the input sha256', () => {
    const dir = mkdtempSync(join(tmpdir(), 'html-text-'));
    const html = join(dir, 'in.html');
    writeFileSync(html, '<html><body><script>x()</script><p>New Moon&nbsp;Feb 21</p></body></html>');
    const stdout = execFileSync('node', ['scripts/extract-html-source-text.mjs', html, dir, 'out'], {
      encoding: 'utf8',
    });
    expect(stdout).toMatch(/^[0-9a-f]{64} {2}/);
    expect(readFileSync(join(dir, 'out.txt'), 'utf8')).toBe('New Moon Feb 21\n');
  });
});
