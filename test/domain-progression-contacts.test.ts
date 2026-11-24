/**
 * The Progressions screen's extra contact sets (#1407, Solar Fire Deluxe v6 §23.2; owner decisions 2026-11-14):
 * progressed to progressed, and transits on the as-of date to the progressed chart, each with the orbs its context
 * already uses. Real Swiss Ephemeris through the engine harness.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { angularSeparation, DEFAULT_ORB_CONFIG, findAspects, subjectsFrom } from '../src/astrology/aspects.js';
import { bodyById } from '../src/astrology/bodies.js';
import { progressedToProgressed, transitsToProgressed } from '../src/domain/progression-contacts.js';
import { computeSecondaryProgression } from '../src/domain/secondary-progression.js';
import type { SwissEphemerisEngine } from '../src/ephemeris/engine.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

const NATAL: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};

let engine: SwissEphemerisEngine;
let targetJd: number;

beforeAll(async () => {
  engine = await getEngine();
  targetJd = await engine.julianDayFromUtc(2026, 11, 14, 12, 0, 0);
}, 60_000);

describe('progressed to progressed (#1407)', () => {
  it('is the aspects among the progressed positions, with the default orbs the screen already uses', async () => {
    const progression = await computeSecondaryProgression(NATAL, targetJd, engine);
    const ours = progressedToProgressed(progression.positions);
    const expected = findAspects(
      subjectsFrom(progression.positions, (body) => bodyById(body)?.category ?? 'asteroid'),
      DEFAULT_ORB_CONFIG,
    );
    expect(ours).toEqual(expected);
    expect(ours.length).toBeGreaterThan(0);
  });
});

describe('transits to progressed (#1407)', () => {
  it('measures each transiting body on the as-of date to a progressed body, within the transit orb', async () => {
    const progression = await computeSecondaryProgression(NATAL, targetJd, engine);
    const contacts = await transitsToProgressed(targetJd, progression.positions, engine);
    expect(contacts.length).toBeGreaterThan(0);
    for (const contact of contacts.slice(0, 5)) {
      const transiting = await engine.position(targetJd, contact.bodyA);
      const progressed = progression.positions.find((position) => position.body === contact.bodyB);
      if (progressed === undefined) throw new Error('contact to a body the progression does not have');
      const separation = angularSeparation(transiting.longitude, progressed.longitude);
      expect(Math.abs(separation - contact.aspect.angle)).toBeLessThanOrEqual(contact.allowedOrb + 1e-9);
    }
  });

  it("reads the transits in the person's zodiac for a sidereal progression (#1935)", async () => {
    const zodiac = { kind: 'sidereal', ayanamsa: 1 } as const;
    const progression = await computeSecondaryProgression(NATAL, targetJd, engine, { zodiac });
    const sidereal = await transitsToProgressed(targetJd, progression.positions, engine, { zodiac });
    const tropicalTransits = await transitsToProgressed(targetJd, progression.positions, engine);
    const ayanamsa = await engine.ayanamsa(targetJd, zodiac.ayanamsa);
    expect(ayanamsa).toBeGreaterThan(23);
    expect(sidereal.length).toBeGreaterThan(0);
    const key = (c: { bodyA: number; bodyB: number; aspect: { key: string } }): string =>
      `${String(c.bodyA)}|${String(c.bodyB)}|${c.aspect.key}`;
    // The mixed-zodiac result the screen showed before: tropical transits against sidereal progressed bodies.
    expect(sidereal.map(key).sort()).not.toEqual(tropicalTransits.map(key).sort());
    for (const contact of sidereal) {
      const tropical = await engine.position(targetJd, contact.bodyA);
      const inZodiac = await engine.position(targetJd, contact.bodyA, { zodiac });
      const expected = (((tropical.longitude - ayanamsa) % 360) + 360) % 360;
      expect(angularSeparation(inZodiac.longitude, expected) * 3600).toBeLessThan(1);
      const progressed = progression.positions.find((position) => position.body === contact.bodyB);
      if (progressed === undefined) throw new Error('contact to a body the progression does not have');
      // The contact's angle is the sidereal transit to the sidereal progressed body, within the orb.
      const separation = angularSeparation(inZodiac.longitude, progressed.longitude);
      expect(Math.abs(separation - contact.aspect.angle)).toBeLessThanOrEqual(contact.allowedOrb + 1e-9);
    }
  });

  it('differs from the progressed-to-natal contacts the screen showed before', async () => {
    const progression = await computeSecondaryProgression(NATAL, targetJd, engine);
    const transit = await transitsToProgressed(targetJd, progression.positions, engine);
    const key = (c: { bodyA: number; bodyB: number; aspect: { key: string } }): string =>
      `${String(c.bodyA)}|${String(c.bodyB)}|${c.aspect.key}`;
    expect(transit.map(key).sort()).not.toEqual(progression.contacts.map(key).sort());
  });
});
