// Port of core/static/core/js/anime_renderer.js normalization helpers.

export type Season = {
  number: number;
  total: number;
  watched: number;
  completed: boolean;
  comment: string;
  isOva: boolean;
};

export type Anime = {
  id: number | string;
  name: string;
  thumbnail_url: string;
  language: string;
  stars: string | number | null;
  order: number;
  seasons: Season[];
};

export type Category = { id: number; name: string; order: number };

const LANG_MAP: Record<string, string> = {
  jap: "Japanese",
  japanese: "Japanese",
  jp: "Japanese",
  eng: "English",
  english: "English",
  en: "English",
  kor: "Korean",
  korean: "Korean",
  chi: "Chinese",
  chinese: "Chinese",
};

export function parseLanguages(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((l) => l.trim().toLowerCase())
    .filter(Boolean)
    .map((l) => LANG_MAP[l] || l.charAt(0).toUpperCase() + l.slice(1));
}

export function sanitizeUrl(url: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.href;
    }
  } catch {}
  return "";
}

// Accepts both API shape (total_episodes/watched_episodes/is_completed) and
// already-normalized shape (total/watched/completed).
export function normalizeSeason(s: Record<string, unknown>): Season {
  const total =
    s.total_episodes != null ? Number(s.total_episodes) : Number(s.total || 0);
  const watched =
    s.watched_episodes != null
      ? Number(s.watched_episodes)
      : Number(s.watched || 0);
  const completed =
    s.is_completed != null
      ? Boolean(s.is_completed)
      : s.completed != null
        ? Boolean(s.completed)
        : total > 0 && watched >= total;
  const num = Number(s.number) || 1;
  return {
    number: num,
    total,
    watched,
    completed,
    comment: String(s.comment || ""),
    isOva: num % 1 !== 0,
  };
}

export function normalizeAnime(raw: Record<string, unknown>): Anime {
  return {
    id: raw.id as number,
    name: String(raw.name || ""),
    thumbnail_url: String(raw.thumbnail_url || ""),
    language: String(raw.language || ""),
    stars: raw.stars as string | number | null,
    order: Number(raw.order || 0),
    seasons: (Array.isArray(raw.seasons) ? raw.seasons : []).map(
      normalizeSeason,
    ),
  };
}

export function starsNum(val: Anime["stars"]): number {
  const n = parseFloat(String(val));
  return isNaN(n) ? 0 : n;
}

export function seasonLabel(s: Season, long = false): string {
  if (s.isOva) return "OVA";
  return (long ? "Season " : "S") + Math.floor(s.number);
}
