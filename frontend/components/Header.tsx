"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { sanitizeUrl } from "@/lib/anime";
import { apiJson } from "@/lib/api";
import { exportOds } from "@/lib/ods";
import { queryKeys } from "@/lib/queryKeys";
import {
  MarkMatch,
  type SearchResult,
  requestAnimeNavigation,
  useAnimeSearch,
} from "@/lib/search";
import { toast } from "@/lib/toast";
import { ImportModal } from "@/components/ImportModal";
import { ShareModal } from "@/components/ShareModal";
import "../app/styles/import_export.css";

type Me = {
  username: string;
  name: string;
  email: string;
  avatar_url: string;
  email_verified: boolean;
};

function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => apiJson<Me>("/api/v1/me/"),
    staleTime: 5 * 60_000,
  });
}

function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { results, loading, settled } = useAnimeSearch(open ? q : "");

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  const pick = (item: SearchResult) => {
    setQ("");
    setOpen(false);
    requestAnimeNavigation(item.categoryId, item.id);
    if (window.location.pathname !== "/list") router.push("/list");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      (e.target as HTMLInputElement).blur();
      return;
    }
    if (!results.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next =
        e.key === "ArrowDown"
          ? Math.min(activeIdx + 1, results.length - 1)
          : Math.max(activeIdx - 1, 0);
      setActiveIdx(next);
      listRef.current
        ?.querySelectorAll(".search_item")
        [next]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      pick(results[activeIdx]);
    }
  };

  const showDropdown =
    open && q.trim().length > 0 && (results.length > 0 || settled);

  return (
    <div
      className="header_content"
      id="header_search_section"
      ref={boxRef}
      onKeyDown={onKeyDown}
    >
      <i className="nf nf-seti-search"></i>
      <input
        type="search"
        placeholder="search anime from any category..."
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActiveIdx(-1);
        }}
        onFocus={() => {
          if (q.trim()) setOpen(true);
        }}
      />
      <div
        className={`search_loader${loading ? " search_loading" : ""}`}
        id="search_loader"
      ></div>
      <div
        id="search_suggestions"
        className={showDropdown ? "search_open" : ""}
        ref={listRef}
      >
        {showDropdown &&
          (results.length === 0 ? (
            <div className="search_empty">
              No results for &quot;{q.trim()}&quot;
            </div>
          ) : (
            results.map((item, i) => {
              const thumb = sanitizeUrl(item.thumbnail_url);
              return (
                <div
                  key={item.id}
                  className={`search_item${i === activeIdx ? " search_active" : ""}`}
                  onClick={() => pick(item)}
                >
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb}
                      alt=""
                      className="search_item_thumb"
                      loading="lazy"
                    />
                  ) : (
                    <div className="search_item_thumb"></div>
                  )}
                  <div className="search_item_info">
                    <div className="search_item_name">
                      <MarkMatch text={item.name} query={q} />
                    </div>
                    <div className="search_item_category">
                      {item.categoryName}
                    </div>
                  </div>
                </div>
              );
            })
          ))}
      </div>
    </div>
  );
}

const RING_CIRCUMFERENCE = 113; // 2*π*18

