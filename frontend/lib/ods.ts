"use client";

// Port of import_export.js — same sheet format, same bulk_sync chunking.
// SheetJS is lazy-loaded (dynamic import) so it stays out of the main bundle.

import { apiJson } from "./api";
import type { Category } from "./anime";

type ApiSeason = {
  number: number;
  total_episodes: number;
  watched_episodes: number;
  comment?: string;
};

type ApiAnime = {
  id: number;
  name: string;
  thumbnail_url: string;
  language: string;
  stars: string | number | null;
  seasons: ApiSeason[];
};

function ensureList<T>(data: unknown): T[] {
  return Array.isArray(data)
    ? data
    : (((data as { results?: T[] }).results ?? []) as T[]);
}

// "S1: 5/12 [comment], OVA(after S1): 2/3"
export function formatSeasons(seasons: ApiSeason[] | undefined): string {
  if (!seasons?.length) return "";
  return seasons
    .map((s) => {
      const label =
        s.number % 1 !== 0
          ? `OVA(after S${Math.floor(s.number)})`
          : `S${Math.floor(s.number)}`;
      let text = `${label}: ${s.watched_episodes}/${s.total_episodes}`;
      if (s.comment) text += ` [${s.comment}]`;
      return text;
    })
    .join(", ");
}

export function parseSeasons(seasonStr: string): ApiSeason[] {
  if (!seasonStr?.trim()) return [];
  const seasons: ApiSeason[] = [];
  const ovaCounters: Record<number, number> = {};
  const regex =
    /(?:S(\d+)|OVA\(after S(\d+)\)):\s*(\d+)\/(\d+)(?:\s*\[([^\]]*)\])?/gi;
  let match;
  while ((match = regex.exec(seasonStr)) !== null) {
    const watched = parseInt(match[3]);
    const total = parseInt(match[4]);
    const comment = match[5] ? match[5].trim() : "";
    let number: number;
    if (match[2] !== undefined) {
      const baseNum = parseInt(match[2]);
      ovaCounters[baseNum] = (ovaCounters[baseNum] || 0) + 1;
      number = Number((baseNum + ovaCounters[baseNum] * 0.01).toFixed(2));
    } else {
      number = parseInt(match[1]);
    }
    seasons.push({
      number,
      total_episodes: total,
      watched_episodes: watched,
      comment,
    });
  }
  return seasons;
}

/* ── Export ── */

export async function exportOds(
  onProgress: (pct: number) => void,
  signal: AbortSignal,
): Promise<void> {
  const XLSX = await import("xlsx");

  const categories = ensureList<Category>(
    await apiJson<unknown>("/api/v1/categories/", { signal }),
  );
  if (categories.length === 0) throw new Error("No categories to export");

  const wb = XLSX.utils.book_new();
  for (let i = 0; i < categories.length; i++) {
    if (signal.aborted) throw new Error("Cancelled");
    const cat = categories[i];
    const animeList = ensureList<ApiAnime>(
      await apiJson<unknown>(`/api/v1/categories/${cat.id}/animes/`, {
        signal,
      }),
    );

    const sheetData: (string | number)[][] = [
      ["Name", "Season", "Language", "Stars", "Thumbnail URL"],
    ];
    for (const a of animeList) {
      sheetData.push([
        a.name || "",
        formatSeasons(a.seasons),
        a.language || "",
        a.stars != null ? a.stars : "",
        a.thumbnail_url || "",
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    ws["!cols"] = [
      { wch: 30 },
      { wch: 45 },
      { wch: 12 },
      { wch: 6 },
      { wch: 50 },
    ];
    const sheetName = cat.name.replace(/[\\/?*[\]]/g, "_").substring(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    onProgress(((i + 1) / categories.length) * 100);
  }

  if (signal.aborted) throw new Error("Cancelled");
  XLSX.writeFile(wb, "animelist.ods", { bookType: "ods" });
}

/* ── Import ── */

type RawRow = (string | number | null | undefined)[];
type BulkAction =
  | { type: "CREATE"; data: Record<string, unknown> }
  | { type: "UPDATE"; id: number; data: Record<string, unknown> };

const CHUNK_SIZE = 50;

export async function runImport(
  file: File,
  onProgress: (text: string, pct: number) => void,
): Promise<number> {
  const XLSX = await import("xlsx");

  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
  if (!wb.SheetNames.length) throw new Error("No sheets found in the file");

  const sheetDataMap: { name: string; rows: RawRow[] }[] = [];
  let totalAnime = 0;
  for (const name of wb.SheetNames) {
    const rows: RawRow[] = XLSX.utils.sheet_to_json(wb.Sheets[name], {
      header: 1,
    });
    const dataRows = rows.slice(1).filter((r) => r && r.length > 0 && r[0]);
    totalAnime += dataRows.length;
    sheetDataMap.push({ name, rows: dataRows });
  }

  let processed = 0;
  const progress = (text: string) =>
    onProgress(
      text,
      totalAnime > 0 ? Math.round((processed / totalAnime) * 100) : 0,
    );

  const existingCats = ensureList<Category>(
    await apiJson<unknown>("/api/v1/categories/"),
  );

  for (const sheetInfo of sheetDataMap) {
    const categoryName = sheetInfo.name;
    progress(`Creating category: ${categoryName}…`);

    let catId = existingCats.find((c) => c.name === categoryName)?.id ?? null;
    if (catId == null) {
      const newCat = await apiJson<Category>("/api/v1/categories/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: categoryName }),
      });
      catId = newCat.id;
      existingCats.push(newCat);
    }

    const existingAnime = ensureList<ApiAnime>(
      await apiJson<unknown>(`/api/v1/categories/${catId}/animes/`),
    );
    const animeByName = new Map(existingAnime.map((a) => [a.name, a]));

    let chunkActions: BulkAction[] = [];
    for (let ri = 0; ri < sheetInfo.rows.length; ri++) {
      const row = sheetInfo.rows[ri];
      const animeName = String(row[0] || "").trim();
      if (!animeName) {
        processed++;
        progress("Skipping empty row…");
        continue;
      }

      let stars: number | null =
        row[3] != null && row[3] !== "" ? parseFloat(String(row[3])) : null;
      if (stars != null && isNaN(stars)) stars = null;

      const payload = {
        name: animeName,
        thumbnail_url: row[4] != null ? String(row[4]).trim() : "",
        language: row[2] != null ? String(row[2]).trim() : "",
        stars,
        seasons: parseSeasons(row[1] != null ? String(row[1]) : ""),
        category_id: catId,
      };

      const existing = animeByName.get(animeName);
      chunkActions.push(
        existing
          ? { type: "UPDATE", id: existing.id, data: payload }
          : { type: "CREATE", data: payload },
      );

      processed++;
      progress(`Queuing: ${animeName}`);

      if (chunkActions.length >= CHUNK_SIZE) {
        progress(`Sending ${chunkActions.length} items to cloud...`);
        await apiJson("/api/v1/animes/bulk_sync/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actions: chunkActions }),
        });
        chunkActions = [];
      }
    }

    if (chunkActions.length > 0) {
      progress(`Sending ${chunkActions.length} items to cloud...`);
      await apiJson("/api/v1/animes/bulk_sync/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actions: chunkActions }),
      });
    }
  }

  return processed;
}
