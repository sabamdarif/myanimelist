"use client";

// Category add/edit/delete via TanStack mutations (plan.md: no location.reload).
// Create/edit invalidate the categories query; delete also drops the deleted
// category's cached anime list and clears it from active_category storage.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type Category } from "./anime";
import { apiJson } from "./api";
import { queryKeys } from "./queryKeys";
import { toast } from "./toast";

export function useCategoryWrites() {
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: (name: string) =>
      apiJson<Category>("/api/v1/categories/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }),
    onSuccess: (cat) => {
      try {
        localStorage.setItem("active_category", String(cat.id));
      } catch {}
      qc.invalidateQueries({ queryKey: queryKeys.categories });
      toast(`Category "${cat.name}" added`);
    },
  });

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      apiJson<Category>(`/api/v1/categories/${id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }),
    onSuccess: (cat) => {
      qc.invalidateQueries({ queryKey: queryKeys.categories });
      toast(`Renamed to "${cat.name}"`);
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) =>
      apiJson(`/api/v1/categories/${id}/`, { method: "DELETE" }),
    onSuccess: (_res, id) => {
      try {
        if (localStorage.getItem("active_category") === String(id)) {
          localStorage.removeItem("active_category");
        }
      } catch {}
      qc.removeQueries({ queryKey: queryKeys.animes(id) });
      qc.invalidateQueries({ queryKey: queryKeys.categories });
      toast("Category deleted");
    },
  });

  return { create, rename, remove };
}
