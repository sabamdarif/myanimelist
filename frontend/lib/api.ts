// Port of core/static/core/js/jwt_auth.js — in-memory JWTs, session→JWT mint,
// proactive refresh, single-flight, 401 retry-once.

let accessToken: string | null = null;
let refreshToken: string | null = null;
let mintPromise: Promise<boolean> | null = null;
let refreshPromise: Promise<boolean> | null = null;

function isTokenExpired(token: string | null): boolean {
  if (!token) return true;
  try {
    let base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4 !== 0) base64 += "=";
    const payload = JSON.parse(decodeURIComponent(escape(atob(base64))));
    // 10 second buffer
    return payload.exp * 1000 <= Date.now() + 10000;
  } catch {
    return true;
  }
}

function getCookie(name: string): string | null {
  const match = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(name + "="));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

async function ensureToken(): Promise<boolean> {
  if (accessToken) return true;
  if (!mintPromise) {
    mintPromise = fetch("/api/v1/token/session/", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "X-CSRFToken": getCookie("csrftoken") ?? "",
      },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          accessToken = data.access;
          refreshToken = data.refresh;
        } else {
          mintPromise = null; // allow re-mint after login
        }
        return !!data;
      })
      .catch(() => {
        mintPromise = null;
        return false;
      });
  }
  return mintPromise;
}

async function performRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = fetch("/api/v1/token/refresh/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh: refreshToken }),
  })
    .then(async (res) => {
      if (res.ok) {
        const data = await res.json();
        accessToken = data.access;
        if (data.refresh) refreshToken = data.refresh;
        return true;
      }
      accessToken = null;
      refreshToken = null;
      if (window.location.pathname !== "/accounts/login/") {
        window.location.href = "/accounts/login/";
      }
      return false;
    })
    .catch(() => false)
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

export function getAccessToken(): string | null {
  return accessToken;
}

// DRF error payload → human-readable messages
export function parseDRFErrors(data: unknown): string[] {
  const msgs: string[] = [];
  if (typeof data === "string") {
    msgs.push(data);
  } else if (Array.isArray(data)) {
    data.forEach((item) => msgs.push(String(item)));
  } else if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (obj.detail) {
      msgs.push(String(obj.detail));
    } else {
      for (const [field, errors] of Object.entries(obj)) {
        const errList = Array.isArray(errors) ? errors : [errors];
        errList.forEach((e) => {
          if (typeof e === "object" && e !== null) {
            msgs.push(...parseDRFErrors(e));
          } else {
            const label = field === "non_field_errors" ? "" : `${field}: `;
            msgs.push(`${label}${e}`);
          }
        });
      }
    }
  }
  return msgs;
}

export class ApiError extends Error {
  status: number;
  messages: string[];

  constructor(status: number, messages: string[]) {
    super(messages.join("\n") || `HTTP ${status}`);
    this.status = status;
    this.messages = messages;
  }
}

export async function apiFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(options.headers);

  if (url.startsWith("/api/")) {
    await ensureToken();
    if (accessToken && refreshToken && isTokenExpired(accessToken)) {
      await performRefresh();
    }
    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  }

  let response = await fetch(url, { ...options, headers });

  if (response.status === 401 && refreshToken && url.startsWith("/api/")) {
    if (await performRefresh()) {
      headers.set("Authorization", `Bearer ${accessToken}`);
      response = await fetch(url, { ...options, headers });
    }
  }

  return response;
}

// apiFetch + throw ApiError on non-2xx + parsed JSON body
export async function apiJson<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await apiFetch(url, options);
  if (!response.ok) {
    let messages: string[] = [];
    try {
      messages = parseDRFErrors(await response.json());
    } catch {
      // not JSON
    }
    throw new ApiError(response.status, messages);
  }
  return response.json();
}
