// bulk_sync queue: action squashing, flush, error retention.
// The queue is module-level state, so each test re-imports a fresh module.
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { SyncAction } from "./syncQueue";

const apiFetch = vi.fn();
vi.mock("./api", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  getAccessToken: () => "tok",
}));

const STORAGE_KEY = "anime_sync_queue";
const storedQueue = (): SyncAction[] =>
  JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");

async function freshQueue() {
  vi.resetModules();
  return import("./syncQueue");
}

beforeEach(() => {
  localStorage.clear();
  apiFetch.mockReset();
});

describe("pushAction squashing", () => {
  test("UPDATE merges into a queued CREATE for the same temp id", async () => {
    const sq = await freshQueue();
    sq.pushAction({ type: "CREATE", temp_id: "temp_1", data: { name: "A", stars: 5 } });
    sq.pushAction({ type: "UPDATE", temp_id: "temp_1", data: { stars: 9 } });
    expect(storedQueue()).toEqual([
      { type: "CREATE", temp_id: "temp_1", data: { name: "A", stars: 9 } },
    ]);
  });

  test("DELETE of a queued CREATE cancels both", async () => {
    const sq = await freshQueue();
    sq.pushAction({ type: "CREATE", temp_id: "temp_1", data: { name: "A" } });
    sq.pushAction({ type: "DELETE", temp_id: "temp_1" });
    expect(storedQueue()).toEqual([]);
  });

  test("DELETE of a real id drops pending UPDATEs and queues the DELETE", async () => {
    const sq = await freshQueue();
    sq.pushAction({ type: "UPDATE", id: 7, data: { stars: 9 } });
    sq.pushAction({ type: "DELETE", id: 7 });
    expect(storedQueue()).toEqual([{ type: "DELETE", id: 7 }]);
  });
});

describe("flush", () => {
  test("posts queued actions, clears queue, resolves temp ids", async () => {
    const sq = await freshQueue();
    const resolveIds = vi.fn();
    sq.registerSyncHandlers({ resolveIds, onError: vi.fn() });
    apiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ created_ids: { temp_1: 99 } }),
    });

    sq.pushAction({ type: "CREATE", temp_id: "temp_1", data: { name: "A" } });
    sq.flushNow();

    await vi.waitFor(() => {
      expect(resolveIds).toHaveBeenCalledWith({ temp_1: 99 });
    });
    const [url, opts] = apiFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/animes/bulk_sync/");
    expect(JSON.parse(opts.body as string).actions).toHaveLength(1);
    expect(storedQueue()).toEqual([]);
  });

  test("failed flush keeps the queue and reports the error", async () => {
    const sq = await freshQueue();
    const onError = vi.fn();
    sq.registerSyncHandlers({ resolveIds: vi.fn(), onError });
    apiFetch.mockRejectedValue(new Error("down"));

    sq.pushAction({ type: "UPDATE", id: 7, data: { stars: 9 } });
    sq.flushNow();

    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
    expect(storedQueue()).toEqual([{ type: "UPDATE", id: 7, data: { stars: 9 } }]);
  });
});
