/**
 * @module ui/selection-actions-slot
 * @purpose The element in a split placement card's top-right action row (#2028) where a child control, the AI interpretation's Regenerate, places its button beside Clear.
 * @conventions A React context holding the slot element, or null outside a split card; the child renders into it with a portal, so the button sits beside Clear while its state stays in the child (owner spec on #2028).
 * @exports SelectionActionsSlotContext
 */
import { createContext } from 'react';

/** The action-row slot of the enclosing split placement card, or null when there is none. */
export const SelectionActionsSlotContext = createContext<HTMLElement | null>(null);
