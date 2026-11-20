/**
 * `vi.waitFor`, but every wait happens inside React's `act()` (#1802).
 *
 * `vi.waitFor` polls on timers outside `act()`, so a fetch or a timer that settles while it polls updates React
 * state outside an act scope, and React logs "An update to X inside a test was not wrapped in act(...)" for each
 * one. Here each interval elapses inside its own `await act(...)`, so React flushes those updates inside the scope,
 * and the assertion then reads the committed DOM. Use it in place of `vi.waitFor` in component tests that render
 * with `createRoot`.
 */
import { act } from 'react';

export interface ActWaitForOptions {
  /** Give up after this many milliseconds and rethrow the assertion's last error. Default 4000 (`vi.waitFor` defaults to 1000; a little slack for slow CI). */
  readonly timeout?: number;
  /** Milliseconds between attempts. Default 20. */
  readonly interval?: number;
}

export async function actWaitFor<T>(assertion: () => T | Promise<T>, options: ActWaitForOptions = {}): Promise<T> {
  const timeout = options.timeout ?? 4000;
  const interval = options.interval ?? 20;
  const start = Date.now();
  for (;;) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, interval));
    });
    try {
      return await assertion();
    } catch (error) {
      if (Date.now() - start > timeout) throw error;
    }
  }
}
