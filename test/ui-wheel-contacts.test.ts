// @vitest-environment jsdom
/**
 * Keyboard next/previous contact (#1063): the order of a selected body's drawn aspect contacts, the
 * wrap-around step, the key mapping and the current-contact marks, on a hand-built fragment that
 * carries the same `data-*` attributes `renderMultiWheelSvg` emits.
 */
import { describe, expect, it } from 'vitest';
import {
  applyContactFocus,
  CONTACT_CURRENT_CLASS,
  CONTACT_PARTNER_CLASS,
  contactDirectionForKey,
  contactsOfBody,
  stepContact,
} from '../src/ui/wheel-contacts.js';
import { applyIsolation } from '../src/ui/wheel-interaction.js';

/**
 * Sun at 350° with lines to Moon (20°, 30° ahead), Mars (100°, 110° ahead), Venus (300°, 310° ahead) and
 * Saturn (100°, the same 110° ahead as Mars), plus a Moon-Mars line that does not touch the Sun.
 */
function fragment(): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = `
    <svg>
      <g data-body="sun" data-ring="0" data-body-sign="pisces" data-body-longitude="350.0000"></g>
      <g data-body="moon" data-ring="0" data-body-sign="aries" data-body-longitude="20.0000"></g>
      <g data-body="mars" data-ring="0" data-body-sign="cancer" data-body-longitude="100.0000"></g>
      <g data-body="saturn" data-ring="0" data-body-sign="cancer" data-body-longitude="100.0000"></g>
      <g data-body="venus" data-ring="0" data-body-sign="aquarius" data-body-longitude="300.0000"></g>
      <g class="chart-aspect-link" data-aspect-key="square" data-aspect-body-a="venus" data-aspect-body-b="sun" data-ring-a="0" data-ring-b="0"><line class="chart-aspect" /></g>
      <g class="chart-aspect-link" data-aspect-key="square" data-aspect-body-a="sun" data-aspect-body-b="saturn" data-ring-a="0" data-ring-b="0"><line class="chart-aspect" /></g>
      <g class="chart-aspect-link" data-aspect-key="semisextile" data-aspect-body-a="sun" data-aspect-body-b="moon" data-ring-a="0" data-ring-b="0"><line class="chart-aspect" /></g>
      <g class="chart-aspect-link" data-aspect-key="square" data-aspect-body-a="mars" data-aspect-body-b="sun" data-ring-a="0" data-ring-b="0"><line class="chart-aspect" /></g>
      <g class="chart-aspect-link" data-aspect-key="square" data-aspect-body-a="moon" data-aspect-body-b="mars" data-ring-a="0" data-ring-b="0"><line class="chart-aspect" /></g>
    </svg>
  `;
  return root;
}

describe('contactsOfBody (#1063)', () => {
  it('orders the contacts in zodiac order forward from the selected body, across 0° Aries', () => {
    const contacts = contactsOfBody(fragment(), 'sun@0');
    expect(contacts.map((contact) => contact.partnerId)).toEqual(['moon@0', 'mars@0', 'saturn@0', 'venus@0']);
    expect(contacts.map((contact) => contact.forwardDegrees)).toEqual([30, 110, 110, 310]);
  });

  it('breaks a tie at the same longitude by aspect key, then by partner id', () => {
    const contacts = contactsOfBody(fragment(), 'sun@0');
    // Mars and Saturn are both a square 110° ahead: the partner id decides.
    expect(contacts[1]?.partnerKey).toBe('mars');
    expect(contacts[2]?.partnerKey).toBe('saturn');
  });

  it('reads the partner and the aspect from either end of the line', () => {
    const contacts = contactsOfBody(fragment(), 'sun@0');
    expect(contacts[0]).toMatchObject({ partnerKey: 'moon', aspectKey: 'semisextile' });
    expect(contacts[3]).toMatchObject({ partnerKey: 'venus', aspectKey: 'square' });
  });

  it('leaves out lines that do not touch the selected body, and is empty for a body with no line', () => {
    const root = fragment();
    expect(contactsOfBody(root, 'moon@0').map((contact) => contact.partnerKey)).toEqual(['mars', 'sun']);
    expect(contactsOfBody(root, 'jupiter@0')).toEqual([]);
  });

  it('tells rings apart: a body on ring 1 is not the same body on ring 0', () => {
    const root = fragment();
    expect(contactsOfBody(root, 'sun@1')).toEqual([]);
  });

  it('gives the same contacts whether body isolation has taken the other lines off the wheel or not', () => {
    const plain = contactsOfBody(fragment(), 'sun@0').map((contact) => contact.partnerId);
    const root = fragment();
    applyIsolation(root, 'body:sun@0', true);
    expect(contactsOfBody(root, 'sun@0').map((contact) => contact.partnerId)).toEqual(plain);
  });
});

describe('stepContact (#1063)', () => {
  it('starts at the first contact going forward and the last going back', () => {
    expect(stepContact(undefined, 4, 'next')).toBe(0);
    expect(stepContact(undefined, 4, 'previous')).toBe(3);
  });

  it('wraps around at both ends', () => {
    expect(stepContact(3, 4, 'next')).toBe(0);
    expect(stepContact(0, 4, 'previous')).toBe(3);
    expect(stepContact(1, 4, 'next')).toBe(2);
    expect(stepContact(2, 4, 'previous')).toBe(1);
  });

  it('has nowhere to go with no contacts, and restarts from an index that no longer exists', () => {
    expect(stepContact(undefined, 0, 'next')).toBeUndefined();
    expect(stepContact(5, 2, 'next')).toBe(0);
  });
});

describe('contactDirectionForKey (#1063)', () => {
  it('maps Right and Down to next, Left and Up to previous, and nothing else', () => {
    expect(contactDirectionForKey('ArrowRight')).toBe('next');
    expect(contactDirectionForKey('ArrowDown')).toBe('next');
    expect(contactDirectionForKey('ArrowLeft')).toBe('previous');
    expect(contactDirectionForKey('ArrowUp')).toBe('previous');
    expect(contactDirectionForKey('Enter')).toBeUndefined();
    expect(contactDirectionForKey('Tab')).toBeUndefined();
  });
});

describe('applyContactFocus (#1063)', () => {
  it('marks only the current line and its partner body, and moves the mark on the next step', () => {
    const root = fragment();
    const contacts = contactsOfBody(root, 'sun@0');
    applyContactFocus(root, contacts[0]);
    expect(root.querySelectorAll(`.${CONTACT_CURRENT_CLASS}`)).toHaveLength(1);
    expect(root.querySelector(`.${CONTACT_PARTNER_CLASS}`)?.getAttribute('data-body')).toBe('moon');

    applyContactFocus(root, contacts[1]);
    expect(root.querySelectorAll(`.${CONTACT_CURRENT_CLASS}`)).toHaveLength(1);
    expect(root.querySelector(`.${CONTACT_CURRENT_CLASS}`)?.getAttribute('data-aspect-body-a')).toBe('mars');
    expect([...root.querySelectorAll(`.${CONTACT_PARTNER_CLASS}`)].map((el) => el.getAttribute('data-body'))).toEqual([
      'mars',
    ]);
  });

  it('clears every mark when there is no current contact', () => {
    const root = fragment();
    applyContactFocus(root, contactsOfBody(root, 'sun@0')[2]);
    applyContactFocus(root, undefined);
    expect(root.querySelectorAll(`.${CONTACT_CURRENT_CLASS}, .${CONTACT_PARTNER_CLASS}`)).toHaveLength(0);
  });
});
