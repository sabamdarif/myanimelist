"use client";

import { useEffect } from "react";
import type { Season } from "@/lib/anime";
import { seasonLabel, starsNum } from "@/lib/anime";
import { parseLanguages } from "@/lib/anime";
import type { Anime } from "@/lib/anime";

function hasComment(s: Season): boolean {
  return s.comment.trim().length > 0;
}

function commentAttrs(s: Season, long: boolean) {
  if (!hasComment(s)) return {};
  return { "data-comment": s.comment, "data-season": seasonLabel(s, long) };
}

// Desktop season pills / progress boxes
export function SeasonPills({ seasons }: { seasons: Season[] }) {
  if (!seasons.length) {
    return (
      <span className="season_pill" style={{ opacity: 0.5 }}>
        {"—"}
      </span>
    );
  }
  return (
    <>
      {seasons.map((s, i) => {
        const has = hasComment(s);
        const icon = has ? (
          <i className="nf nf-fa-comment season_comment_icon"></i>
        ) : null;
        const cls =
          (has ? " season_has_comment" : "") + (s.isOva ? " season_ova" : "");
        if (s.completed) {
          return (
            <span
              key={i}
              className={`season_pill season_has_tooltip${cls}`}
              {...commentAttrs(s, false)}
            >
              {seasonLabel(s)}
              <span className="s_check">{"✓"}</span>
              {icon}
            </span>
          );
        }
        const pct = s.total > 0 ? Math.round((s.watched / s.total) * 100) : 0;
        return (
          <span
            key={i}
            className={`season_progress_box season_has_tooltip${cls}`}
            {...commentAttrs(s, false)}
          >
            <span className="season_progress_top">
              <span className="season_progress_label">{seasonLabel(s)}</span>
              <span className="season_progress_frac">
                {s.watched}/{s.total}
              </span>
            </span>
            <span className="season_progress_track">
              <span
                className="season_progress_fill"
                style={{ width: `${pct}%` }}
              ></span>
            </span>
            {icon}
          </span>
        );
      })}
    </>
  );
}

// Mobile season rows with progress bars
export function MobileSeasons({ seasons }: { seasons: Season[] }) {
  return (
    <>
      {seasons.map((s, i) => {
        const pct = s.completed
          ? 100
          : s.total > 0
            ? Math.round((s.watched / s.total) * 100)
            : 0;
        const has = hasComment(s);
        return (
          <div
            key={i}
            className="m_season_item m_season_has_popup"
            {...commentAttrs(s, true)}
          >
            <div className="m_season_label">
              {seasonLabel(s, true)}
              {!s.completed && (
                <>
                  {" "}
                  <span className="m_season_progress_text">
                    {s.watched}/{s.total}
                  </span>
                </>
              )}
              {s.completed && (
                <span className="m_season_check">{"✓"}</span>
              )}
              {has && (
                <i className="nf nf-fa-comment m_season_comment_icon"></i>
              )}
            </div>
            <div className="m_season_bar_track">
              <div
                className={`m_season_bar_fill${s.completed ? " m_bar_done" : ""}`}
                style={{ width: `${pct}%` }}
              ></div>
            </div>
          </div>
        );
      })}
    </>
  );
}

export function Stars({ value }: { value: Anime["stars"] }) {
  const rating = starsNum(value);
  return (
    <span className="star_display">
      <span className={`star single ${rating > 0 ? "filled" : "empty"}`}>
        {rating > 0 ? "★" : "☆"}
      </span>
      <span className="star_num">{rating.toFixed(1)}</span>
    </span>
  );
}

export function LangBadges({ language }: { language: string }) {
  return (
    <>
      {parseLanguages(language).map((l) => (
        <span key={l} className="badge badge_lang">
          {l}
        </span>
      ))}
    </>
  );
}