function UserMenu() {
  const [open, setOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { data: me } = useMe();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // cancel an in-flight export if the user leaves the page
  useEffect(() => {
    const onUnload = () => abortRef.current?.abort();
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  const setExportProgress = (pct: number) => {
    if (ringRef.current) {
      ringRef.current.style.strokeDashoffset = String(
        RING_CIRCUMFERENCE - (pct / 100) * RING_CIRCUMFERENCE,
      );
    }
  };

  const doExport = async () => {
    if (abortRef.current) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setExporting(true);
    setExportProgress(0);
    try {
      await exportOds(setExportProgress, ac.signal);
      setExporting(false);
      setExportDone(true);
      setTimeout(() => setExportDone(false), 600);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!ac.signal.aborted && msg !== "Cancelled") {
        toast(`Export failed: ${msg}`, "error");
      }
      setExporting(false);
      setExportProgress(0);
    } finally {
      abortRef.current = null;
    }
  };

  return (
    <div className="user_profile_wrapper" id="user_profile_wrapper" ref={wrapperRef}>
      <button
        type="button"
        id="user_profile_btn"
        className={`${exporting ? "exporting" : ""}${exportDone ? " export_done" : ""}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {me?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            id="user_profile_icon"
            src={me.avatar_url}
            alt={me.username}
            referrerPolicy="no-referrer"
          />
        ) : (
          <i className="nf nf-fa-circle_user"></i>
        )}
        <span className="export_ring">
          <svg viewBox="0 0 40 40">
            <circle className="export_ring_track" cx="20" cy="20" r="18"></circle>
            <circle
              ref={ringRef}
              className="export_ring_fill"
              cx="20"
              cy="20"
              r="18"
            ></circle>
          </svg>
        </span>
      </button>
      <div
        className={`user_dropdown_menu${open ? " open" : ""}`}
        id="user_dropdown_menu"
        role="menu"
      >
        {me ? (
          <>
            <div className="user_dropdown_header">
              {me.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="user_dropdown_avatar_img"
                  src={me.avatar_url}
                  alt={me.username}
                  referrerPolicy="no-referrer"
                  style={{
                    borderRadius: "50%",
                    width: 40,
                    height: 40,
                    objectFit: "cover",
                  }}
                />
              ) : (
                <i className="nf nf-fa-circle_user user_dropdown_avatar_icon"></i>
              )}
              <div className="user_dropdown_info">
                <span className="user_dropdown_name">{me.name}</span>
                <span className="user_dropdown_sub">{me.email}</span>
              </div>
            </div>
            <div className="user_dropdown_divider"></div>
            <div className="user_dropdown_body">
              <button
                type="button"
                className="user_dropdown_item"
                id="share_btn"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  setShareOpen(true);
                }}
              >
                <i className="nf nf-md-share_all"></i>
                <span>Share</span>
              </button>
              <button
                type="button"
                className="user_dropdown_item"
                id="import_btn"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  setImportOpen(true);
                }}
              >
                <i className="nf nf-fae-file_import"></i>
                <span>Import</span>
              </button>
              <button
                type="button"
                className="user_dropdown_item"
                id="export_btn"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  doExport();
                }}
              >
                <i className="nf nf-fae-file_export"></i>
                <span>Export</span>
              </button>
              <div className="user_dropdown_divider"></div>
              <a
                href="/accounts/settings/"
                className="user_dropdown_item"
                role="menuitem"
                style={{ textDecoration: "none" }}
              >
                <i className="nf nf-fa-cog"></i>
                <span>Settings</span>
              </a>
            </div>
          </>
        ) : (
          <div className="user_dropdown_body">
            <a
              href="/accounts/login/"
              className="user_dropdown_item"
              role="menuitem"
              style={{ textDecoration: "none" }}
            >
              <i className="nf nf-fa-circle_user"></i>
              <span>Log in</span>
            </a>
          </div>
        )}
      </div>
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

// Landing header actions — port of home.html's signup_btn
function LandingActions() {
  const { data: me, isPending } = useMe();
  return (
    <div className="header_content" id="header_action_buttons">
      {!isPending &&
        (me ? (
          <Link href="/list" className="signup_btn">
            Open Your List
          </Link>
        ) : (
          <a href="/accounts/login/" className="signup_btn">
            Get Started
          </a>
        ))}
    </div>
  );
}

export function Header() {
  const pathname = usePathname();
  // the public share page brings its own header
  if (pathname?.startsWith("/share/")) return null;
  const isLanding = pathname === "/";

  return (
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
        {isLanding ? (
          <LandingActions />
        ) : (
          <>
            <SearchBox />
            <div className="header_content" id="header_action_buttons">
              <button
                type="button"
                className="header_action_buttons btn_category"
                onClick={() =>
                  window.dispatchEvent(new CustomEvent("anilist:add-category"))
                }
              >
                <i className="nf nf-fa-folder_plus"></i>Category
              </button>
              <button
                type="button"
                className="header_action_buttons btn_add_anime"
                onClick={() =>
                  window.dispatchEvent(new CustomEvent("anilist:add-anime"))
                }
              >
                <i className="nf nf-oct-plus"></i>Add Anime
              </button>
              <button
                type="button"
                className="m_header_search_btn"
                id="m_search_btn"
                aria-label="Search"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("anilist:open-mobile-search"),
                  )
                }
              >
                <i className="nf nf-seti-search"></i>
              </button>
              <UserMenu />
            </div>
          </>
        )}
      </header>
    </div>
  );
}
