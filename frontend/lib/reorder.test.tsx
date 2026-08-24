// Optimistic reorder: cache updates first, rolls back when the PATCH fails.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Anime } from "./anime";
import { queryKeys } from "./queryKeys";
import { useAnimeReorder, useCategoryReorder } from "./reorder";

const apiJson = vi.fn();
vi.mock("./api", () => ({
  apiJson: (...args: unknown[]) => apiJson(...args),
}));

const anime = (id: number): Anime => ({
  id,
  name: "A" + id,
  thumbnail_url: "",
  language: "",
  stars: null,
  order: 0,
  seasons: [],
});

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

beforeEach(() => {
  qc = new QueryClient();
  apiJson.mockReset();
});

describe("useAnimeReorder", () => {
  const key = queryKeys.animes(1);
  const [a, b] = [anime(1), anime(2)];

  test("optimistically reorders the cache and PATCHes the id order", async () => {
    qc.setQueryData(key, [a, b]);
    let resolve!: (v: unknown) => void;
    apiJson.mockImplementation(() => new Promise((r) => (resolve = r)));

    const { result } = renderHook(() => useAnimeReorder(1), { wrapper });
    result.current.mutate([b, a]);

    // optimistic: cache reordered while the PATCH is still pending
    await waitFor(() => expect(qc.getQueryData(key)).toEqual([b, a]));
    resolve({});
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url, opts] = apiJson.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/categories/1/animes/order/");
    expect(JSON.parse(opts.body as string)).toEqual({ order: [2, 1] });
  });

  test("rolls the cache back on error", async () => {
    qc.setQueryData(key, [a, b]);
    apiJson.mockRejectedValue(new Error("500"));

    const { result } = renderHook(() => useAnimeReorder(1), { wrapper });
    result.current.mutate([b, a]);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(key)).toEqual([a, b]);
  });
});

describe("useCategoryReorder", () => {
  const cats = [
    { id: 1, name: "One", order: 0 },
    { id: 2, name: "Two", order: 1 },
  ];

  test("rolls the tab order back on error", async () => {
    qc.setQueryData(queryKeys.categories, cats);
    apiJson.mockRejectedValue(new Error("500"));

    const { result } = renderHook(() => useCategoryReorder(), { wrapper });
    result.current.mutate([cats[1], cats[0]]);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(queryKeys.categories)).toEqual(cats);
  });
});
