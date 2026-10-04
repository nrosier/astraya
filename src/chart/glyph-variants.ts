/**
 * Symbols that astrologers draw in two recognised ways (#419): which form of each is drawn, on this device.
 *
 * Only forms with a documented second shape are here. Uranus is ♅ (the H with a ball, drawn today) or ⛢ (the
 * astronomical symbol, a circle with a dot and an arrow); Pluto is the orb over a crescent over a cross (drawn
 * today, Unicode "Pluto form two") or the PL monogram ♇. Chiron's key already is the K and O monogram, and no
 * second form of Lilith or the nodes has a source, so none is invented for them.
 *
 * The registry type is the enforcer: an alternate form cannot be added without its drawn elements, its Unicode
 * character and its text code, so a variant never draws nothing in another symbol class. The default form of each
 * body stays in `glyphs.ts` (where the drawn artwork it came from lives); this holds the alternates, the choice, and
 * the state the renderers read, held as module state like the symbol class (`symbol-class.ts`) for the same reason.
 */
export type VariantBody = 'uranus' | 'pluto';

/** One alternate form, in all three symbol classes. */
export interface VariantForm {
  /** Raw `<path>`/`<circle>` tags in the same 0-100 box as every other glyph. */
  readonly elements: readonly string[];
  readonly unicode: string;
  readonly text: string;
}

/** The form drawn today for each body, which a device that never chooses keeps. */
export const VARIANT_DEFAULTS = { uranus: 'h', pluto: 'orb' } as const satisfies Record<VariantBody, string>;

export const VARIANT_KEYS = {
  uranus: ['h', 'astronomical'],
  pluto: ['orb', 'monogram'],
} as const satisfies Record<VariantBody, readonly string[]>;

export type VariantChoice = Readonly<Record<VariantBody, string>>;

export const VARIANT_BODIES: readonly VariantBody[] = ['uranus', 'pluto'];

/**
 * The alternates (every key but the default). The Unicode character of both Pluto forms is ♇: the orb form's own
 * character (U+2BD3) is missing from most fonts, and a Unicode symbol class that drew a blank box would be worse
 * than one that cannot tell the two apart.
 */
export const ALTERNATE_FORMS: Readonly<Record<VariantBody, Readonly<Record<string, VariantForm>>>> = {
  uranus: {
    astronomical: {
      elements: [
        '<circle cx="50" cy="68" r="18" />',
        '<circle cx="50" cy="68" r="4" class="glyph-fill" />',
        '<path d="M50 50 L50 12" />',
        '<path d="M37 26 L50 12 L63 26" />',
      ],
      unicode: '⛢',
      text: 'URA',
    },
  },
  pluto: {
    monogram: {
      elements: [
        '<path d="M32 86 L32 14" />',
        '<path d="M32 14 L50 14 C74 14 74 50 50 50 L32 50" />',
        '<path d="M32 86 L68 86" />',
      ],
      unicode: '♇',
      text: 'PLU',
    },
  },
};

export function isVariantBody(value: unknown): value is VariantBody {
  return value === 'uranus' || value === 'pluto';
}

export function isVariantKey(body: VariantBody, value: unknown): boolean {
  return typeof value === 'string' && (VARIANT_KEYS[body] as readonly string[]).includes(value);
}

let current: VariantChoice = { ...VARIANT_DEFAULTS };
const listeners = new Set<() => void>();

export function getVariantChoice(): VariantChoice {
  return current;
}

/** The alternate form chosen for a body, or `undefined` when its default is. */
export function chosenAlternate(body: string): VariantForm | undefined {
  if (!isVariantBody(body)) return undefined;
  const key = current[body];
  return key === VARIANT_DEFAULTS[body] ? undefined : ALTERNATE_FORMS[body][key];
}

export function setVariant(body: VariantBody, key: string): void {
  if (!isVariantKey(body, key) || current[body] === key) return;
  current = { ...current, [body]: key };
  for (const listener of [...listeners]) listener();
}

/** Replaces the whole choice (loading a saved one), ignoring any key that is not a known form. */
export function setVariantChoice(next: Partial<Record<VariantBody, unknown>>): void {
  for (const body of VARIANT_BODIES) {
    const key = next[body];
    setVariant(body, isVariantKey(body, key) ? (key as string) : VARIANT_DEFAULTS[body]);
  }
}

export function subscribeVariantChoice(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
