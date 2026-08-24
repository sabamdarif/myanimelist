"use client";

// Port of core/static/core/js/sync_queue.js — debounced bulk_sync queue with
// CREATE/UPDATE/DELETE squashing, localStorage persistence (same key so
// in-flight edits survive reload), and a keepalive flush on pagehide.
// Cache reconciliation (temp→real id, error rollback) is delegated to handlers
// registered by the React layer.

import { getAccessToken } from "./api";

export type SyncAction = {
  type: "CREATE" | "UPDATE" | "DELETE";
  temp_id?: string;
  id?: number;
  data?: Record<string, unknown>;
};

type Handlers = {
  resolveIds: (map: Record<string, number>) => void;
  onError: () => void;
};

const STORAGE_KEY = "anime_sync_queue";
const SYNC_DELAY = 1500;
const BULK_URL = "/api/v1/animes/bulk_sync/";

let queue: SyncAction[] = [];
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let handlers: Handlers | null = null;

export function generateTempId(): string {
  return "temp_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
}

function saveToLocal() {
  try {
    if (queue.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {}
}

function actionTarget(a: SyncAction): string | number | undefined {
  return a.id ?? a.temp_id;
}

// Import the fetch wrapper lazily to avoid a module cycle (api.ts is heavy).
async function performSync(payload: SyncAction[]) {
  if (payload.length === 0) return;
  const { apiFetch } = await import("./api");
  try {
    const resp = await apiFetch(BULK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actions: payload }),
    });
    if (!resp.ok) throw new Error("Bulk API failed");
    const data = await resp.json();

    // drop only the actions we actually sent — a later push stays queued
    queue = queue.filter((q) => !payload.includes(q));
    saveToLocal();

    const map = (data.created_ids || {}) as Record<string, number>;
    if (Object.keys(map).length && handlers) handlers.resolveIds(map);
  } catch {
    // keep payload in queue; retry on next flush. Revert UI to server truth.
    if (!syncTimer) syncTimer = setTimeout(flushQueue, SYNC_DELAY);
    handlers?.onError();
  }
}

function flushQueue() {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = null;
  if (queue.length === 0) return;
  performSync(queue.slice());
}

export function pushAction(action: SyncAction) {
  if (action.type === "UPDATE") {
    const target = actionTarget(action);
    let found = false;
    for (const q of queue) {
      if (
        actionTarget(q) === target &&
        (q.type === "CREATE" || q.type === "UPDATE")
      ) {
        q.data = { ...q.data, ...action.data };
        found = true;
        break;
      }
    }
    if (!found) queue.push(action);
  } else if (action.type === "DELETE") {
    const target = actionTarget(action);
    let removed = false;
    for (let i = queue.length - 1; i >= 0; i--) {
      if (actionTarget(queue[i]) === target) {
        if (queue[i].type === "CREATE") {
          queue.splice(i, 1);
          removed = true;
        } else if (queue[i].type === "UPDATE") {
          queue.splice(i, 1);
        }
      }
    }
    if (!removed && action.id) queue.push(action);
  } else {
    queue.push(action);
  }

  saveToLocal();
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(flushQueue, SYNC_DELAY);
}

export function flushNow() {
  flushQueue();
}

// Registered once by the app; also loads any persisted queue and flushes it,
// and installs the keepalive pagehide handler. Returns an unregister fn.
export function registerSyncHandlers(h: Handlers): () => void {
  handlers = h;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        queue = parsed;
        flushQueue();
      }
    }
  } catch {}

  const onHide = () => {
    if (queue.length === 0) return;
    const payload = JSON.stringify({ actions: queue });
    const token = getAccessToken();
    // hand the payload to the browser's keepalive fetch and clear local state:
    // a graceful close won't lose it, a crash (no pagehide) keeps localStorage.
    localStorage.removeItem(STORAGE_KEY);
    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }
    queue = [];
    fetch(BULK_URL, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        Authorization: token ? "Bearer " + token : "",
      },
      body: payload,
    }).catch(() => {});
  };

  window.addEventListener("pagehide", onHide);
  return () => {
    window.removeEventListener("pagehide", onHide);
    if (handlers === h) handlers = null;
  };
}
