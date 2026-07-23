"use client";

// Optimistic reorder persistence (plan.md decision 4): cache updates first,
// PATCH the order endpoint, roll the cache back on error.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Anime, Category } from "./anime";
import { apiJson } from "./api";
import { queryKeys } from "./queryKeys";

function patchOrder(url: string, ids: (number | string)[]) {
  return apiJson(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order: ids }),
  });
}

export function useAnimeReorder(categoryId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ordered: Anime[]) =>
      patchOrder(
        `/api/v1/categories/${categoryId}/animes/order/`,
        ordered.map((a) => a.id),
      ),
    onMutate: async (ordered) => {
      const key = queryKeys.animes(categoryId as number);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Anime[]>(key);
      qc.setQueryData<Anime[]>(key, ordered);
      return { key, prev };
    },
    onError: (_err, _ordered, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
    },
  });
}

export function useCategoryReorder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ordered: Category[]) =>
      patchOrder(
        "/api/v1/categories/order/",
        ordered.map((c) => c.id),
      ),
    onMutate: async (ordered) => {
      await qc.cancelQueries({ queryKey: queryKeys.categories });
      const prev = qc.getQueryData<Category[]>(queryKeys.categories);
      qc.setQueryData<Category[]>(queryKeys.categories, ordered);
      return { prev };
    },
    onError: (_err, _ordered, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.categories, ctx.prev);
    },
  });
}
