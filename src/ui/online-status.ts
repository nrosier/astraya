/**
 * Whether the browser says it is online (#513): a network-only action (place search, AI interpretation) can say it
 * needs a connection instead of failing after a click, while everything calculated on this device keeps working.
 */
/**
 * @module online-status
 * @purpose `useOnline()` reads `navigator.onLine` and follows the window's online/offline events.
 * @conventions Browser-reported only (a captive portal still reads as online), so a failed request is still reported as an error; this only adds the early, honest offline state.
 * @exports useOnline
 */
import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
