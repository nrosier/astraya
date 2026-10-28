/**
 * @module ui/fixed-star-draft
 * @purpose The Extended settings drawer's staged list of chosen fixed stars (#803, D-803e): turning a catalogue search result into a stored selection, adding, removing, the seven-star preset, and whether the draft differs from what the person has saved.
 * @conventions Pure functions over immutable lists, so the drawer's draft can be tested without React. A selection stores the Swiss identifier (`swissStarId`), the record's own equinox and the SHA-256 of the file it was chosen from (D-803c); nothing interpretive. Identity is the Swiss identifier: a star is in a list at most once.
 * @exports chosenStarOf, withStarAdded, withStarRemoved, withPresetStars, sameChosenStars, chosenStarLabel, serializeFixedStars, PRESET_STAR_NAMES
 */
import { NATAL_FIXED_STARS } from '../domain/chart-compute.js';
import type { ChosenFixedStar } from '../domain/person.js';
import { swissStarId, type StarCatalogueEntry } from '../ephemeris/star-catalogue.js';
import type { JsonValue } from '../store/ops.js';

/** The seven-star preset (#398), the one list the chart checks when no star is chosen. */
export const PRESET_STAR_NAMES: readonly string[] = NATAL_FIXED_STARS;

/** A catalogue record as a selection made now, from the file whose hash is `sourceSha256`. */
export function chosenStarOf(entry: StarCatalogueEntry, sourceSha256: string): ChosenFixedStar {
  return {
    id: swissStarId(entry),
    name: entry.name,
    designation: entry.designation,
    equinox: entry.equinox,
    sourceSha256,
  };
}

/** The name a reader sees for a chosen star: its traditional name, or its designation when it has none. */
export function chosenStarLabel(star: Pick<ChosenFixedStar, 'name' | 'designation'>): string {
  return star.name === '' ? star.designation : star.name;
}

/** The list with `star` appended, unchanged when a star with the same identifier is already in it. */
export function withStarAdded(stars: readonly ChosenFixedStar[], star: ChosenFixedStar): readonly ChosenFixedStar[] {
  return stars.some((chosen) => chosen.id === star.id) ? stars : [...stars, star];
}

/** The list without the star whose identifier is `id`. */
export function withStarRemoved(stars: readonly ChosenFixedStar[], id: string): readonly ChosenFixedStar[] {
  return stars.filter((star) => star.id !== id);
}

/**
 * The list with every preset star added that is not already in it (#803): each preset name resolved to the first
 * catalogue record that carries it, the record Swiss Ephemeris itself finds for that name. A preset name the
 * catalogue lacks is skipped, never invented.
 */
export function withPresetStars(
  stars: readonly ChosenFixedStar[],
  entries: readonly StarCatalogueEntry[],
  sourceSha256: string,
): readonly ChosenFixedStar[] {
  let next = stars;
  for (const name of PRESET_STAR_NAMES) {
    const entry = entries.find((candidate) => candidate.name === name);
    if (entry !== undefined) next = withStarAdded(next, chosenStarOf(entry, sourceSha256));
  }
  return next;
}

/** Whether the draft holds the same stars, in the same order, as the saved list. */
export function sameChosenStars(draft: readonly ChosenFixedStar[], saved: readonly ChosenFixedStar[]): boolean {
  return (
    draft.length === saved.length &&
    draft.every((star, index) => {
      const other = saved[index];
      return (
        other?.id === star.id &&
        star.name === other.name &&
        star.designation === other.designation &&
        star.equinox === other.equinox &&
        star.sourceSha256 === other.sourceSha256
      );
    })
  );
}

/**
 * The value written to a person's `fixedStars` register (#803): exactly the fields `readFixedStars` reads. Kept out
 * of `domain/person.ts`, which is in the eager bundle, since only the chart screen's drawer ever writes it.
 */
export function serializeFixedStars(stars: readonly ChosenFixedStar[]): JsonValue {
  return stars.map((star) => ({
    id: star.id,
    name: star.name,
    designation: star.designation,
    equinox: star.equinox,
    sourceSha256: star.sourceSha256,
  }));
}
