/**
 * Keyboard next/previous contact for a selected body (#1063): the aspect lines the wheel already
 * drew for that body, put in one fixed order, and a step through them.
 *
 * Ordering convention: a body's contacts run in zodiacal order from the selected body, that is by
 * the partner's ecliptic longitude measured forward (increasing longitude, counter-clockwise on the
 * wheel) from the selected body's own longitude. The first contact is the nearest partner ahead of
 * the body in the zodiac, the last is the nearest one behind it. Ties (one partner with two lines,
 * or the same body on two rings) fall back to the aspect key, then the partner id, so the order is
 * total and stable. Next is ArrowRight or ArrowDown, previous is ArrowLeft or ArrowUp; both wrap
 * around, and with no contact current yet, next starts at the first contact and previous at the last.
 *
 * Only the wheel's own markup is read (`data-aspect-body-a/b`, `data-ring-a/b`, `data-aspect-key`,
 * `data-body-longitude`), the same attributes `wheel-interaction.ts` reads: no aspect, orb or
 * position is computed here. A conjunction is not drawn as a line, so it is not a contact here either.
 */
/**
 * @module ui/wheel-contacts
 * @purpose Orders a selected body's drawn aspect contacts on a chart wheel and steps through them for keyboard next/previous navigation (#1063).
 * @conventions Reads only the wheel markup's data attributes, never chart data; zodiacal order forward from the selected body, ties by aspect key then partner id; stepping wraps; the current contact is marked with a class straight on the injected DOM.
 * @exports WheelContact, ContactDirection, ContactStepper, CONTACT_CURRENT_CLASS, CONTACT_PARTNER_CLASS, contactsOfBody, stepContact, contactDirectionForKey, applyContactFocus, useContactStepper
 */
import { useEffect, useState } from 'react';
import { bodyId, parseBodyId } from '../chart/body-id.js';

/** One drawn aspect line touching the selected body, seen from that body. */
export interface WheelContact {
  /** The other end of the line, as `key@ring` (`moon@0`). */
  readonly partnerId: string;
  /** The partner's body key without its ring (`moon`), for its display name. */
  readonly partnerKey: string;
  /** The aspect key the line carries (`trine`), for its display name. */
  readonly aspectKey: string;
  /** Degrees from the selected body forward to the partner, in [0, 360); `undefined` when the partner has no drawn glyph. */
  readonly forwardDegrees: number | undefined;
  /** The line itself, so it can be marked as the current contact. */
  readonly link: Element;
}

export type ContactDirection = 'next' | 'previous';

/** Put on the current contact's aspect line; styled in `app.css`. */
export const CONTACT_CURRENT_CLASS = 'chart-contact-current';
/** Put on the current contact's partner body; styled in `app.css`. */
export const CONTACT_PARTNER_CLASS = 'chart-contact-partner';

