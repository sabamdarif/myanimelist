"use client";

// Port of core/static/core/js/search.js — server-side ?q= instead of the
// old load-everything client index (plan.md decision 1).
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiJson } from "./api";
import { type Anime, normalizeAnime } from "./anime";
import { applyFilters, loadFilters } from "./filters";
import { queryKeys } from "./queryKeys";

const DEBOUNCE_MS = 200;

export type SearchResult = Anime & {
  categoryId: number;
  categoryName: string;
};

async function fetchSearch(q: string): Promise<SearchResult[]> {
  const data = await apiJson<unknown>(
    `/api/v1/animes/search/?q=${encodeURIComponent(q)}`,
  );
  const list = Array.isArray(data)
    ? data
    : ((data as { results?: unknown[] }).results ?? []);
  return (list as Record<string, unknown>[]).map((raw) => ({
    ...normalizeAnime(raw),
    categoryId: Number(raw.category_id),
    categoryName: String(raw.category_name || ""),
  }));
}

// Debounced server search; active filters apply client-side to the ≤15
// results (same behavior as the old app). `settled` = results are for the
// current query (drives the "No results" empty state vs. loader).
export function useAnimeSearch(query: string) {
  const q = query.trim();
  const [debouncedQ, setDebouncedQ] = useState("");

  useEffect(() => {
    if (!q) {
      setDebouncedQ("");
      return;
    }
    const t = setTimeout(() => setDebouncedQ(q), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  const searchQ = useQuery({
    queryKey: queryKeys.search(debouncedQ),
    queryFn: () => fetchSearch(debouncedQ),
    enabled: debouncedQ.length > 0,
    staleTime: 30_000,
    placeholderData: (prev) => prev, // keep old results visible while typing
  });

  const results =
    q && searchQ.data
      ? (applyFilters(searchQ.data, loadFilters()) as SearchResult[])
      : [];
  const loading = q.length > 0 && (searchQ.isFetching || debouncedQ !== q);
  const settled = searchQ.data !== undefined && !loading;

  return { results, loading, settled };
}

// [before, match, after] on a case-insensitive hit, null otherwise.
export function splitMatch(
  text: string,
  query: string,
): [string, string, string] | null {
  const q = query.trim();
  if (!q) return null;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return null;
  return [
    text.slice(0, idx),
    text.slice(idx, idx + q.length),
    text.slice(idx + q.length),
  ];
}

export function MarkMatch({ text, query }: { text: string; query: string }) {
  const parts = splitMatch(text, query);
  if (!parts) return <>{text}</>;
  return (
    <>
      {parts[0]}
      <mark>{parts[1]}</mark>
      {parts[2]}
    </>
  );
}

/* ── Navigate to a search result ─────────────────────────────
   Header (root layout) can't reach ListPage state, so hand off via
   sessionStorage + event — same pattern as anilist:open-mobile-search.
   sessionStorage covers the cross-route case (result picked while
   not on /list; ListPage consumes it on mount). */

export const SEARCH_NAV_KEY = "search_nav";
export const SEARCH_NAV_EVENT = "anilist:search-navigate";

export function requestAnimeNavigation(
  categoryId: number,
  animeId: number | string,
) {
  try {
    sessionStorage.setItem(
      SEARCH_NAV_KEY,
      JSON.stringify({ categoryId, animeId }),
    );
  } catch {}
  window.dispatchEvent(new CustomEvent(SEARCH_NAV_EVENT));
}

export function consumeAnimeNavigation(): {
  categoryId: number;
  animeId: number | string;
} | null {
  try {
    const raw = sessionStorage.getItem(SEARCH_NAV_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(SEARCH_NAV_KEY);
    const val = JSON.parse(raw);
    if (val && typeof val.categoryId === "number" && val.animeId != null) {
      return val;
    }
  } catch {}
  return null;
}
