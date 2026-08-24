// splitMatch (was lib/search.check.ts) + the sessionStorage/event handoff
// used to navigate from a header search result to the /list row.
import { describe, expect, test, vi } from "vitest";
import {
  consumeAnimeNavigation,
  requestAnimeNavigation,
  SEARCH_NAV_EVENT,
  SEARCH_NAV_KEY,
  splitMatch,
} from "./search";

describe("splitMatch", () => {
  test("case-insensitive hit, boundaries exact", () => {
    expect(splitMatch("Steins;Gate", "GATE")).toEqual(["Steins;", "Gate", ""]);
  });

  test("hit at start", () => {
    expect(splitMatch("Monster", "mon")).toEqual(["", "Mon", "ster"]);
  });

  test("whitespace-only query and miss → null", () => {
    expect(splitMatch("Monster", "  ")).toBeNull();
    expect(splitMatch("Monster", "xyz")).toBeNull();
  });

  test("query longer than text → null, no slice blowup", () => {
    expect(splitMatch("K", "K-On!!")).toBeNull();
  });
});

describe("search navigation handoff", () => {
  test("request fires the event and consume returns the payload once", () => {
    const onNav = vi.fn();
    window.addEventListener(SEARCH_NAV_EVENT, onNav);
    requestAnimeNavigation(3, 42);
    expect(onNav).toHaveBeenCalledOnce();
    window.removeEventListener(SEARCH_NAV_EVENT, onNav);

    expect(consumeAnimeNavigation()).toEqual({ categoryId: 3, animeId: 42 });
    // consumed: second read is empty
    expect(consumeAnimeNavigation()).toBeNull();
  });

  test("garbage in sessionStorage → null, not a throw", () => {
    sessionStorage.setItem(SEARCH_NAV_KEY, "{not json");
    expect(consumeAnimeNavigation()).toBeNull();
    sessionStorage.setItem(SEARCH_NAV_KEY, JSON.stringify({ categoryId: "x" }));
    expect(consumeAnimeNavigation()).toBeNull();
  });
});