// ── Comment tooltip (desktop) + popup (mobile) ──
// Straight port of the delegated-listener implementation in anime_renderer.js.
// Pills only carry data-comment/data-season attrs; this hook owns the DOM.
export function useCommentPopups() {
  useEffect(() => {
    const isMobile = () => window.innerWidth <= 768;

    let activeTooltip: HTMLElement | null = null;
    let hoverTimer: ReturnType<typeof setTimeout> | undefined;

    function removeTooltip() {
      activeTooltip?.remove();
      activeTooltip = null;
    }

    function showTooltip(anchor: Element) {
      const comment = anchor.getAttribute("data-comment");
      if (!comment) return;
      removeTooltip();

      const tip = document.createElement("div");
      tip.className = "season_comment_tooltip";

      const stem = document.createElement("div");
      stem.className = "season_comment_stem";
      tip.appendChild(stem);

      const header = document.createElement("div");
      header.className = "season_comment_header";
      header.textContent =
        (anchor.getAttribute("data-season") || "Season") + " Comment";
      tip.appendChild(header);

      const body = document.createElement("div");
      body.className = "season_comment_body";
      body.textContent = comment;
      tip.appendChild(body);

      const footer = document.createElement("div");
      footer.className = "season_comment_footer";
      const closeBtn = document.createElement("button");
      closeBtn.className = "season_comment_close_btn";
      closeBtn.type = "button";
      closeBtn.textContent = "Close";
      footer.appendChild(closeBtn);
      tip.appendChild(footer);

      document.body.appendChild(tip);
      activeTooltip = tip;

      const rect = anchor.getBoundingClientRect();
      const stemH = 10;
      tip.style.visibility = "hidden";
      tip.style.display = "block";
      const tipRect = tip.getBoundingClientRect();
      tip.style.visibility = "";

      let left = rect.left + rect.width / 2 - tipRect.width / 2;
      if (left < 8) left = 8;
      if (left + tipRect.width > window.innerWidth - 8)
        left = window.innerWidth - tipRect.width - 8;

      tip.style.top = rect.bottom + stemH + window.scrollY + "px";
      tip.style.left = left + window.scrollX + "px";

      const stemLeft = rect.left + rect.width / 2 - left - 8;
      stem.style.left =
        Math.max(12, Math.min(stemLeft, tipRect.width - 28)) + "px";

      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeTooltip();
      });
    }

    const onMouseOver = (e: MouseEvent) => {
      if (isMobile()) return;
      const target = e.target as Element;
      if (activeTooltip && activeTooltip.contains(target)) {
        clearTimeout(hoverTimer);
        return;
      }
      const el = target.closest(".season_has_tooltip[data-comment]");
      if (el) {
        clearTimeout(hoverTimer);
        showTooltip(el);
      }
    };

    const onMouseOut = (e: MouseEvent) => {
      if (isMobile()) return;
      const target = e.target as Element;
      const fromAnchor = target.closest(".season_has_tooltip[data-comment]");
      const fromTooltip =
        activeTooltip &&
        (activeTooltip === target || activeTooltip.contains(target));
      if (fromAnchor || fromTooltip) {
        const related = e.relatedTarget as Element | null;
        if (
          activeTooltip &&
          related &&
          (activeTooltip === related || activeTooltip.contains(related))
        )
          return;
        if (related?.closest?.(".season_has_tooltip[data-comment]")) return;
        hoverTimer = setTimeout(removeTooltip, 150);
      }
    };

    const onDesktopClick = (e: MouseEvent) => {
      if (isMobile()) return;
      const target = e.target as Element;
      if (target.closest(".season_comment_close_btn")) return;
      const el = target.closest(".season_has_tooltip[data-comment]");
      if (el) {
        if (activeTooltip) removeTooltip();
        else showTooltip(el);
      } else if (activeTooltip && !activeTooltip.contains(target)) {
        removeTooltip();
      }
    };

    let activeMobilePopup: HTMLElement | null = null;

    function removeMobilePopup() {
      activeMobilePopup?.remove();
      activeMobilePopup = null;
    }

    const onMobileClick = (e: MouseEvent) => {
      if (!isMobile()) return;
      const target = e.target as Element;

      if (
        activeMobilePopup &&
        !activeMobilePopup.contains(target) &&
        !target.closest(".m_season_has_popup[data-comment]")
      ) {
        removeMobilePopup();
        return;
      }
      if (target.closest(".m_season_popup_close")) {
        removeMobilePopup();
        return;
      }

      const el = target.closest(".m_season_has_popup[data-comment]");
      if (!el) return;
      removeMobilePopup();

      const overlay = document.createElement("div");
      overlay.className = "m_season_popup_overlay";

      const card = document.createElement("div");
      card.className = "m_season_popup_card";

      const title = document.createElement("div");
      title.className = "m_season_popup_title";
      title.textContent =
        (el.getAttribute("data-season") || "Season") + " Comment";

      const popupBody = document.createElement("div");
      popupBody.className = "m_season_popup_body";
      popupBody.textContent = el.getAttribute("data-comment");

      const closeBtn = document.createElement("button");
      closeBtn.className = "m_season_popup_close";
      closeBtn.type = "button";
      closeBtn.textContent = "Close";

      card.appendChild(title);
      card.appendChild(popupBody);
      card.appendChild(closeBtn);
      overlay.appendChild(card);
      document.body.appendChild(overlay);
      activeMobilePopup = overlay;

      requestAnimationFrame(() => overlay.classList.add("m_popup_visible"));
    };

    document.addEventListener("mouseover", onMouseOver);
    document.addEventListener("mouseout", onMouseOut);
    document.addEventListener("click", onDesktopClick);
    document.addEventListener("click", onMobileClick);
    return () => {
      document.removeEventListener("mouseover", onMouseOver);
      document.removeEventListener("mouseout", onMouseOut);
      document.removeEventListener("click", onDesktopClick);
      document.removeEventListener("click", onMobileClick);
      removeTooltip();
      removeMobilePopup();
    };
  }, []);
}
