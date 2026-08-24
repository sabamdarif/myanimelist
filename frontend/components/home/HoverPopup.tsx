"use client";

// Port of home.js hover-popup + add-to-list. Same markup/classes/delays.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Category } from "@/lib/anime";
import { apiJson } from "@/lib/api";
import {
  type JikanAnime,
  calculateAiredEpisodes,
  jikanImage,
  jikanTitle,
} from "@/lib/jikan";

type AddState =
  | { mode: "idle" }
  | { mode: "picker"; addingCatId?: number; failedCatId?: number }
  | { mode: "feedback" }
  | { mode: "added" };

export function HoverPopup({
  item,
  anchor,
  isMobile,
  categories,
  onMouseEnter,
  onMouseLeave,
}: {
  item: JikanAnime | null;
  anchor: HTMLElement | null;
  isMobile: boolean;
  categories: Category[];
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const [addState, setAddState] = useState<AddState>({ mode: "idle" });
  const canAddToList = categories.length > 0;

  // position + animate in whenever a new item is shown
  useLayoutEffect(() => {
    if (!item || !anchor || !popupRef.current) return;
    setAddState({ mode: "idle" });
    const popup = popupRef.current;
    const rect = anchor.getBoundingClientRect();
    const popupWidth = popup.offsetWidth;
    const popupHeight = popup.offsetHeight;

    // default: to the right of the card, vertically centered
    let left = rect.right + 16;
    let top = rect.top + rect.height / 2 - popupHeight / 2;
    if (left + popupWidth > window.innerWidth) {
      left = rect.left - popupWidth - 16;
    }
    top = Math.max(16, top);
    if (top + popupHeight > window.innerHeight - 16) {
      top = window.innerHeight - popupHeight - 16;
    }
    if (isMobile) {
      left = (window.innerWidth - popupWidth) / 2;
      top = (window.innerHeight - popupHeight) / 2;
    }
    setPos({ left, top });
    const id = requestAnimationFrame(() => setActive(true));
    return () => cancelAnimationFrame(id);
  }, [item, anchor, isMobile]);

  useEffect(() => {
    if (!item) setActive(false);
  }, [item]);

  if (!item) {
    return (
      <div
        id="anime_hover_popup"
        className="anime_hover_popup"
        style={{ display: "none" }}
      ></div>
    );
  }

  const score = item.score ? item.score.toFixed(1) : "";
  const eps = calculateAiredEpisodes(item);
  const year = item.year || item.aired?.prop?.from?.year || "?";
  const synopsis = item.synopsis
    ? item.synopsis.split("[Written by")[0].trim()
    : "No synopsis available.";
  const studio = item.studios?.[0]?.name || "";

  const openPicker = () => {
    setAddState({ mode: "picker" });
    // if the expanded picker overflows the screen bottom, push the popup up
    requestAnimationFrame(() => {
      const popup = popupRef.current;
      if (!popup) return;
      const rect = popup.getBoundingClientRect();
      if (rect.bottom > window.innerHeight - 16) {
        setPos((p) => ({
          ...p,
          top: Math.max(16, window.innerHeight - rect.height - 16),
        }));
      }
    });
  };

  const addToCategory = async (categoryId: number) => {
    setAddState({ mode: "picker", addingCatId: categoryId });
    try {
      await apiJson("/api/v1/animes/bulk_sync/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actions: [
            {
              type: "CREATE",
              temp_id: `home_add_${Date.now()}`,
              data: {
                category_id: categoryId,
                name: jikanTitle(item),
                thumbnail_url: jikanImage(item),
                language: "",
                stars: item.score || null,
                order: 9999, // placed at end by backend
                seasons: [
                  {
                    number: 1,
                    total_episodes: item.episodes || 0,
                    watched_episodes: 0,
                  },
                ],
              },
            },
          ],
        }),
      });
      setAddState({ mode: "feedback" });
      setTimeout(() => {
        setAddState((s) => (s.mode === "feedback" ? { mode: "added" } : s));
      }, 1500);
    } catch {
      setAddState({ mode: "picker", failedCatId: categoryId });
    }
  };

  return (
    <div
      id="anime_hover_popup"
      ref={popupRef}
      className={`anime_hover_popup${active ? " active" : ""}`}
      style={{ display: "block", left: pos.left, top: pos.top }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="popup_content">
        <div className="popup_header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            id="popup_image"
            className="popup_image"
            src={jikanImage(item)}
            alt="Thumbnail"
          />
          <div className="popup_header_info">
            <h4 id="popup_title" className="popup_title">
              {jikanTitle(item)}
            </h4>
            <div className="popup_meta" id="popup_meta">
              {score && (
                <span className="stat_item">
                  <i className="nf nf-fa-star" style={{ color: "var(--star)" }}></i>{" "}
                  {score}
                </span>
              )}
              {score && <span>·</span>}
              <span>{item.type}</span>
              <span>·</span>
              <span>{year}</span>
              <span>·</span>
              <span className="stat_item">
                <i className="nf nf-md-subtitles"></i> {eps}
              </span>
            </div>
            <div className="popup_genres" id="popup_genres">
              {(item.genres || []).slice(0, 3).map((g) => (
                <span key={g.name} className="popup_genre_tag">
                  {g.name}
                </span>
              ))}
            </div>
          </div>
        </div>
        <p id="popup_synopsis" className="popup_synopsis">
          {synopsis}
        </p>
        <div className="popup_footer">
          <span id="popup_studio">{studio ? `Studio: ${studio}` : ""}</span>
          {canAddToList && (addState.mode === "idle" || addState.mode === "added") && (
            <button
              id="popup_add_btn"
              className="popup_add_btn"
              disabled={addState.mode === "added"}
              onClick={(e) => {
                e.stopPropagation();
                openPicker();
              }}
            >
              {addState.mode === "added" ? (
                <>
                  <i className="nf nf-fa-check"></i> Added!
                </>
              ) : (
                <>
                  <i className="nf nf-fa-plus"></i> Add to List
                </>
              )}
            </button>
          )}
        </div>
        {addState.mode === "picker" && (
          <div
            id="popup_category_picker"
            className="popup_category_picker"
            style={{ display: "block" }}
          >
            <div className="popup_picker_header">
              <span>Choose a category</span>
              <button
                id="popup_cancel_add_btn"
                className="popup_cancel_btn"
                aria-label="Cancel"
                onClick={(e) => {
                  e.stopPropagation();
                  setAddState({ mode: "idle" });
                }}
              >
                <i className="nf nf-fa-times"></i>
              </button>
            </div>
            <div id="popup_category_list" className="popup_category_list">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  className="popup_category_item"
                  disabled={addState.addingCatId != null}
                  onClick={(e) => {
                    e.stopPropagation();
                    addToCategory(cat.id);
                  }}
                >
                  {addState.addingCatId === cat.id ? (
                    <>
                      <i className="nf nf-fa-spinner"></i> Adding...
                    </>
                  ) : addState.failedCatId === cat.id ? (
                    <>
                      <i className="nf nf-fa-folder"></i> Failed — try again
                    </>
                  ) : (
                    <>
                      <i className="nf nf-fa-folder"></i> {cat.name}
                    </>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
        {addState.mode === "feedback" && (
          <div
            id="popup_add_feedback"
            className="popup_add_feedback"
            style={{ display: "flex" }}
          >
            <i className="nf nf-fa-check"></i> Added!
          </div>
        )}
      </div>
    </div>
  );
}
