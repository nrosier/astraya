/**
 * The "as of" date of a timing screen, kept in the URL as `?date=YYYY-MM-DD` on the current route (#1400), so a stepped
 * view can be shared and reloaded.
 */
/**
 * @module ui/use-as-of-date
 * @purpose State hook for a screen's as-of date: opens on the URL's `?date=` (else today) and writes changes back to the URL.
 * @conventions The URL is rewritten with `history.replaceState` (keeping `history.state`, as nav-history requires) and no `hashchange`, so stepping never adds a history entry or re-renders the router; writes are debounced and held back while playback runs (#1440), so the URL is written once when playback pauses or stops and a reload reopens the date playback started from; a half-typed or impossible date is never written. Today is not written unless the URL already carries a date.
 * @exports useAsOfDate
 */
import { useEffect, useState } from 'react';
import { todayInputValue } from './format.js';
import { hashDate, hashWithDate } from './route.js';
import { dayNumber } from './date-animation.js';

/** How long the date must hold still before it is written to the URL. */
const URL_WRITE_DELAY_MS = 300;

export function useAsOfDate(): readonly [string, (value: string) => void, (playing: boolean) => void] {
  const [asOf, setAsOf] = useState(() => hashDate(window.location.hash) ?? todayInputValue());
  // While playback runs the URL keeps the date it started from.
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (playing || dayNumber(asOf) === undefined) return undefined;
    const timer = window.setTimeout(() => {
      const hash = window.location.hash;
      if (hashDate(hash) === undefined && asOf === todayInputValue()) return;
      if (hashDate(hash) === asOf) return;
      try {
        window.history.replaceState(window.history.state, '', hashWithDate(hash, asOf));
      } catch {
        // A browser that refuses the rewrite (rate limit, sandbox) just leaves the URL as it was.
      }
    }, URL_WRITE_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [asOf, playing]);
  return [asOf, setAsOf, setPlaying] as const;
}
