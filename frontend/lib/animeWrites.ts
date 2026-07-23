"use client";

// Optimistic anime writes (plan.md decision 5). Each write updates the
// TanStack cache immediately, then enqueues a bulk_sync action. Temp→real id
// resolution and error rollback are wired through registerSyncHandlers.

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { type Anime, normalizeAnime } from "./anime";
import { queryKeys } from "./queryKeys";
import { generateTempId, pushAction, registerSyncHandlers } from "./syncQueue";
import { toast } from "./toast";

// modal payload → the shape the API + normalizeAnime expect
export type AnimePayload = {
  name: string;
  thumbnail_url: string;
  language: string;
  stars: number | null;
  seasons: {
    number: number;
    total_episodes: number;
    watched_episodes: number;
    comment: string;
  }[];
};

function optimisticAnime(
  id: number | string,
  payload: AnimePayload,
  order: number,
): Anime {
  return normalizeAnime({ id, order, ...payload });
}

export function useAnimeWrites() {
  const qc = useQueryClient();

  // register cache handlers once for the queue (temp→real swap, error refetch)
  useEffect(() => {
    return registerSyncHandlers({
      resolveIds: (map) => {
        // swap temp ids for real ids across every cached category, in place —
        // avoids a refetch flash and keeps later edits pointing at real ids
        for (const [key, data] of qc.getQueriesData<Anime[]>({
          queryKey: ["animes"],
        })) {
          if (!Array.isArray(data)) continue;
          let changed = false;
          const next = data.map((a) => {
            const real = map[a.id as string];
            if (real != null) {
              changed = true;
              return { ...a, id: real };
            }
            return a;
          });
          if (changed) qc.setQueryData(key, next);
        }
      },
      onError: () => {
        toast("Sync failed, restoring", "error");
        qc.invalidateQueries({ queryKey: ["animes"] });
      },
    });
  }, [qc]);

  const createAnime = (payload: AnimePayload, catId: number) => {
    const tempId = generateTempId();
    const key = queryKeys.animes(catId);
    const current = qc.getQueryData<Anime[]>(key) ?? [];
    qc.setQueryData<Anime[]>(key, [
      ...current,
      optimisticAnime(tempId, payload, current.length),
    ]);
    pushAction({
      type: "CREATE",
      temp_id: tempId,
      data: { ...payload, category_id: catId },
    });
    toast(`"${payload.name}" added`);
  };

  const updateAnime = (
    payload: AnimePayload,
    animeId: number | string,
    oldCatId: number,
    newCatId: number,
  ) => {
    const action = {
      type: "UPDATE" as const,
      data: { ...payload, category_id: newCatId },
      ...(typeof animeId === "string" && animeId.startsWith("temp_")
        ? { temp_id: animeId }
        : { id: Number(animeId) }),
    };
    pushAction(action);

    if (oldCatId !== newCatId) {
      // drop from old category; append to new one if it's cached
      const oldKey = queryKeys.animes(oldCatId);
      qc.setQueryData<Anime[]>(oldKey, (old) =>
        old?.filter((a) => String(a.id) !== String(animeId)),
      );
      const newKey = queryKeys.animes(newCatId);
      const newList = qc.getQueryData<Anime[]>(newKey);
      if (newList) {
        qc.setQueryData<Anime[]>(newKey, [
          ...newList,
          optimisticAnime(animeId, payload, newList.length),
        ]);
      }
    } else {
      const key = queryKeys.animes(newCatId);
      qc.setQueryData<Anime[]>(key, (old) =>
        old?.map((a) =>
          String(a.id) === String(animeId)
            ? optimisticAnime(animeId, payload, a.order)
            : a,
        ),
      );
    }
    toast(`"${payload.name}" updated`);
  };

  const deleteAnime = (animeId: number | string, catId: number) => {
    const action = {
      type: "DELETE" as const,
      ...(typeof animeId === "string" && animeId.startsWith("temp_")
        ? { temp_id: animeId }
        : { id: Number(animeId) }),
    };
    pushAction(action);
    qc.setQueryData<Anime[]>(queryKeys.animes(catId), (old) =>
      old?.filter((a) => String(a.id) !== String(animeId)),
    );
    toast("Anime deleted");
  };

  return { createAnime, updateAnime, deleteAnime };
}
