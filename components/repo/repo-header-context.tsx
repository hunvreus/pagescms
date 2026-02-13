"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

type RepoHeaderSlots = {
  header: ReactNode | null;
};

type RepoHeaderContextValue = {
  slots: RepoHeaderSlots;
  setSlots: (next: Partial<RepoHeaderSlots>) => void;
  clearSlots: () => void;
};

const RepoHeaderContext = createContext<RepoHeaderContextValue | null>(null);

export function RepoHeaderProvider({ children }: { children: ReactNode }) {
  const [slots, setSlotsState] = useState<RepoHeaderSlots>({
    header: null,
  });

  const setSlots = useCallback((next: Partial<RepoHeaderSlots>) => {
    setSlotsState((prev) => {
      const merged = { ...prev, ...next };
      if (prev.header === merged.header) {
        return prev;
      }
      return merged;
    });
  }, []);

  const clearSlots = useCallback(() => {
    setSlotsState({
      header: null,
    });
  }, []);

  const value = useMemo(
    () => ({
      slots,
      setSlots,
      clearSlots,
    }),
    [slots, setSlots, clearSlots],
  );

  return <RepoHeaderContext.Provider value={value}>{children}</RepoHeaderContext.Provider>;
}

export function useRepoHeaderState() {
  const context = useContext(RepoHeaderContext);
  if (!context) {
    throw new Error("useRepoHeaderState must be used within a RepoHeaderProvider");
  }

  return context.slots;
}

export function useRepoHeader(slots: Partial<RepoHeaderSlots>) {
  const context = useContext(RepoHeaderContext);
  if (!context) {
    throw new Error("useRepoHeader must be used within a RepoHeaderProvider");
  }

  const { setSlots, clearSlots } = context;

  useEffect(() => {
    setSlots({
      header: slots.header ?? null,
    });
  }, [slots.header, setSlots]);

  useEffect(() => {
    return () => {
      clearSlots();
    };
  }, [clearSlots]);
}
