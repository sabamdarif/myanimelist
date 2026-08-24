"use client";

import { useEffect, useRef, useState } from "react";
import { sanitizeUrl } from "@/lib/anime";
import {
  MarkMatch,
  type SearchResult,
  requestAnimeNavigation,
  useAnimeSearch,
} from "@/lib/search";

// Bottom sheet. Filters embed here on mobile (children) and hide while a
// query is active, matching the old reparenting behavior.
export function MobileSearchPanel({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { results, loading, settled } = useAnimeSearch(open ? q : "");

  useEffect(() => {
    if (!open) {
      setQ("");
      return;
    }
    document.body.style.overflow = "hidden";
    // focus after the slide-in transition (same 350ms as the old app)
    const t = setTimeout(() => inputRef.current?.focus(), 350);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = "";
    };
  }, [open]);

  const pick = (item: SearchResult) => {
    onClose();
    requestAnimeNavigation(item.categoryId, item.id);
  };

  const searching = q.trim().length > 0;
  const vis = open ? " m_search_visible" : "";

  return (
    <>
      <div className={`m_search_overlay${vis}`} onClick={onClose}></div>
      <div className={`m_search_panel${vis}`} id="m_search_panel">
        <div className="m_search_handle"></div>
        <div className="m_search_bar">
          <input
            type="search"
            placeholder="search anime from any category..."
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="button" className="m_search_cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
        <div
          className={`m_search_loader${loading ? " search_loading" : ""}`}
        ></div>
        {children && !searching && (
          <div className="filter_controls_dropdown mobile_embedded open">
            {children}
          </div>
        )}
        {(searching || !children) && (
          <div className="m_search_results">
            {!searching ? (
              <div className="m_search_hint">
                Type to search across all categories
              </div>
            ) : results.length > 0 ? (
              results.map((item) => {
                const thumb = sanitizeUrl(item.thumbnail_url);
                return (
                  <div
                    key={item.id}
                    className="m_search_item"
                    onClick={() => pick(item)}
                  >
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt=""
                        className="m_search_item_thumb"
                        loading="lazy"
                      />
                    ) : (
                      <div className="m_search_item_thumb"></div>
                    )}
                    <div className="m_search_item_info">
                      <div className="m_search_item_name">
                        <MarkMatch text={item.name} query={q} />
                      </div>
                      <div className="m_search_item_category">
                        {item.categoryName}
                      </div>
                    </div>
                    <span className="m_search_item_arrow">
                      <i className="nf nf-cod-arrow_right"></i>
                    </span>
                  </div>
                );
              })
            ) : settled ? (
              <div className="m_search_empty">
                No results for &quot;{q.trim()}&quot;
              </div>
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}
