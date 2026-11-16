/**
 * The app icons are named in index.html (favicon and apple-touch-icon links) and in
 * public/manifest.webmanifest (install icons). A renamed or deleted file would leave
 * the browser tab or the installed app without an icon, with no build error. These
 * tests check that every path named in those two files exists under public/ and is a
 * PNG of the size it claims.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const indexHtml = readFileSync(resolve(root, 'index.html'), 'utf8');
const manifest = JSON.parse(readFileSync(resolve(root, 'public', 'manifest.webmanifest'), 'utf8')) as {
  icons: { src: string; sizes: string }[];
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Read width and height from the IHDR chunk (bytes 16 to 23, big-endian). */
function pngSize(bytes: Buffer): { width: number; height: number } {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** Icon links in index.html, with the declared sizes (e.g. "32x32"). */
function htmlIcons(): { href: string; sizes: string | undefined }[] {
  const links = [...indexHtml.matchAll(/<link\s[^>]*rel="(?:icon|apple-touch-icon)"[^>]*>/g)];
  return links.map(([tag]) => {
    const href = /href="%BASE_URL%([^"]+)"/.exec(tag)?.[1];
    if (href === undefined) throw new Error(`icon link has no %BASE_URL% href: ${tag}`);
    return { href, sizes: /sizes="([^"]+)"/.exec(tag)?.[1] };
  });
}

/** Expected pixel size per icon, from the file names that index.html and the manifest use. */
const expectedSize: Record<string, number> = {
  'icons/favicon-16.png': 16,
  'icons/favicon-32.png': 32,
  'icons/apple-touch-icon.png': 180,
  'icons/icon-192.png': 192,
  'icons/icon-512.png': 512,
  'icons/maskable-512.png': 512,
};

describe('app icons', () => {
  const html = htmlIcons();
  const manifestIcons = manifest.icons.map((icon) => ({ href: icon.src.replace(/^\//, ''), sizes: icon.sizes }));

  it('index.html links at least the favicon and apple-touch-icon', () => {
    const hrefs = html.map((icon) => icon.href);
    expect(hrefs).toEqual(
      expect.arrayContaining(['icons/favicon-32.png', 'icons/favicon-16.png', 'icons/apple-touch-icon.png']),
    );
  });

  it.each([...html, ...manifestIcons].map((icon) => icon.href))(
    '%s exists and is a PNG of the expected size',
    (href) => {
      const bytes = readFileSync(resolve(root, 'public', href));
      expect([...bytes.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
      const size = pngSize(bytes);
      const want = expectedSize[href];
      expect(want, `no expected size recorded for ${href}`).toBeDefined();
      expect(size).toEqual({ width: want, height: want });
    },
  );

  it('declared sizes in index.html and the manifest match the PNG dimensions', () => {
    for (const icon of [...html, ...manifestIcons]) {
      if (icon.sizes === undefined) continue;
      const bytes = readFileSync(resolve(root, 'public', icon.href));
      const size = pngSize(bytes);
      expect(icon.sizes).toBe(`${size.width}x${size.height}`);
    }
  });
});
