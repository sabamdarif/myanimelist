// Runnable sanity check for search match-splitting: `npx tsx lib/search.check.ts`
// Folds into the vitest suite in phase 8.
import { splitMatch } from "./search";

function assert(cond: boolean, label: string) {
  if (!cond) throw new Error("FAILED: " + label);
}

// case-insensitive hit, boundaries exact
assert(
  JSON.stringify(splitMatch("Steins;Gate", "GATE")) ===
    JSON.stringify(["Steins;", "Gate", ""]),
  "case-insensitive split",
);
// hit at start
assert(
  JSON.stringify(splitMatch("Monster", "mon")) ===
    JSON.stringify(["", "Mon", "ster"]),
  "prefix split",
);
// whitespace-only query and miss → null
assert(splitMatch("Monster", "  ") === null, "blank query");
assert(splitMatch("Monster", "xyz") === null, "no match");
// query longer than text → null, no slice blowup
assert(splitMatch("K", "K-On!!") === null, "query longer than text");

console.log("search.check OK");
