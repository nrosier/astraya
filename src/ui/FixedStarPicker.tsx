/**
 * @module FixedStarPicker
 * @purpose The fixed-star picker in the Extended settings drawer's Special points tab (#803): search the shipped star file by name or designation (results show the magnitude), add and remove stars, the seven-star preset, the read-only uncited 1.0° conjunction orb and the source-file line.
 * @conventions Controlled: the drawer owns the staged list (`stars`) and commits it on Apply (D-803e); this component only proposes a new list through `onChange`. The catalogue is loaded through `loadCatalogue` (injectable for tests) when the drawer opens. Names and designations only: no interpretive text (#803 task 4). The orb is `USER_STAR_CONJUNCTION_ORB_DEGREES`, shown, never editable (D-803d).
 * @exports FixedStarPicker
 */
import { useEffect, useId, useState } from 'react';
import type { ChosenFixedStar } from '../domain/person.js';
import { FIXED_STARS_ASSET } from '../ephemeris/assets.js';
import {
  searchStarCatalogue,
  STAR_SEARCH_LIMIT,
  swissStarId,
  USER_STAR_CONJUNCTION_ORB_DEGREES,
} from '../ephemeris/star-catalogue.js';
import {
  chosenStarLabel,
  chosenStarOf,
  PRESET_STAR_NAMES,
  withPresetStars,
  withStarAdded,
  withStarRemoved,
} from './fixed-star-draft.js';
import { fixedStarPickerMessages } from './FixedStarPicker.messages.js';
import { formatDecimal, formatFixed, formatInteger } from './format.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { Badge } from './primitives/Badge.js';
import { Button } from './primitives/Button.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { TextField } from './primitives/TextField.js';
import { SortableTable } from './SortableTable.js';
import type { LoadedStarCatalogue } from './star-catalogue-source.js';
import type { TableColumn } from './table-sort.js';

type CatalogueLoad =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly catalogue: LoadedStarCatalogue }
  | { readonly kind: 'error'; readonly message: string };

/** How many hex digits of the file's SHA-256 the source line shows. */
const HASH_PREFIX_LENGTH = 8;

