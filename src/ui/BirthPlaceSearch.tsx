/**
 * Sets the two Coordinates fields (#45) by searching for a birth place by name (#290) — now the
 * only way to do so. The previous map/pin/"Use my location"/"Fill in place name" flow (#159,
 * #248, #267, #291) sent exact birth coordinates to a third-party tile host and reverse-geocoder;
 * it was removed rather than kept alongside this search, since city/town-level precision from a
 * typed name is already what natal astrology needs (an Ascendant shift big enough to matter needs
 * roughly 111 km of position error), and a search-only flow never discloses an exact coordinate to
 * anyone but this app's own server.
 *
 * Results are always a click-to-confirm floating dropdown (#784), even for a single match, so a search
 * never silently sets the fields: picking one passes `onPick` its optional third argument so the coordinates and
 * the place label land in a single call, matching `PersonForm.tsx`'s note that setting both fields
 * from two separate calls risks one clobbering the other.
 */
/**
 * @module BirthPlaceSearch
 * @purpose Renders the birth-place-by-name search control that resolves a typed place name to latitude/longitude coordinates via a geocoding service.
 * @conventions The only way to set birth coordinates (#290) — a prior map/pin/"use my location" flow was removed; results are a click-to-confirm floating combobox dropdown (#784) so a search never silently sets the fields; text comes from co-located `BirthPlaceSearch.messages.ts` via `useMessages()`.
 * @exports BirthPlaceSearch
 */
import { useEffect, useId, useRef, useState } from 'react';
import { TextField } from './primitives/TextField.js';
import { useOnline } from './online-status.js';
import { sharedMessages } from './shared.messages.js';
import { birthPlaceSearchMessages } from './BirthPlaceSearch.messages.js';
import { forwardGeocode } from './forward-geocode.js';
import { formatFixed } from './format.js';
import { geocodeHost } from './geocode-provider.js';
import { useMessages } from './messages.js';
import type { ForwardGeocodeResult } from './forward-geocode.js';
import { StatusMessage } from './primitives/StatusMessage.js';

type SearchStatus = 'idle' | 'searching' | 'not-found' | 'error' | 'results';

/** Typing triggers a search only after a pause this long, and only past this many characters (#784). */
const DEBOUNCE_MS = 300;
const MIN_AUTO_QUERY_LENGTH = 2;

/** "48.85° N, 2.35° E": two decimals, hemisphere letters instead of signs. */
function formatCoordinates(latitude: number, longitude: number): string {
  const lat = `${formatFixed(Math.abs(latitude), 2)}° ${latitude < 0 ? 'S' : 'N'}`;
  const lon = `${formatFixed(Math.abs(longitude), 2)}° ${longitude < 0 ? 'W' : 'E'}`;
  return `${lat}, ${lon}`;
}

/** The first comma-separated part of a display name ("Paris" from "Paris, Île-de-France, France"). */
function primaryLocation(displayName: string): string {
  return displayName.split(',')[0]?.trim() ?? displayName;
}

