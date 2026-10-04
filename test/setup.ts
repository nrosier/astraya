/**
 * Test environment setup.
 *
 * Vitest runs in Node, deliberately: it makes the ephemeris tests exercise the same
 * asset-loading path the browser takes, with no network. That choice means two browser
 * APIs have to be supplied here.
 */
import { installFileFetch } from '../scripts/node-file-fetch.mjs';

installFileFetch();

/**
 * IndexedDB, via `fake-indexeddb`.
 *
 * The store is the one place where a bug loses a user's data outright, so its tests run
 * against a real IndexedDB implementation — versions, upgrade transactions, key ordering
 * and transaction aborts included — rather than against a mock that would agree with
 * whatever `db.ts` happens to do.
 */
import 'fake-indexeddb/auto';

/**
 * Tell React this is a test environment that uses `act(...)`. Without the flag React logs "The
 * current testing environment is not configured to support act(...)" on every `act` call (hundreds
 * of lines in the CI log), and it also stays silent about a state update a test forgot to wrap in
 * `act`. Set on `globalThis`, so it is harmless for the tests that never render anything.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
