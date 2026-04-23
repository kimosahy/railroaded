"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SessionSnapshot {
  sessionId: string;
  phase: string;
  room: string | null;
}

interface CharacterDrawerState {
  isOpen: boolean;
  characterId: string | null;
  sessionSnapshot: SessionSnapshot | null;
}

interface CharacterDrawerContextValue extends CharacterDrawerState {
  openDrawer: (
    characterId: string,
    sessionSnapshot?: SessionSnapshot | null,
  ) => void;
  closeDrawer: () => void;
}

// ─── Analytics (local — avoids circular import with character-drawer.tsx) ────

/**
 * Fires `spectator_drawer_opened` via PostHog if present, otherwise console.log
 * fallback. The event fires on every distinct open, including swap-in-place
 * re-opens. Kept in this file to avoid a circular import with the Drawer
 * component, which imports `useCharacterDrawer` from here.
 */
function trackDrawerOpen(
  characterId: string,
  sessionId?: string | null,
): void {
  const payload = {
    characterId,
    sessionId: sessionId ?? undefined,
    timestamp: new Date().toISOString(),
  };
  if (
    typeof window !== "undefined" &&
    // Avoid `any` — narrow through `unknown`.
    typeof (window as unknown as { posthog?: { capture?: unknown } }).posthog
      ?.capture === "function"
  ) {
    const ph = (
      window as unknown as {
        posthog: { capture: (event: string, props: unknown) => void };
      }
    ).posthog;
    ph.capture("spectator_drawer_opened", payload);
  } else {
    console.log("[analytics]", {
      event: "spectator_drawer_opened",
      ...payload,
    });
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

const CharacterDrawerContext = createContext<CharacterDrawerContextValue | null>(
  null,
);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function CharacterDrawerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<CharacterDrawerState>({
    isOpen: false,
    characterId: null,
    sessionSnapshot: null,
  });

  // Captured on each open so close can restore focus (WCAG 2.4.3).
  const lastTriggerRef = useRef<HTMLElement | null>(null);

  const openDrawer = useCallback(
    (characterId: string, sessionSnapshot?: SessionSnapshot | null) => {
      // Fire analytics BEFORE state update so the event reflects the new-open
      // boundary even when swapping characters while the drawer is already open.
      trackDrawerOpen(characterId, sessionSnapshot?.sessionId ?? null);

      // Only capture the trigger if we're opening fresh — swap-in-place keeps
      // the original trigger so focus returns to the right place on close.
      if (!state.isOpen && typeof document !== "undefined") {
        const active = document.activeElement;
        lastTriggerRef.current =
          active instanceof HTMLElement ? active : null;
      }

      setState({
        isOpen: true,
        characterId,
        sessionSnapshot: sessionSnapshot ?? null,
      });
    },
    [state.isOpen],
  );

  const closeDrawer = useCallback(() => {
    setState({ isOpen: false, characterId: null, sessionSnapshot: null });
    const trigger = lastTriggerRef.current;
    lastTriggerRef.current = null;
    if (trigger && typeof trigger.focus === "function") {
      // Defer to let HeroUI's own focus-restoration settle first.
      requestAnimationFrame(() => trigger.focus());
    }
  }, []);

  const value = useMemo<CharacterDrawerContextValue>(
    () => ({ ...state, openDrawer, closeDrawer }),
    [state, openDrawer, closeDrawer],
  );

  return (
    <CharacterDrawerContext.Provider value={value}>
      {children}
    </CharacterDrawerContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCharacterDrawer(): CharacterDrawerContextValue {
  const ctx = useContext(CharacterDrawerContext);
  if (!ctx) {
    throw new Error(
      "useCharacterDrawer must be used inside <CharacterDrawerProvider>",
    );
  }
  return ctx;
}
