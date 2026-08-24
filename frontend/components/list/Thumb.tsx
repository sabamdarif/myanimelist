/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import { apiJson } from "@/lib/api";
import { sanitizeUrl } from "@/lib/anime";

// Jikan lookup + PATCH thumbnail_url (port of AnimeRenderer.fetchAndPatchThumbnail)
export async function fetchAndPatchThumbnail(
  animeId: number | string,
  animeName: string,
  categoryId: number,
): Promise<string> {
  const resp = await fetch(
    `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(animeName)}&limit=1`,
  );
  if (!resp.ok) throw new Error("Jikan HTTP " + resp.status);
  const data = await resp.json();
  const thumbUrl: string =
    data?.data?.[0]?.images?.jpg?.image_url || "";
  if (!thumbUrl) throw new Error("No thumbnail found");
  await apiJson(`/api/v1/categories/${categoryId}/animes/${animeId}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ thumbnail_url: thumbUrl }),
  });
  return thumbUrl;
}

export function Thumb({
  url,
  name,
  imgClass,
  animeId,
  categoryId,
  onLoaded,
  showLoadBtn,
}: {
  url: string;
  name: string;
  imgClass: "thumb_img" | "m_card_thumb";
  animeId: number | string;
  categoryId: number | null;
  onLoaded: (animeId: number | string, thumbUrl: string) => void;
  showLoadBtn: boolean;
}) {
  const [imgState, setImgState] = useState<"loading" | "done" | "error">(
    "loading",
  );
  const [btnState, setBtnState] = useState<"idle" | "fetching" | "error">(
    "idle",
  );

  const safeUrl = sanitizeUrl(url);
  if (safeUrl) {
    if (imgState === "error") return null;
    return (
      <img
        src={safeUrl}
        alt={name}
        className={`${imgClass}${imgState === "loading" ? " thumb_skeleton" : ""}`}
        loading="lazy"
        onLoad={() => setImgState("done")}
        onError={() => setImgState("error")}
      />
    );
  }

  return (
    <div
      className={`thumb_placeholder ${imgClass}_placeholder${btnState === "fetching" ? " thumb_loading" : ""}`}
    >
      {showLoadBtn && (
        <button
          type="button"
          className={`thumb_load_btn${btnState === "error" ? " thumb_load_error" : ""}`}
          disabled={btnState === "fetching" || categoryId == null}
          onClick={(e) => {
            e.stopPropagation();
            if (categoryId == null) return;
            setBtnState("fetching");
            fetchAndPatchThumbnail(animeId, name, categoryId)
              .then((thumbUrl) => onLoaded(animeId, thumbUrl))
              .catch(() => setBtnState("error"));
          }}
        >
          {btnState === "fetching" ? (
            <span className="thumb_spinner"></span>
          ) : btnState === "error" ? (
            <>
              <i className="nf nf-md-alert_circle_outline"></i> Retry
            </>
          ) : (
            <>
              <i className="nf nf-md-download"></i> Load
            </>
          )}
        </button>
      )}
    </div>
  );
}
