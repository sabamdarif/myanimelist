"use client";

// Landing page — port of core/home.html + home.js.
// Jikan schedules / trending / upcoming + hover popup with add-to-list.

import "./styles/home.css";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { type Category } from "@/lib/anime";
import { apiJson } from "@/lib/api";
import {
  type JikanAnime,
  dedupeById,
  formatDayLabel,
  loadLatestEpisodes,
  loadTrending,
  loadUpcoming,
} from "@/lib/jikan";
import { queryKeys } from "@/lib/queryKeys";
import { type CardHandlers, AnimeCard, GridSkeleton, TrendingList } from "@/components/home/cards";
import { HoverPopup } from "@/components/home/HoverPopup";

type Me = { email_verified: boolean };

export default function Home() {
  const [latest, setLatest] = useState<JikanAnime[] | null>(null);
  const [latestPage, setLatestPage] = useState(1); // 1 = Today, 2 = Yesterday…
  const [trending, setTrending] = useState<JikanAnime[] | null>(null);
  const [trendingFilter, setTrendingFilter] = useState("day");
  const [upcoming, setUpcoming] = useState<JikanAnime[] | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(window.matchMedia("(hover: none) or (pointer: coarse)").matches);
  }, []);

  useEffect(() => {
    let stale = false;
    setLatest(null);
    loadLatestEpisodes(latestPage).then((items) => {
      if (!stale) setLatest(dedupeById(items));
    });
    return () => {
      stale = true;
    };
  }, [latestPage]);

  useEffect(() => {
    let stale = false;
    setTrending(null);
    loadTrending(trendingFilter).then((items) => {
      if (!stale) setTrending(dedupeById(items));
    });
    return () => {
      stale = true;
    };
  }, [trendingFilter]);

  useEffect(() => {
    let stale = false;
    loadUpcoming().then((items) => {
      if (!stale) setUpcoming(dedupeById(items));
    });
    return () => {
      stale = true;
    };
  }, []);

  // add-to-list is only offered to authenticated + verified users with categories
  const meQ = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => apiJson<Me>("/api/v1/me/"),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const catQ = useQuery({
    queryKey: queryKeys.categories,
    queryFn: async () => {
      const data = await apiJson<unknown>("/api/v1/categories/");
      return Array.isArray(data)
        ? (data as Category[])
        : ((data as { results?: Category[] }).results ?? []);
    },
    enabled: !!meQ.data?.email_verified,
  });
  const categories = catQ.data ?? [];

  /* ── hover popup orchestration (same 300/150ms delays as home.js) ── */
  const [popup, setPopup] = useState<{ item: JikanAnime; el: HTMLElement } | null>(null);
  const hoverT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inPopup = useRef(false);
  const popupRef = useRef(popup);
  popupRef.current = popup;

  const clearTimers = () => {
    if (hoverT.current) clearTimeout(hoverT.current);
    if (hideT.current) clearTimeout(hideT.current);
  };

  const scheduleHide = () => {
    if (hideT.current) clearTimeout(hideT.current);
    hideT.current = setTimeout(() => {
      if (!inPopup.current) setPopup(null);
    }, 150);
  };

  const handlers: CardHandlers = {
    onEnter: (item, el) => {
      if (isMobile) return;
      clearTimers();
      hoverT.current = setTimeout(() => setPopup({ item, el }), 300);
    },
    onLeave: () => {
      if (isMobile) return;
      if (hoverT.current) clearTimeout(hoverT.current);
      scheduleHide();
    },
    onClick: (item, el, e) => {
      e.preventDefault();
      if (!isMobile) return; // desktop: hover handles the popup
      setPopup((p) => (p && p.item.mal_id === item.mal_id ? null : { item, el }));
    },
  };

  // click outside card/popup closes; scrolling closes
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (
        popupRef.current &&
        !t.closest(".anime_card, .trending_card, #anime_hover_popup")
      ) {
        setPopup(null);
      }
    };
    const onScroll = () => {
      if (popupRef.current) setPopup(null);
    };
    document.addEventListener("click", onDocClick);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("click", onDocClick);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <main className="home_main">
      <div className="home_container">
        <aside className="top_upcoming_section" id="top_upcoming_section">
          <div className="section_header">
            <h3 className="section_title">Top Upcoming</h3>
          </div>
          <div className="trending_list" id="upcoming_list">
            <TrendingList items={upcoming} handlers={handlers} />
          </div>
        </aside>

        <div
          className="main_column"
          style={{ display: "flex", flexDirection: "column", gap: 32 }}
        >
          <section className="latest_episodes_section" id="latest_episodes_section">
            <div className="section_header">
              <h3 className="section_title">Latest Episodes</h3>
            </div>
            <div className="card_grid" id="latest_grid">
              {latest === null ? (
                <GridSkeleton />
              ) : latest.length === 0 ? (
                <div className="empty_msg" style={{ gridColumn: "1 / -1" }}>
                  No entries found.
                </div>
              ) : (
                latest.map((item) => (
                  <AnimeCard key={item.mal_id} item={item} handlers={handlers} />
                ))
              )}
            </div>
            <div className="pagination_controls" id="latest_pagination">
              <button
                className="page_btn"
                id="prev_day_btn"
                aria-label="Previous Day"
                onClick={() => setLatestPage((p) => p + 1)}
              >
                <i className="nf nf-fa-chevron_left"></i>
              </button>
              <span className="page_label" id="current_day_label">
                {formatDayLabel(latestPage)}
              </span>
              <button
                className="page_btn"
                id="next_day_btn"
                aria-label="Next Day"
                disabled={latestPage === 1}
                onClick={() => setLatestPage((p) => Math.max(1, p - 1))}
              >
                <i className="nf nf-fa-chevron_right"></i>
              </button>
            </div>
          </section>
        </div>

        <aside className="top_trending_section" id="top_trending_section">
          <div className="section_header">
            <h3 className="section_title">Top Trending</h3>
            <div className="filter_tabs" id="trending_tabs">
              {(["day", "week", "month"] as const).map((f) => (
                <button
                  key={f}
                  className={`tab_btn${trendingFilter === f ? " active" : ""}`}
                  data-filter={f}
                  onClick={() => setTrendingFilter(f)}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="trending_list" id="trending_list">
            <TrendingList items={trending} handlers={handlers} />
          </div>
        </aside>
      </div>

      <HoverPopup
        item={popup?.item ?? null}
        anchor={popup?.el ?? null}
        isMobile={isMobile}
        categories={categories}
        onMouseEnter={() => {
          inPopup.current = true;
          clearTimers();
        }}
        onMouseLeave={() => {
          inPopup.current = false;
          scheduleHide();
        }}
      />
    </main>
  );
}
