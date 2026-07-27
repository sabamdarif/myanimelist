// Port of the anime_filter.js semantics (was lib/filters.check.ts).
import { describe, expect, test } from "vitest";
import { normalizeAnime } from "./anime";
import {
  applyFilters,
  EMPTY_FILTERS,
  type Filters,
  loadFilters,
  saveFilters,
  toggleFilter,
} from "./filters";

const raw = [
  { id: 1, name: "Zeta", stars: "8.0", language: "japanese,english", seasons: [{ number: 1, total_episodes: 12, watched_episodes: 12, is_completed: true }] },
  { id: 2, name: "Alpha", stars: "5.0", language: "kor", seasons: [{ number: 1, total_episodes: 12, watched_episodes: 4 }] },
  { id: 3, name: "Mid", stars: "9.5", language: "", seasons: [{ number: 1.5, total_episodes: 0, watched_episodes: 0 }] },
];
const list = raw.map((r) => normalizeAnime(r as Record<string, unknown>));

const ids = (f: Filters) =>
  applyFilters(list, f)
    .map((a) => a.id)
    .join();

describe("applyFilters", () => {
  test("no filters: same array back, original order preserved", () => {
    expect(applyFilters(list, EMPTY_FILTERS)).toBe(list);
  });

  test("watching: partial only; 0/0 seasons excluded (no data)", () => {
    expect(ids(toggleFilter(EMPTY_FILTERS, "status", "watching"))).toBe("2");
  });

  test("completed", () => {
    expect(ids(toggleFilter(EMPTY_FILTERS, "status", "completed"))).toBe("1");
  });

  test("ova attr matches fractional season numbers", () => {
    expect(ids(toggleFilter(EMPTY_FILTERS, "attr", "ova"))).toBe("3");
  });

  test("lang substring match on the raw language field", () => {
    expect(ids(toggleFilter(EMPTY_FILTERS, "lang", "Japanese"))).toBe("1");
  });

  test("sort az / rating_high", () => {
    const az = applyFilters(list, toggleFilter(EMPTY_FILTERS, "sort", "az"));
    expect(az.map((a) => a.name).join()).toBe("Alpha,Mid,Zeta");
    expect(ids(toggleFilter(EMPTY_FILTERS, "sort", "rating_high"))).toBe(
      "3,1,2",
    );
  });

  test("watching_first groups watching entries first", () => {
    const f = toggleFilter(EMPTY_FILTERS, "status", "watching_first");
    expect(applyFilters(list, f)[0].id).toBe(2);
  });
});

describe("toggleFilter", () => {
  test("toggling the same value twice turns it off", () => {
    const f = toggleFilter(
      toggleFilter(EMPTY_FILTERS, "lang", "Korean"),
      "lang",
      "Korean",
    );
    expect(f.lang).toBeNull();
  });
});

describe("cookie persistence", () => {
  test("save → load round-trips; empty filters clear the cookie", () => {
    const f = toggleFilter(
      toggleFilter(EMPTY_FILTERS, "status", "watching"),
      "attr",
      "ova",
    );
    saveFilters(f);
    expect(loadFilters()).toEqual(f);
    saveFilters(EMPTY_FILTERS);
    expect(loadFilters()).toEqual(EMPTY_FILTERS);
  });
});