export function BirthPlaceSearch({
  onPick,
}: {
  onPick: (latitude: number, longitude: number, placeLabel?: string) => void;
}): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchStatus, setSearchStatus] = useState<SearchStatus>('idle');
  const [searchResults, setSearchResults] = useState<ForwardGeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  // -1 means no row is highlighted yet, so Enter still submits the search instead of picking a row.
  const [activeIndex, setActiveIndex] = useState(-1);
  const t = useMessages(birthPlaceSearchMessages);
  const shared = useMessages(sharedMessages);
  const online = useOnline();
  const listboxId = `${useId()}-listbox`;
  // The in-flight search's controller, so a newer search can cancel a slower older one (#463)
  // before applying its own results — otherwise an out-of-order response could overwrite a more
  // recent search with stale coordinates.
  const inFlightRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      inFlightRef.current?.abort();
      clearTimeout(debounceRef.current);
    },
    [],
  );

  const runSearch = (rawQuery: string): void => {
    clearTimeout(debounceRef.current);
    const query = rawQuery.trim();
    if (query === '') return;
    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;
    setSearchStatus('searching');
    setSearchResults([]);
    setActiveIndex(-1);
    setOpen(true);
    void forwardGeocode(query, controller.signal).then(
      (results) => {
        if (controller.signal.aborted) return;
        setActiveIndex(-1);
        setSearchResults(results);
        setSearchStatus(results.length === 0 ? 'not-found' : 'results');
      },
      () => {
        if (controller.signal.aborted) return;
        setSearchStatus('error');
      },
    );
  };

  const searchByName = (event: React.SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    runSearch(searchQuery);
  };

  const changeQuery = (value: string): void => {
    setSearchQuery(value);
    clearTimeout(debounceRef.current);
    if (value.trim().length <= MIN_AUTO_QUERY_LENGTH) {
      inFlightRef.current?.abort();
      setSearchStatus('idle');
      setSearchResults([]);
      setOpen(false);
      return;
    }
    if (!online) return;
    debounceRef.current = setTimeout(() => {
      runSearch(value);
    }, DEBOUNCE_MS);
  };

  const pickSearchResult = (result: ForwardGeocodeResult): void => {
    // Rounded to the four decimals the Latitude/Longitude fields show (about 11 m, far finer than a place name).
    onPick(Number(formatFixed(result.latitude, 4)), Number(formatFixed(result.longitude, 4)), result.displayName);
    setSearchQuery(primaryLocation(result.displayName));
    setSearchStatus('idle');
    setSearchResults([]);
    setActiveIndex(-1);
    setOpen(false);
  };

  const listVisible = open && searchStatus === 'results';
  const optionId = (index: number): string => `${listboxId}-option-${String(index)}`;

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    const count = searchResults.length;
    if (event.key === 'Escape') {
      if (!open) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && searchStatus === 'results' && count > 0) {
      event.preventDefault();
      setOpen(true);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      // Wraps at both ends; from "nothing highlighted" ArrowDown lands on the first row and ArrowUp on the last.
      setActiveIndex(activeIndex === -1 ? (step === 1 ? 0 : count - 1) : (activeIndex + step + count) % count);
    } else if (event.key === 'Enter' && listVisible) {
      const active = searchResults[activeIndex];
      if (active !== undefined) {
        event.preventDefault();
        pickSearchResult(active);
      }
    }
  };

  return (
    <div className="birth-place-search">
      <form className="birth-place-search-form" onSubmit={searchByName}>
        <div className="birth-place-search-combo">
          <TextField
            label={t.searchByName}
            value={searchQuery}
            placeholder={t.searchByNamePlaceholder}
            onChange={changeQuery}
            autoComplete="off"
            inputProps={{
              role: 'combobox',
              'aria-expanded': open && searchStatus !== 'idle',
              'aria-controls': listVisible ? listboxId : undefined,
              'aria-autocomplete': 'list',
              'aria-activedescendant': listVisible && activeIndex >= 0 ? optionId(activeIndex) : undefined,
              onKeyDown: onInputKeyDown,
              onBlur: () => {
                setOpen(false);
              },
            }}
          />
          {open && searchStatus !== 'idle' && (
            <div className="birth-place-search-dropdown">
              {searchStatus === 'searching' && (
                <p className="birth-place-search-state" role="status">
                  <svg className="birth-place-search-spinner" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                    <path
                      d="M21 12a9 9 0 0 0-9-9"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span>{t.searching}</span>
                </p>
              )}
              {searchStatus === 'not-found' && (
                <p className="birth-place-search-state" role="status">
                  {t.searchNoMatches}
                </p>
              )}
              {searchStatus === 'error' && (
                <p className="birth-place-search-state birth-place-search-error" role="alert">
                  {t.searchFailed}
                </p>
              )}
              {searchStatus === 'results' && (
                <ul id={listboxId} role="listbox" aria-label={t.searchResultsLabel}>
                  {searchResults.map((result, index) => (
                    <li
                      key={`${String(result.latitude)},${String(result.longitude)},${String(index)}`}
                      id={optionId(index)}
                      role="option"
                      aria-selected={index === activeIndex}
                      className="birth-place-search-option"
                      // Keeps focus in the input so its blur handler does not close the list before the click lands.
                      onMouseDown={(event) => {
                        event.preventDefault();
                      }}
                      onMouseMove={() => {
                        setActiveIndex(index);
                      }}
                      onClick={() => {
                        pickSearchResult(result);
                      }}
                    >
                      <span className="birth-place-search-option-name">{result.displayName}</span>
                      <span className="birth-place-search-option-coords">
                        {formatCoordinates(result.latitude, result.longitude)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <p className="hint">{t.searchDisclosure(geocodeHost)}</p>
        <button
          type="submit"
          className="quiet"
          disabled={searchStatus === 'searching' || searchQuery.trim() === '' || !online}
        >
          {searchStatus === 'searching' ? t.searching : t.search}
        </button>
      </form>
      {!online && (
        <StatusMessage kind="offline">{`${shared.offlineNeeded} ${t.offlineEnterCoordinates}`}</StatusMessage>
      )}
    </div>
  );
}
