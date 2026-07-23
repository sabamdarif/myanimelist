"use client";

// Public read-only share page — port of shared_list.html + shared_list.js.
// Brings its own header (the global Header hides itself on /share/*).

import "../../styles/category_tabs.css";
import "../../styles/anime_table.css";
import "../../styles/search.css";
import "../../styles/shared_list.css";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { type Anime, normalizeAnime } from "@/lib/anime";
import { apiJson } from "@/lib/api";
import {
  EMPTY_FILTERS,
  type Filters,
  applyFilters,
  loadFilters,
  saveFilters,
  toggleFilter,
} from "@/lib/filters";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "@/lib/toast";
import { useIsMobile } from "@/lib/useIsMobile";
import { AnimeTable } from "@/components/list/AnimeTable";
import { FilterToolbar } from "@/components/list/FilterToolbar";
import { MobileCards } from "@/components/list/MobileCards";
import { useCommentPopups } from "@/components/list/seasons";

type SharedCategory = { id: number; name: string; animes: Anime[] };
type SharedData = { owner: string; categories: SharedCategory[] };

async function fetchShareData(token: string): Promise<SharedData> {
  const res = await fetch(`/api/v1/share/data/${token}/`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(String(res.status));
  const raw = (await res.json()) as {
    id: number;
    name: string;
    animes: Record<string, unknown>[];
  }[];
  return {
    owner: res.headers.get("X-Share-Owner") ?? "",
    categories: raw.map((c) => ({
      id: c.id,
      name: c.name,
      animes: (c.animes ?? []).map(normalizeAnime),
    })),
  };
}

function OwnerDropdown({
  owner,
  token,
  isAuthenticated,
}: {
  owner: string;
  token: string;
  isAuthenticated: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied">(
    "idle",
  );
  const wrapperRef = useRef<HTMLDivElement>(null);
  const copyStateRef = useRef(copyState);
  copyStateRef.current = copyState;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  const handleCopy = async () => {
    if (copyStateRef.current === "copying") return;
    setCopyState("copying");
    try {
      const data = await apiJson<{ detail?: string }>(
        `/api/v1/share/copy/${token}/`,
        { method: "POST", headers: { "Content-Type": "application/json" } },
      );
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 3000);
      toast(data.detail || "List copied successfully!");
    } catch (e) {
      setCopyState("idle");
      toast(e instanceof Error ? e.message : "Failed to copy list.", "error");
    }
  };

  // finish a copy the user requested before logging in
  useEffect(() => {
    if (!isAuthenticated) return;
    try {
      if (sessionStorage.getItem("pending_share_copy") === token) {
        sessionStorage.removeItem("pending_share_copy");
        setTimeout(handleCopy, 500);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, token]);

  const loginUrl = `/accounts/login/?next=/share/${token}/`;

  return (
    <div
      className="shared_owner_badge_wrapper"
      id="shared_dropdown_wrapper"
      ref={wrapperRef}
    >
      <div
        className="shared_owner_badge"
        id="shared_dropdown_btn"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <i className="nf nf-fa-user"></i>
        <span>{owner ? `${owner}'s List` : "Shared List"}</span>
        <i
          className="nf nf-fa-caret_down"
          style={{ fontSize: "0.7rem", marginLeft: 4 }}
        ></i>
      </div>
      <div
        className={`shared_dropdown_menu${open ? " show" : ""}`}
        id="shared_dropdown_menu"
      >
        {isAuthenticated ? (
          <>
            <button
              className={`shared_dropdown_item${copyState === "copying" ? " loading" : ""}`}
              id="copy_list_btn"
              onClick={handleCopy}
            >
              {copyState === "copying" ? (
                <>
                  <i className="nf nf-fa-spinner"></i> Copying...
                </>
              ) : copyState === "copied" ? (
                <>
                  <i className="nf nf-fa-check"></i> Copied!
                </>
              ) : (
                <>
                  <i className="nf nf-fa-copy"></i> Copy this list
                </>
              )}
            </button>
            <Link href="/list" className="shared_dropdown_item">
              <i className="nf nf-fa-home"></i> Return to your list
            </Link>
          </>
        ) : (
          <>
            <button
              className="shared_dropdown_item"
              id="copy_list_login_btn"
              onClick={() => {
                try {
                  sessionStorage.setItem("pending_share_copy", token);
                } catch {}
                window.location.href = loginUrl;
              }}
            >
              <i className="nf nf-fa-copy"></i> Copy this list
            </button>
            <a href={loginUrl} className="shared_dropdown_item">
              <i className="nf nf-fa-sign_in"></i> Login
            </a>
          </>
        )}
      </div>
    </div>
  );
}

export default function SharedListPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const isMobile = useIsMobile();
  useCommentPopups();

  const [activeIdx, setActiveIdx] = useState(0);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const activeIdxRef = useRef(activeIdx);
  activeIdxRef.current = activeIdx;

  const shareQ = useQuery({
    queryKey: queryKeys.shareData(token),
    queryFn: () => fetchShareData(token),
    retry: (count, error) =>
      error instanceof Error && error.message === "404" ? false : count < 2,
  });

  const meQ = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => apiJson<{ username: string }>("/api/v1/me/"),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const isAuthenticated = !!meQ.data;

  useEffect(() => {
    setFilters(loadFilters());
  }, []);

  const owner = shareQ.data?.owner ?? "";
  useEffect(() => {
    if (owner) document.title = `${owner}'s List - AniListShare`;
  }, [owner]);

  // scroll persistence per tab (same keys as shared_list.js)
  useEffect(() => {
    const onHide = () => {
      try {
        sessionStorage.setItem(
          `shared_${token}_tab_${activeIdxRef.current}`,
          String(window.scrollY),
        );
      } catch {}
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [token]);

  useEffect(() => {
    if (!shareQ.data) return;
    try {
      const key = `shared_${token}_tab_${activeIdx}`;
      const saved = sessionStorage.getItem(key);
      if (saved) {
        requestAnimationFrame(() => {
          window.scrollTo(0, parseInt(saved, 10));
          sessionStorage.removeItem(key);
        });
      }
    } catch {}
  }, [shareQ.data, activeIdx, token]);

  const categories = shareQ.data?.categories ?? [];
  const activeCat = categories[activeIdx] ?? null;

  let listState: Anime[] | "loading" | "error";
  if (shareQ.isPending) {
    listState = "loading";
  } else if (shareQ.isError) {
    listState = "error";
  } else {
    let list = activeCat?.animes ?? [];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((a) => (a.name || "").toLowerCase().includes(q));
    }
    listState = applyFilters(list, filters);
  }

  const changeFilters = (next: Filters) => {
    setFilters(next);
    saveFilters(next);
  };

  const notFound =
    shareQ.isError &&
    shareQ.error instanceof Error &&
    shareQ.error.message === "404";

  return (
    <>
      <div className="sticky_header">
        <header>
          <Link
            href="/"
            className="header_content"
            id="header_title_section"
            style={{ textDecoration: "none", color: "inherit", cursor: "pointer" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.webp" alt="AniListShare-logo" id="header_web_logo" />
            <h2 id="header_web_title">AniListShare</h2>
          </Link>
          <div className="header_content" id="header_search_section">
            <i className="nf nf-seti-search"></i>
            <input
              type="search"
              placeholder="search anime..."
              id="shared_search_input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="header_content" id="header_action_buttons">
            <OwnerDropdown
              owner={owner}
              token={token}
              isAuthenticated={isAuthenticated}
            />
          </div>
        </header>
        <nav className="category_tabs" id="category_tabs">
          {shareQ.isPending ? (
            <div
              className="m_search_loader"
              id="category_tabs_loader"
              style={{
                width: 24,
                height: 24,
                display: "inline-block",
                marginLeft: 20,
              }}
            ></div>
          ) : shareQ.isError ? (
            <span style={{ color: "red", marginLeft: 12 }}>
              {notFound
                ? "This shared link does not exist or has been disabled."
                : "Failed to load list. Please refresh."}
            </span>
          ) : (
            categories.map((cat, idx) => (
              <div
                key={cat.id}
                className={`category_tab_wrapper${idx === activeIdx ? " active" : ""}`}
              >
                <button
                  className={`category_tab${idx === activeIdx ? " active" : ""}`}
                  data-cat-idx={idx}
                  onClick={() => setActiveIdx(idx)}
                >
                  {cat.name}
                </button>
              </div>
            ))
          )}
        </nav>
      </div>
      <main className="anime_table_wrapper">
        {isMobile ? (
          <MobileCards
            animes={listState}
            categoryId={null}
            emptyMessage="No anime in this category."
            onThumbLoaded={() => {}}
            readOnly
          />
        ) : (
          <AnimeTable
            animes={listState}
            categoryId={null}
            emptyMessage="No anime in this category."
            onThumbLoaded={() => {}}
            readOnly
            filterSlot={
              <FilterToolbar
                filters={filters}
                onToggle={(type, val) =>
                  changeFilters(toggleFilter(filters, type, val))
                }
                onClear={() => changeFilters(EMPTY_FILTERS)}
              />
            }
          />
        )}
      </main>
    </>
  );
}
