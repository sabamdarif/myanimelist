"use client";

import { useRef, useState } from "react";
import type { Anime } from "@/lib/anime";
import { fetchAndPatchThumbnail } from "./Thumb";

// Key this component by categoryId in the parent so state resets per tab.
export function AutofetchBanner({
  missing,
  categoryId,
  onThumb,
}: {
  missing: Anime[];
  categoryId: number;
  onThumb: (animeId: number | string, thumbUrl: string) => void;
}) {
  const [phase, setPhase] = useState<"prompt" | "fetching" | "done" | "hidden">(
    "prompt",
  );
  const [count, setCount] = useState(0);
  const totalRef = useRef(0);

  if (phase === "hidden" || (phase === "prompt" && missing.length === 0)) {
    return null;
  }

  async function start() {
    const targets = missing.slice();
    totalRef.current = targets.length;
    setPhase("fetching");
    setCount(0);
    for (let i = 0; i < targets.length; i++) {
      try {
        const url = await fetchAndPatchThumbnail(
          targets[i].id,
          targets[i].name,
          categoryId,
        );
        onThumb(targets[i].id, url);
      } catch (err) {
        console.error("Auto-fetch failed for " + targets[i].name, err);
      }
      setCount(i + 1);
      // Delay 500ms to avoid Jikan API rate limit (3 RPS)
      if (i < targets.length - 1) {
        await new Promise((res) => setTimeout(res, 500));
      }
    }
    setPhase("done");
    setTimeout(() => setPhase("hidden"), 3000);
  }

  const total = totalRef.current;
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <div className="autofetch_banner" id="autofetch_banner">
      <div className="autofetch_content">
        {phase === "prompt" ? (
          <>
            <i className="nf nf-md-image_off"></i>{" "}
            <span>
              {missing.length} anime {missing.length === 1 ? "is" : "are"}{" "}
              missing thumbnails. Auto-fetch them?
            </span>
            <div className="autofetch_actions">
              <button className="autofetch_btn_yes" onClick={start}>
                Yes
              </button>
              <button
                className="autofetch_btn_close"
                title="Close"
                onClick={() => setPhase("hidden")}
              >
                <i className="nf nf-md-close"></i>
              </button>
            </div>
          </>
        ) : phase === "fetching" ? (
          <>
            <i className="nf nf-md-cloud_sync"></i>{" "}
            <span>
              Fetching thumbnails ({count}/{total})...
            </span>
          </>
        ) : (
          <>
            <i
              className="nf nf-fa-check_circle"
              style={{ color: "var(--success,#4ade80)" }}
            ></i>{" "}
            <span>All missing thumbnails fetched!</span>
          </>
        )}
      </div>
      {phase === "fetching" && (
        <div className="autofetch_progress_bar">
          <div
            className="autofetch_progress_fill"
            style={{ width: `${pct}%` }}
          ></div>
        </div>
      )}
    </div>
  );
}
