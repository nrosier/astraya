/**
 * Which class of symbols the charts draw (#419): the hand-drawn vector glyphs (the default), the
 * Unicode astrological characters, or plain three-letter text.
 *
 * Held as module state rather than threaded through every renderer. The renderers here are
 * synchronous functions that all end in `renderGlyph`, and there are a dozen of them (the wheel, the
 * bi-wheels, the aspect grid, the degree strip, the emphasis grid, the cycle and shape diagrams); one
 * setting that every one of them has to honour is exactly what a parameter on each would get wrong
 * the day one is added. The default is `drawn`, so a renderer used on its own, as every unit test
 * does, behaves as before. The screens subscribe (`useSymbolClass` in `src/ui/symbol-setting.ts`) so
 * a change redraws them, and each is redrawn by its own render, never from a stale cache.
 */
export type SymbolClass = 'drawn' | 'unicode' | 'text';

export const SYMBOL_CLASSES: readonly SymbolClass[] = ['drawn', 'unicode', 'text'];

export const DEFAULT_SYMBOL_CLASS: SymbolClass = 'drawn';

export function isSymbolClass(value: unknown): value is SymbolClass {
  return typeof value === 'string' && (SYMBOL_CLASSES as readonly string[]).includes(value);
}

let current: SymbolClass = DEFAULT_SYMBOL_CLASS;
const listeners = new Set<() => void>();

export function getSymbolClass(): SymbolClass {
  return current;
}

export function setSymbolClass(next: SymbolClass): void {
  if (next === current) return;
  current = next;
  for (const listener of [...listeners]) listener();
}

export function subscribeSymbolClass(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