function norm360(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

function longitudeOf(root: Element, id: string): number | undefined {
  const { key, ring } = parseBodyId(id);
  for (const element of root.querySelectorAll('[data-body]')) {
    if (element.getAttribute('data-body') !== key || (element.getAttribute('data-ring') ?? '0') !== String(ring))
      continue;
    const raw = element.getAttribute('data-body-longitude');
    if (raw === null || raw === '') continue;
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return undefined;
}

/**
 * The aspect lines under `root` that touch `selectedId` (`sun@0`), in the zodiacal order described
 * in this module's header. Empty when the body has no drawn line.
 */
export function contactsOfBody(root: Element, selectedId: string): readonly WheelContact[] {
  const own = longitudeOf(root, selectedId);
  const contacts: WheelContact[] = [];
  for (const link of root.querySelectorAll('[data-aspect-body-a]')) {
    // A line the aspect-family filter has hidden (#1063) is not a contact the reader can see.
    if (link.classList.contains('chart-aspect-filtered')) continue;
    const a = bodyId(link.getAttribute('data-aspect-body-a') ?? '', link.getAttribute('data-ring-a') ?? '0');
    const b = bodyId(link.getAttribute('data-aspect-body-b') ?? '', link.getAttribute('data-ring-b') ?? '0');
    let partnerId: string;
    if (a === selectedId) partnerId = b;
    else if (b === selectedId) partnerId = a;
    else continue;
    const partner = longitudeOf(root, partnerId);
    contacts.push({
      partnerId,
      partnerKey: parseBodyId(partnerId).key,
      aspectKey: link.getAttribute('data-aspect-key') ?? '',
      forwardDegrees: own === undefined || partner === undefined ? undefined : norm360(partner - own),
      link,
    });
  }
  return contacts.sort((x, y) => {
    // A partner without a drawn glyph has no place in the zodiac order, so it goes last.
    const dx = x.forwardDegrees ?? Number.POSITIVE_INFINITY;
    const dy = y.forwardDegrees ?? Number.POSITIVE_INFINITY;
    if (dx !== dy) return dx < dy ? -1 : 1;
    if (x.aspectKey !== y.aspectKey) return x.aspectKey < y.aspectKey ? -1 : 1;
    if (x.partnerId === y.partnerId) return 0;
    return x.partnerId < y.partnerId ? -1 : 1;
  });
}

/**
 * The index of the contact after one step from `current` among `count` contacts, wrapping at both
 * ends. With no current contact, next goes to the first and previous to the last; with no contacts
 * at all there is nothing to step to.
 */
export function stepContact(
  current: number | undefined,
  count: number,
  direction: ContactDirection,
): number | undefined {
  if (count <= 0) return undefined;
  if (current === undefined || current < 0 || current >= count) return direction === 'next' ? 0 : count - 1;
  return direction === 'next' ? (current + 1) % count : (current - 1 + count) % count;
}

/** The step a key press asks for: ArrowRight/ArrowDown is next, ArrowLeft/ArrowUp is previous, anything else none. */
export function contactDirectionForKey(key: string): ContactDirection | undefined {
  if (key === 'ArrowRight' || key === 'ArrowDown') return 'next';
  if (key === 'ArrowLeft' || key === 'ArrowUp') return 'previous';
  return undefined;
}

/** Marks `contact`'s line and partner body under `root` as current, clearing any earlier mark; `undefined` clears every mark. */
export function applyContactFocus(root: Element, contact: WheelContact | undefined): void {
  for (const element of root.querySelectorAll(`.${CONTACT_CURRENT_CLASS}`))
    element.classList.remove(CONTACT_CURRENT_CLASS);
  for (const element of root.querySelectorAll(`.${CONTACT_PARTNER_CLASS}`))
    element.classList.remove(CONTACT_PARTNER_CLASS);
  if (contact === undefined) return;
  contact.link.classList.add(CONTACT_CURRENT_CLASS);
  const { key, ring } = parseBodyId(contact.partnerId);
  for (const element of root.querySelectorAll('[data-body]')) {
    if (element.getAttribute('data-body') === key && (element.getAttribute('data-ring') ?? '0') === String(ring)) {
      element.classList.add(CONTACT_PARTNER_CLASS);
    }
  }
}

export interface ContactStepper {
  /** The selected body's contacts in order; empty when no body is selected or it has no drawn line. */
  readonly contacts: readonly WheelContact[];
  /** The current contact's index, or `undefined` before the first step. */
  readonly index: number | undefined;
  readonly step: (direction: ContactDirection) => void;
}

/**
 * Next/previous contact state for the wheel under `wheelRef`. A new `selectionKey` (another body, a
 * non-body selection, or Clear) or new `markup` starts over with no current contact; only `body:`
 * selections have contacts. The contact list is read from the DOM after the wheel's markup is in.
 */
export function useContactStepper(
  wheelRef: React.RefObject<HTMLElement | null>,
  selectionKey: string | undefined,
  markup: unknown,
): ContactStepper {
  const [contacts, setContacts] = useState<readonly WheelContact[]>([]);
  const [index, setIndex] = useState<number | undefined>(undefined);

  useEffect(() => {
    const root = wheelRef.current;
    const selectedId = selectionKey?.startsWith('body:') === true ? selectionKey.slice('body:'.length) : undefined;
    setContacts(root === null || selectedId === undefined ? [] : contactsOfBody(root, selectedId));
    setIndex(undefined);
  }, [wheelRef, selectionKey, markup]);

  useEffect(() => {
    const root = wheelRef.current;
    if (root !== null) applyContactFocus(root, index === undefined ? undefined : contacts[index]);
  }, [wheelRef, contacts, index]);

  return {
    contacts,
    index,
    step: (direction) => {
      setIndex((current) => stepContact(current, contacts.length, direction));
    },
  };
}
