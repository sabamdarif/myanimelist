"use client";

// Port of home.js Jikan helpers — same sessionStorage cache keys/TTL,
// same retry/backoff/throttle behavior.

const JIKAN_BASE_URL = "https://api.jikan.moe/v4";
const CACHE_TTL_MS = 5 * 60 * 1000;

export type JikanAnime = {
  mal_id: number;
  title: string;
  title_english?: string | null;
  type?: string;
  score?: number | null;
  rating?: string | null;
  duration?: string | null;
  episodes?: number | null;
  status?: string;
  synopsis?: string | null;
  year?: number | null;
  aired?: { from?: string | null; prop?: { from?: { year?: number | null } } };
  broadcast?: { day?: string | null; string?: string | null };
  images?: {
    webp?: { large_image_url?: string };
    jpg?: { large_image_url?: string };
  };
  genres?: { name: string }[];
  studios?: { name: string }[];
};

type JikanResponse = {
  data?: JikanAnime[];
  pagination?: { last_visible_page?: number };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchCached(
  cacheKey: string,
  url: string,
  maxRetries = 3,
): Promise<JikanResponse | null> {
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.timestamp < CACHE_TTL_MS) return parsed.data;
    } catch {}
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) await sleep(attempt * 1500);
      const res = await fetch(url);
      // retry rate limits and server errors
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        continue;
      }
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      await sleep(500); // rudimentary global rate-limit spacing
      const data = await res.json();
      try {
        sessionStorage.setItem(
          cacheKey,
          JSON.stringify({ timestamp: Date.now(), data }),
        );
      } catch {}
      return data;
    } catch (e) {
      if (e instanceof TypeError) continue; // network error — retryable
      return null; // non-retryable (4xx)
    }
  }

  // retries exhausted — fall back to stale cache
  if (cached) {
    try {
      return JSON.parse(cached).data;
    } catch {}
  }
  return null;
}

export function jikanTitle(item: JikanAnime): string {
  return item.title_english || item.title;
}

export function jikanImage(item: JikanAnime): string {
  return (
    item.images?.webp?.large_image_url ||
    item.images?.jpg?.large_image_url ||
    ""
  );
}

export function parseDuration(durationStr?: string | null): string {
  if (!durationStr || durationStr === "Unknown") return "?m";
  const match = durationStr.match(/(\d+)\s*min/);
  return match ? `${match[1]}m` : "?m";
}

const RATING_MAP: Record<string, string> = {
  "G - All Ages": "G",
  "PG - Children": "PG",
  "PG-13 - Teens 13 or older": "PG-13",
  "R - 17+ (violence & profanity)": "R-17+",
  "R+ - Mild Nudity": "R+",
  "Rx - Hentai": "Rx",
};

export function parseRating(ratingStr?: string | null): string | null {
  if (!ratingStr) return null;
  return RATING_MAP[ratingStr] || ratingStr.split(" ")[0];
}

export function calculateAiredEpisodes(item: JikanAnime): string {
  const total: number | string = item.episodes || "?";
  if (item.status === "Finished Airing") return `${total} / ${total}`;
  if (item.status === "Not yet aired") return `0 / ${total}`;

  const airedFrom = item.aired?.from;
  if (!airedFrom) return `? / ${total}`;

  const start = new Date(airedFrom);
  const now = new Date();
  if (now < start) return `0 / ${total}`;

  // assume 1 episode per week
  const weeksPassed = Math.floor(
    (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 7),
  );
  const currentAired = weeksPassed + 1;
  if (total !== "?" && currentAired > (total as number))
    return `${total} / ${total}`;
  return `${currentAired} / ${total}`;
}

export function dedupeById(items: JikanAnime[]): JikanAnime[] {
  const seen = new Set<number>();
  return items.filter((item) => {
    if (seen.has(item.mal_id)) return false;
    seen.add(item.mal_id);
    return true;
  });
}

/* ── Section loaders (same cache keys as home.js) ── */

export async function loadLatestEpisodes(
  latestPage: number,
): Promise<JikanAnime[]> {
  const d = new Date();
  d.setDate(d.getDate() - (latestPage - 1));
  const dayStr = d
    .toLocaleDateString("en-US", { weekday: "long" })
    .toLowerCase();

  let response = await fetchCached(
    `jikan_schedules_${dayStr}`,
    `${JIKAN_BASE_URL}/schedules?filter=${dayStr}&limit=24&page=1`,
  );

  // fallback: unfiltered schedules, filtered client-side by broadcast day
  if (!response?.data) {
    const allResponse = await fetchCached(
      "jikan_schedules_all",
      `${JIKAN_BASE_URL}/schedules?limit=25&page=1`,
    );
    if (allResponse?.data) {
      const targetDay = dayStr.charAt(0).toUpperCase() + dayStr.slice(1) + "s";
      const matches = (item: JikanAnime) =>
        item.broadcast?.day === targetDay ||
        item.broadcast?.string?.toLowerCase().includes(dayStr);
      const filtered = allResponse.data.filter(matches);
      const totalPages = allResponse.pagination?.last_visible_page || 1;
      for (let page = 2; page <= totalPages && page <= 6; page++) {
        const pageResponse = await fetchCached(
          `jikan_schedules_all_p${page}`,
          `${JIKAN_BASE_URL}/schedules?limit=25&page=${page}`,
        );
        if (pageResponse?.data) filtered.push(...pageResponse.data.filter(matches));
        await sleep(400);
      }
      response = { data: filtered.slice(0, 24) };
    }
  }

  return response?.data || [];
}

const TRENDING_FILTER_MAP: Record<string, string> = {
  day: "airing",
  week: "bypopularity",
  month: "favorite",
};

export async function loadTrending(
  trendingFilter: string,
): Promise<JikanAnime[]> {
  const jikanFilter = TRENDING_FILTER_MAP[trendingFilter] || "airing";
  const response = await fetchCached(
    `jikan_trending_${jikanFilter}`,
    `${JIKAN_BASE_URL}/top/anime?filter=${jikanFilter}&limit=10`,
  );
  return response?.data || [];
}

export async function loadUpcoming(): Promise<JikanAnime[]> {
  const response = await fetchCached(
    "jikan_upcoming",
    `${JIKAN_BASE_URL}/seasons/upcoming?limit=10`,
  );
  return response?.data || [];
}

export function formatDayLabel(pageOffset: number): string {
  if (pageOffset === 1) return "Today";
  if (pageOffset === 2) return "Yesterday";
  const d = new Date();
  d.setDate(d.getDate() - (pageOffset - 1));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