export function FixedStarPicker({
  stars,
  saved,
  onChange,
  loadCatalogue,
}: {
  /** The drawer's staged list. */
  readonly stars: readonly ChosenFixedStar[];
  /** The list saved on the person, so a staged addition can say it is a draft. */
  readonly saved: readonly ChosenFixedStar[];
  readonly onChange: (next: readonly ChosenFixedStar[]) => void;
  readonly loadCatalogue: () => Promise<LoadedStarCatalogue>;
}): React.JSX.Element {
  const t = useMessages(fixedStarPickerMessages);
  const [locale] = useLocale();
  const [query, setQuery] = useState('');
  const [load, setLoad] = useState<CatalogueLoad>({ kind: 'loading' });
  const resultsId = useId();

  useEffect(() => {
    const effect = { cancelled: false };
    loadCatalogue().then(
      (catalogue) => {
        if (!effect.cancelled) setLoad({ kind: 'ready', catalogue });
      },
      (error: unknown) => {
        if (!effect.cancelled)
          setLoad({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      },
    );
    return () => {
      effect.cancelled = true;
    };
  }, [loadCatalogue]);

  const catalogue = load.kind === 'ready' ? load.catalogue : undefined;
  const chosenIds = new Set(stars.map((star) => star.id));
  const savedIds = new Set(saved.map((star) => star.id));
  const trimmed = query.trim();
  const results = catalogue === undefined ? [] : searchStarCatalogue(catalogue.entries, trimmed);
  // Always one decimal ("1.0", "1,0"), as D-803d states the orb; `formatDecimal` would drop the trailing zero.
  const orbText = formatFixed(USER_STAR_CONJUNCTION_ORB_DEGREES, 1).replace('.', locale === 'nl' ? ',' : '.');

  const columns: readonly TableColumn<ChosenFixedStar>[] = [
    {
      key: 'star',
      label: t.columnStar,
      sortable: false,
      valueOf: (star) => chosenStarLabel(star),
      renderCell: (star) => (
        <>
          {chosenStarLabel(star)}
          {!savedIds.has(star.id) && <span className="settings-card-draft-tag">{t.draftTag}</span>}
        </>
      ),
    },
    { key: 'designation', label: t.columnDesignation, sortable: false, valueOf: (star) => star.designation },
    {
      key: 'orb',
      label: t.columnOrb,
      sortable: false,
      valueOf: () => USER_STAR_CONJUNCTION_ORB_DEGREES,
      renderCell: () => <Badge tone="warning">{t.orbTag(orbText)}</Badge>,
    },
    {
      key: 'action',
      label: t.columnAction,
      sortable: false,
      valueOf: (star) => star.id,
      renderCell: (star) => (
        <Button
          size="compact"
          onClick={() => {
            onChange(withStarRemoved(stars, star.id));
          }}
        >
          {t.remove(chosenStarLabel(star))}
        </Button>
      ),
    },
  ];

  return (
    <div className="settings-card-block fixed-star-picker">
      <div className="fixed-star-picker-toolbar">
        <p className="hint" role="status">
          {stars.length === 0 ? t.noneChosen(PRESET_STAR_NAMES.join(', ')) : t.chosenCount(stars.length)}
        </p>
        <Button
          disabled={catalogue === undefined}
          onClick={() => {
            if (catalogue !== undefined) onChange(withPresetStars(stars, catalogue.entries, catalogue.sha256));
          }}
        >
          {t.presetButton}
        </Button>
      </div>

      {load.kind === 'loading' && <StatusMessage kind="loading">{t.loading}</StatusMessage>}
      {load.kind === 'error' && <StatusMessage kind="error">{t.loadFailed(load.message)}</StatusMessage>}

      <TextField
        label={t.searchLabel}
        help={t.searchHelp}
        value={query}
        onChange={setQuery}
        disabled={catalogue === undefined}
        autoComplete="off"
        inputMode="search"
        inputProps={{ 'aria-controls': resultsId }}
      />
      {catalogue !== undefined && trimmed !== '' && (
        <p className="hint" aria-live="polite">
          {results.length === 0
            ? t.noMatch(trimmed)
            : t.matchCount(
                formatInteger(results.length, locale),
                formatInteger(catalogue.entries.length, locale),
                trimmed,
              )}{' '}
          {results.length >= STAR_SEARCH_LIMIT && t.matchCapped(String(STAR_SEARCH_LIMIT))}
        </p>
      )}
      <ul className="fixed-star-results" id={resultsId} aria-label={t.resultsLabel} hidden={results.length === 0}>
        {results.map((result) => {
          const id = swissStarId(result);
          const label = chosenStarLabel(result);
          const chosen = chosenIds.has(id);
          return (
            <li key={`${result.name}\u0000${result.designation}`}>
              <span className="fixed-star-result-name">{label}</span>
              <span className="fixed-star-result-meta">
                {result.name === '' ? '' : `${result.designation} · `}
                {t.magnitude(formatDecimal(result.magnitude, 2, locale))}
              </span>
              {chosen ? (
                <span className="settings-card-draft-tag" aria-label={t.alreadyChosen(label)}>
                  {t.chosenTag}
                </span>
              ) : (
                <Button
                  size="compact"
                  aria-label={t.add(label)}
                  onClick={() => {
                    if (catalogue === undefined) return;
                    const entry = catalogue.entries.find(
                      (candidate) => candidate.name === result.name && candidate.designation === result.designation,
                    );
                    if (entry !== undefined) onChange(withStarAdded(stars, chosenStarOf(entry, catalogue.sha256)));
                  }}
                >
                  {t.add(label)}
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      {stars.length > 0 && (
        <SortableTable
          caption={t.chosenCaption}
          headingLevel={3}
          columns={columns}
          rows={stars}
          getRowKey={(star) => star.id}
        />
      )}
      <p className="hint">{t.orbNote(orbText)}</p>

      {catalogue !== undefined && (
        <div className="fixed-star-source">
          <p className="fixed-star-source-line">
            {t.sourceHeading}: {t.sourceLine(FIXED_STARS_ASSET.file, catalogue.sha256.slice(0, HASH_PREFIX_LENGTH))}
          </p>
          <p className="hint">{t.sourceHelp}</p>
        </div>
      )}
    </div>
  );
}
