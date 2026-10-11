// @vitest-environment jsdom
/**
 * The Motion and Density device preferences (#510): stored on this device, applied as root attributes, and absent
 * from the root when left at their defaults so the OS setting and the standard layout apply untouched.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  DENSITY_KEY,
  MOTION_KEY,
  prefersReducedMotion,
  readDensity,
  readMotion,
  writeDensity,
  writeMotion,
} from '../src/ui/appearance-settings.js';

afterEach(() => {
  writeMotion('system');
  writeDensity('standard');
  localStorage.clear();
});

describe('Motion', () => {
  it('defaults to following the system, with no root attribute', () => {
    expect(readMotion()).toBe('system');
    expect(document.documentElement.dataset.motion).toBeUndefined();
  });

  it('saves "reduced" and marks the root, and returns to the system default cleanly', () => {
    writeMotion('reduced');
    expect(localStorage.getItem(MOTION_KEY)).toBe('reduced');
    expect(readMotion()).toBe('reduced');
    expect(document.documentElement.dataset.motion).toBe('reduced');
    expect(prefersReducedMotion()).toBe(true);
    writeMotion('system');
    expect(document.documentElement.dataset.motion).toBeUndefined();
  });

  it('ignores a stored value it does not know', () => {
    localStorage.setItem(MOTION_KEY, 'sideways');
    expect(readMotion()).toBe('system');
  });
});

describe('Density', () => {
  it('defaults to standard, with no root attribute', () => {
    expect(readDensity()).toBe('standard');
    expect(document.documentElement.dataset.density).toBeUndefined();
  });

  it('saves "compact" and marks the root, and returns to standard cleanly', () => {
    writeDensity('compact');
    expect(localStorage.getItem(DENSITY_KEY)).toBe('compact');
    expect(readDensity()).toBe('compact');
    expect(document.documentElement.dataset.density).toBe('compact');
    writeDensity('standard');
    expect(document.documentElement.dataset.density).toBeUndefined();
  });

  it('ignores a stored value it does not know', () => {
    localStorage.setItem(DENSITY_KEY, 'cramped');
    expect(readDensity()).toBe('standard');
  });
});
