"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(max-width: 768px)";

function subscribe(cb: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}

// false during SSR/prerender; corrects on hydration (data renders client-side anyway)
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
