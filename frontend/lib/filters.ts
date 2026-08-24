// Port of core/static/core/js/anime_filter.js — same cookie, same semantics.
import type { Anime } from "./anime";
import { starsNum } from "./anime";

export type Filters = {
  sort: string | null;
  status: string | null;
  attr: string[];
  lang: string | null;
};

export const EMPTY_FILTERS: Filters = {
  sort: null,
  status: null,
  attr: [],
  lang: null,
};

const COOKIE_NAME = "anime_list_filters";

export function hasActiveFilters(f: Filters): boolean {
  return Boolean(f.sort || f.status || f.attr.length > 0 || f.lang);
}

export function loadFilters(): Filters {
  if (typeof document === "undefined") return EMPTY_FILTERS;
  const name = COOKIE_NAME + "=";
  for (const c of decodeURIComponent(document.cookie).split(";")) {
    const t = c.trim();
    if (t.startsWith(name)) {
      try {
        const val = JSON.parse(t.slice(name.length));
        if (val && typeof val === "object") {
          return {
            sort: val.sort || null,
            status: val.status || null,
            attr: Array.isArray(val.attr) ? val.attr : [],
            lang: val.lang || null,
          };
        }
      } catch {}
      break;
    }
  }
  return EMPTY_FILTERS;
}

export function saveFilters(f: Filters): void {
  if (!hasActiveFilters(f)) {
    document.cookie =
      COOKIE_NAME + "=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/";
    return;
  }
  const d = new Date();
  d.setTime(d.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
  document.cookie =
    COOKIE_NAME +
    "=" +
    encodeURIComponent(JSON.stringify(f)) +
    ";expires=" +
    d.toUTCString() +
    ";path=/";
}

export function toggleFilter(f: Filters, type: string, val: string): Filters {
  const next = { ...f, attr: [...f.attr] };
  if (type === "sort") next.sort = f.sort === val ? null : val;
  else if (type === "status") next.status = f.status === val ? null : val;
  else if (type === "attr") {
    const idx = next.attr.indexOf(val);
    if (idx > -1) next.attr.splice(idx, 1);
    else next.attr.push(val);
  } else if (type === "lang") next.lang = f.lang === val ? null : val;
  return next;
}

function watchStatus(a: Anime): { w: boolean; c: boolean } {
  if (!a.seasons || a.seasons.length === 0) return { w: false, c: false };
  let isW = false;
  let hasData = false;
  for (const s of a.seasons) {
    if (s.total > 0 || s.watched > 0) hasData = true;
    if (s.watched < s.total || (s.total === 0 && s.watched > 0)) isW = true;
  }
  return hasData ? { w: isW, c: !isW } : { w: false, c: false };
}

function hasOva(a: Anime): boolean {
  return (a.seasons || []).some((s) => s.isOva || s.number % 1 !== 0);
}

export function applyFilters(list: Anime[], f: Filters): Anime[] {
  if (!list) return [];
  if (!hasActiveFilters(f)) return list; // preserve original array and order

  let result = list.slice();

  if (f.status === "watching" || f.status === "completed") {
    result = result.filter((a) => {
      const st = watchStatus(a);
      if (!st.w && !st.c) return false; // no data / all 0-0 seasons
      return f.status === "watching" ? st.w : st.c;
    });
  }

  if (f.attr.includes("ova")) {
    result = result.filter(hasOva);
  }

  if (f.lang) {
    const filterLang = f.lang.toLowerCase();
    result = result.filter((a) => {
      const aLang = a.language ? a.language.toLowerCase() : "";
      return aLang.includes(filterLang) || aLang === filterLang;
    });
  }

  const isWatchingFirst = f.status === "watching_first";
  const isCompletedFirst = f.status === "completed_first";
  const isOvaFirst = f.attr.includes("ova_first");

  if (isWatchingFirst || isCompletedFirst || isOvaFirst || f.sort) {
    result.sort((a, b) => {
      if (isWatchingFirst || isCompletedFirst) {
        const stA = watchStatus(a);
        const stB = watchStatus(b);
        if (isWatchingFirst) {
          if (stA.w !== stB.w) return stA.w ? -1 : 1;
        } else if (stA.c !== stB.c) {
          return stA.c ? -1 : 1;
        }
      }
      if (isOvaFirst) {
        const ovaA = hasOva(a);
        const ovaB = hasOva(b);
        if (ovaA !== ovaB) return ovaA ? -1 : 1;
      }
      if (f.sort === "az") return (a.name || "").localeCompare(b.name || "");
      if (f.sort === "za") return (b.name || "").localeCompare(a.name || "");
      if (f.sort === "rating_high") return starsNum(b.stars) - starsNum(a.stars);
      if (f.sort === "rating_low") return starsNum(a.stars) - starsNum(b.stars);
      return 0;
    });
  }

  return result;
}
