// Runnable sanity check for the anime_filter.js port: `npx tsx lib/filters.check.ts`
// Folds into the vitest suite in phase 8.
import { applyFilters, toggleFilter, EMPTY_FILTERS } from "./filters";
import { normalizeAnime } from "./anime";

const raw = [
  { id: 1, name: "Zeta", stars: "8.0", language: "japanese,english", seasons: [{ number: 1, total_episodes: 12, watched_episodes: 12, is_completed: true }] },
  { id: 2, name: "Alpha", stars: "5.0", language: "kor", seasons: [{ number: 1, total_episodes: 12, watched_episodes: 4 }] },
  { id: 3, name: "Mid", stars: "9.5", language: "", seasons: [{ number: 1.5, total_episodes: 0, watched_episodes: 0 }] },
];
const list = raw.map((r) => normalizeAnime(r as Record<string, unknown>));

function assert(cond: boolean, label: string) {
  if (!cond) throw new Error("FAILED: " + label);
}

// no filters: same array back, original order preserved
assert(applyFilters(list, EMPTY_FILTERS) === list, "identity");
// watching: only #2 (partial); #3 excluded (0/0 seasons = no data)
let f = toggleFilter(EMPTY_FILTERS, "status", "watching");
assert(applyFilters(list, f).map((a) => a.id).join() === "2", "watching");
// completed: only #1
f = toggleFilter(EMPTY_FILTERS, "status", "completed");
assert(applyFilters(list, f).map((a) => a.id).join() === "1", "completed");
// ova attr: only #3 (season 1.5)
f = toggleFilter(EMPTY_FILTERS, "attr", "ova");
assert(applyFilters(list, f).map((a) => a.id).join() === "3", "ova");
// lang substring match on the raw language field
f = toggleFilter(EMPTY_FILTERS, "lang", "Japanese");
assert(applyFilters(list, f).map((a) => a.id).join() === "1", "lang");
// sorts
f = toggleFilter(EMPTY_FILTERS, "sort", "az");
assert(applyFilters(list, f).map((a) => a.name).join() === "Alpha,Mid,Zeta", "az");
f = toggleFilter(EMPTY_FILTERS, "sort", "rating_high");
assert(applyFilters(list, f).map((a) => a.id).join() === "3,1,2", "rating_high");
// grouping puts watching entries first
f = toggleFilter(EMPTY_FILTERS, "status", "watching_first");
assert(applyFilters(list, f)[0].id === 2, "watching_first");
// toggling the same value twice turns it off
f = toggleFilter(toggleFilter(EMPTY_FILTERS, "lang", "Korean"), "lang", "Korean");
assert(f.lang === null, "toggle off");

console.log("all filter checks passed");
