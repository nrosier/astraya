/**
 * What the current screen can export, offered in the header's Export menu.
 *
 * The export menu lives in the header, outside every screen, but only a screen knows what it can
 * export (the chart's image, a table, a map). So a screen registers its items while it is mounted and
 * the menu lists them under "This page". The registry is a plain context holding a list: a screen
 * that unmounts removes its items, and the menu never has to know which screens exist.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

export interface ExportItem {
  /** Stable within the page, e.g. `chart-svg`. */
  readonly key: string;
  readonly label: string;
  /** Items sharing a `group` are listed together under it, as a submenu of "This page". */
  readonly group?: string;
  readonly run: () => void | Promise<void>;
  readonly disabled?: boolean;
}

interface Actions {
  readonly register: (owner: symbol, items: readonly ExportItem[]) => void;
  readonly unregister: (owner: symbol) => void;
}

// Two contexts, so a screen that only registers is not re-rendered every time the list changes (which
// would register again, and again): the actions never change, only the list does.
const ItemsContext = createContext<readonly ExportItem[]>([]);
const ActionsContext = createContext<Actions | undefined>(undefined);

export function ExportRegistryProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [owners, setOwners] = useState<ReadonlyMap<symbol, readonly ExportItem[]>>(new Map());
  const actions = useMemo<Actions>(
    () => ({
      register: (owner, items) => {
        setOwners((current) => new Map(current).set(owner, items));
      },
      unregister: (owner) => {
        setOwners((current) => {
          const next = new Map(current);
          next.delete(owner);
          return next;
        });
      },
    }),
    [],
  );
  const items = useMemo(() => [...owners.values()].flat(), [owners]);
  return (
    <ActionsContext.Provider value={actions}>
      <ItemsContext.Provider value={items}>{children}</ItemsContext.Provider>
    </ActionsContext.Provider>
  );
}

/** The items the current screen has registered; empty outside a provider. */
export function useExportItems(): readonly ExportItem[] {
  return useContext(ItemsContext);
}

/**
 * Registers a screen's export items for as long as it is mounted. `items` may change on every render;
 * the registration follows it, and the screen's own `run` closures are always the latest ones.
 */
export function useRegisterExports(items: readonly ExportItem[] | undefined): void {
  const registry = useContext(ActionsContext);
  const owner = useRef(Symbol('export-owner'));
  const register = registry?.register;
  const unregister = registry?.unregister;
  // Re-registering on every change of the list's content, not its identity (a screen builds a new array each render).
  const signature =
    items === undefined
      ? ''
      : items.map((item) => `${item.key}|${item.label}|${item.group ?? ''}|${String(item.disabled)}`).join('\n');
  const latest = useRef(items);
  latest.current = items;

  useEffect(() => {
    if (register === undefined || latest.current === undefined) return undefined;
    // `run` is read through `latest` at click time, so a stale closure is never called.
    register(
      owner.current,
      latest.current.map((item) => ({
        ...item,
        run: () => {
          const current = latest.current?.find((candidate) => candidate.key === item.key);
          return (current ?? item).run();
        },
      })),
    );
    const id = owner.current;
    return () => {
      unregister?.(id);
    };
  }, [register, unregister, signature]);
}
