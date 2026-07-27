// Optimistic anime writes: cache mutations + temp→real id resolution.
// The sync queue itself is covered in syncQueue.test.ts, so it's mocked here.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Anime } from "./anime";
import { useAnimeWrites, type AnimePayload } from "./animeWrites";
import { queryKeys } from "./queryKeys";
import { pushAction, registerSyncHandlers } from "./syncQueue";

vi.mock("./syncQueue", () => ({
  generateTempId: () => "temp_1",
  pushAction: vi.fn(),
  registerSyncHandlers: vi.fn(() => () => {}),
}));
vi.mock("./toast", () => ({ toast: vi.fn() }));

const payload: AnimePayload = {
  name: "Monster",
  thumbnail_url: "",
  language: "japanese",
  stars: 9,
  seasons: [{ number: 1, total_episodes: 74, watched_episodes: 10, comment: "" }],
};

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);
const listIn = (catId: number) => qc.getQueryData<Anime[]>(queryKeys.animes(catId));

beforeEach(() => {
  qc = new QueryClient();
  vi.mocked(pushAction).mockClear();
  vi.mocked(registerSyncHandlers).mockClear();
});

describe("useAnimeWrites", () => {
  test("createAnime appends an optimistic temp row and queues a CREATE", () => {
    qc.setQueryData(queryKeys.animes(1), []);
    const { result } = renderHook(() => useAnimeWrites(), { wrapper });
    result.current.createAnime(payload, 1);

    expect(listIn(1)).toMatchObject([{ id: "temp_1", name: "Monster" }]);
    expect(pushAction).toHaveBeenCalledWith({
      type: "CREATE",
      temp_id: "temp_1",
      data: { ...payload, category_id: 1 },
    });
  });

  test("updateAnime moves the row when the category changes", () => {
    qc.setQueryData(queryKeys.animes(1), [
      { ...payload, id: 7, order: 0, seasons: [] } as unknown as Anime,
    ]);
    qc.setQueryData(queryKeys.animes(2), []);
    const { result } = renderHook(() => useAnimeWrites(), { wrapper });
    result.current.updateAnime(payload, 7, 1, 2);

    expect(listIn(1)).toEqual([]);
    expect(listIn(2)).toMatchObject([{ id: 7, name: "Monster" }]);
    expect(pushAction).toHaveBeenCalledWith({
      type: "UPDATE",
      id: 7,
      data: { ...payload, category_id: 2 },
    });
  });

  test("deleteAnime removes the row and queues a DELETE", () => {
    qc.setQueryData(queryKeys.animes(1), [
      { ...payload, id: 7, order: 0, seasons: [] } as unknown as Anime,
    ]);
    const { result } = renderHook(() => useAnimeWrites(), { wrapper });
    result.current.deleteAnime(7, 1);

    expect(listIn(1)).toEqual([]);
    expect(pushAction).toHaveBeenCalledWith({ type: "DELETE", id: 7 });
  });

  test("resolveIds swaps temp ids for real ids across cached categories", () => {
    qc.setQueryData(queryKeys.animes(1), [
      { ...payload, id: "temp_1", order: 0, seasons: [] } as unknown as Anime,
    ]);
    renderHook(() => useAnimeWrites(), { wrapper });

    const handlers = vi.mocked(registerSyncHandlers).mock.calls[0][0];
    handlers.resolveIds({ temp_1: 99 });
    expect(listIn(1)).toMatchObject([{ id: 99 }]);
  });
});
