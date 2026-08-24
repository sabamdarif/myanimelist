"use client";

// Add / Edit anime modal — React port of anime_modal_base.js (same aam_
// classes and behavior: Jikan autocomplete, interleaved season/OVA rows,
// star rating, language chips, thumbnail URL editor).

import { useEffect, useRef, useState } from "react";
import {
  type Anime,
  type Category,
  sanitizeUrl,
  starsNum,
} from "@/lib/anime";
import type { AnimePayload } from "@/lib/animeWrites";
import "../../app/styles/add_anime.css";

const JIKAN = "https://api.jikan.moe/v4/anime";
const LANG_PRESETS = [
  "Japanese",
  "English",
  "Spanish",
  "Hindi",
  "French",
  "German",
  "Korean",
  "Chinese",
  "Portuguese",
  "Italian",
];

type Entry = {
  type: "season" | "ova";
  number?: number;
  total: number;
  watched: number;
  comment: string;
};

type Suggestion = { name: string; img: string; thumb: string };

export type AnimeModalState =
  | { mode: "add" }
  | { mode: "edit"; anime: Anime; categoryId: number };

function bestMatchName(
  item: { title?: string; title_english?: string },
  query: string,
): string {
  const jp = item.title || "";
  const en = item.title_english || "";
  const ql = query.toLowerCase();
  const jpMatch = jp && jp.toLowerCase().includes(ql);
  const enMatch = en && en.toLowerCase().includes(ql);
  if (jpMatch && !enMatch) return jp;
  if (enMatch && !jpMatch) return en;
  return en || jp;
}

function entriesFromAnime(a: Anime): Entry[] {
  const sorted = [...a.seasons].sort((x, y) => x.number - y.number);
  const entries: Entry[] = sorted.map((s) => ({
    type: s.isOva ? "ova" : "season",
    number: s.number,
    total: s.total,
    watched: s.watched,
    comment: s.comment,
  }));
  return entries.length ? entries : [{ type: "season", number: 1, total: 0, watched: 0, comment: "" }];
}

export function AnimeModal({
  state,
  categories,
  activeCatId,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: {
  state: AnimeModalState | null;
  categories: Category[];
  activeCatId: number | null;
  onClose: () => void;
  onCreate: (payload: AnimePayload, catId: number) => void;
  onUpdate: (
    payload: AnimePayload,
    animeId: number | string,
    oldCatId: number,
    newCatId: number,
  ) => void;
  onDelete: (animeId: number | string, catId: number) => void;
}) {
  const isEdit = state?.mode === "edit";

  const [visible, setVisible] = useState(false);
  const [name, setName] = useState("");
  const [thumbUrl, setThumbUrl] = useState("");
  const [urlEditorOpen, setUrlEditorOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [catId, setCatId] = useState("");
  const [rating, setRating] = useState(0);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [editingNumIdx, setEditingNumIdx] = useState<number | null>(null);
  const [languages, setLanguages] = useState<string[]>([]);
  const [langQuery, setLangQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  const nameRef = useRef<HTMLInputElement>(null);
  const nameWrapRef = useRef<HTMLDivElement>(null);
  const langWrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionsRef = useRef(suggestions);
  suggestionsRef.current = suggestions;

  /* ── open: reset / prefill ── */
  useEffect(() => {
    if (!state) return;
    setError("");
    setSuggestions([]);
    setLangQuery("");
    setUrlEditorOpen(false);
    setEditingNumIdx(null);
    if (state.mode === "edit") {
      const a = state.anime;
      setName(a.name);
      const safe = sanitizeUrl(a.thumbnail_url);
      setThumbUrl(safe);
      setUrlDraft(safe);
      setCatId(String(state.categoryId));
      setRating(Math.round(starsNum(a.stars)));
      setEntries(entriesFromAnime(a));
      setLanguages(
        (a.language || "")
          .split(",")
          .map((l) => l.trim())
          .filter(Boolean),
      );
    } else {
      setName("");
      setThumbUrl("");
      setUrlDraft("");
      setCatId(activeCatId != null ? String(activeCatId) : "");
      setRating(0);
      setEntries([{ type: "season", number: 1, total: 0, watched: 0, comment: "" }]);
      setLanguages([]);
    }
    const id = requestAnimationFrame(() => {
      setVisible(true);
      nameRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function close() {
    setVisible(false);
    setTimeout(onClose, 250);
  }

  /* ── Escape: clear suggestions first, then close ── */
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (suggestionsRef.current.length > 0) {
        setSuggestions([]);
        e.stopPropagation();
      } else {
        close();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  /* ── outside clicks: suggestions + language dropdown ── */
  useEffect(() => {
    if (!state) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!nameWrapRef.current?.contains(t)) setSuggestions([]);
      if (!langWrapRef.current?.contains(t)) setLangQuery("");
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [state]);

  /* ── Jikan search ── */
  function onNameInput(v: string) {
    setName(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = v.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`${JIKAN}?q=${encodeURIComponent(q)}&limit=6`);
        const j = await r.json();
        type JikanItem = {
          title?: string;
          title_english?: string;
          images?: { jpg?: { image_url?: string; small_image_url?: string } };
        };
        setSuggestions(
          ((j.data || []) as JikanItem[]).map((a) => ({
            name: bestMatchName(a, q),
            img: sanitizeUrl(a.images?.jpg?.image_url || ""),
            thumb: sanitizeUrl(
              a.images?.jpg?.small_image_url || a.images?.jpg?.image_url || "",
            ),
          })),
        );
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  }

  function pickAnime(s: Suggestion) {
    setName(s.name);
    setSuggestions([]);
    setThumbUrl(s.img);
    setUrlDraft(s.img);
  }

  /* ── entries ── */
  function patchEntry(i: number, patch: Partial<Entry>) {
    setEntries((es) => es.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  }

  function addSeason() {
    setEntries((es) => {
      let maxNum = 0;
      for (const e of es) {
        if (e.type === "season") maxNum = Math.max(maxNum, e.number || 1);
      }
      return [
        ...es,
        { type: "season", number: maxNum + 1, total: 0, watched: 0, comment: "" },
      ];
    });
  }

  function addOva() {
    setEntries((es) => [
      ...es,
      { type: "ova", total: 0, watched: 0, comment: "" },
    ]);
  }

  // old modal's change-commit clamp: watched>total grows an unset total,
  // otherwise clamps watched down; shrinking total drags watched with it
  function commitEpisodes(i: number) {
    setEntries((es) =>
      es.map((e, j) => {
        if (j !== i) return e;
        let { total, watched } = e;
        total = Math.max(0, total || 0);
        watched = Math.max(0, watched || 0);
        if (watched > total) {
          if (total === 0) total = watched;
          else watched = total;
        }
        return { ...e, total, watched };
      }),
    );
  }

  /* ── languages ── */
  const langQ = langQuery.trim().toLowerCase();
  const langOptions = langQ
    ? LANG_PRESETS.filter(
        (l) => l.toLowerCase().includes(langQ) && !languages.includes(l),
      )
    : [];
  const langCustom =
    langQ &&
    !langOptions.some((l) => l.toLowerCase() === langQ) &&
    !languages.some((l) => l.toLowerCase() === langQ)
      ? langQ.charAt(0).toUpperCase() + langQ.slice(1)
      : null;

  function addLanguage(lang: string) {
    if (!languages.some((l) => l.toLowerCase() === lang.toLowerCase())) {
      setLanguages((ls) => [...ls, lang]);
    }
    setLangQuery("");
  }

  /* ── save / delete ── */
  function save() {
    if (!state) return;
    setError("");
    const finalName = name.trim();
    if (!finalName) {
      setError("Name is required");
      return;
    }
    if (!catId) {
      setError("Select a category");
      return;
    }

    const seasonEntries: AnimePayload["seasons"] = [];
    let lastSeasonNum = 0;
    let ovaCount = 0;
    for (const e of entries) {
      if (e.watched > e.total) {
        setError(
          e.type === "season"
            ? `Season ${e.number}: watched cannot exceed total`
            : "OVA: watched cannot exceed total",
        );
        return;
      }
      if (e.type === "season") {
        const num = e.number || ++lastSeasonNum;
        lastSeasonNum = num;
        ovaCount = 0;
        seasonEntries.push({
          number: num,
          total_episodes: e.total,
          watched_episodes: e.watched,
          comment: e.comment,
        });
      } else {
        ovaCount++;
        const afterSeason = Math.max(lastSeasonNum, 1);
        seasonEntries.push({
          number: Number((afterSeason + ovaCount * 0.01).toFixed(2)),
          total_episodes: e.total,
          watched_episodes: e.watched,
          comment: e.comment,
        });
      }
    }

    const payload: AnimePayload = {
      name: finalName,
      thumbnail_url: sanitizeUrl(thumbUrl) || sanitizeUrl(urlDraft.trim()) || "",
      language: languages.join(", "),
      stars: rating || null,
      seasons: seasonEntries,
    };

    const target = parseInt(catId, 10);
    if (state.mode === "edit") {
      onUpdate(payload, state.anime.id, state.categoryId, target);
    } else {
      onCreate(payload, target);
    }
    close();
  }

  function del() {
    if (state?.mode !== "edit") return;
    if (!confirm("Are you sure you want to delete this anime?")) return;
    onDelete(state.anime.id, state.categoryId);
    close();
  }

  if (!state) return null;

  let seasonCounter = 0;

  return (
    <div
      className={`aam_overlay${visible ? " aam_visible" : ""}`}
      style={{ display: "flex" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="aam_card">
        <div className="aam_header">
          <span className="aam_title">{isEdit ? "Edit Anime" : "Add Anime"}</span>
          <button
            type="button"
            className="aam_close_btn"
            aria-label="Close"
            onClick={close}
          >
            &times;
          </button>
        </div>

        <div className="aam_body">
          {/* top row: thumbnail + name */}
          <div className="aam_top_row">
            <div className="aam_thumb_area">
              <div
                className={`aam_thumb_box${thumbUrl ? "" : " aam_thumb_empty"}`}
              >
                {thumbUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="aam_thumb_img" src={thumbUrl} alt="" />
                )}
              </div>
              <button
                type="button"
                className="aam_edit_url_btn"
                style={{ display: thumbUrl || isEdit ? "block" : "none" }}
                onClick={() => setUrlEditorOpen((o) => !o)}
              >
                Edit Thumbnail URL
              </button>
              {urlEditorOpen && (
                <div className="aam_url_editor" style={{ display: "flex" }}>
                  <input
                    className="aam_url_input"
                    type="url"
                    placeholder="Paste image URL…"
                    value={urlDraft}
                    onChange={(e) => setUrlDraft(e.target.value)}
                  />
                  <button
                    type="button"
                    className="aam_url_done"
                    onClick={() => {
                      const u = sanitizeUrl(urlDraft.trim());
                      setThumbUrl(u);
                      setUrlDraft(u);
                      setUrlEditorOpen(false);
                    }}
                  >
                    Done
                  </button>
                </div>
              )}
            </div>

            <div className="aam_name_wrap" ref={nameWrapRef}>
              <div className="aam_name_field">
                <input
                  ref={nameRef}
                  className="aam_name_input"
                  type="text"
                  placeholder="Anime Name"
                  autoComplete="off"
                  value={name}
                  onChange={(e) => onNameInput(e.target.value)}
                />
                <span
                  className="aam_search_spinner"
                  style={{ display: searching ? "block" : "none" }}
                ></span>
              </div>
              <div className="aam_suggestions">
                {suggestions.map((s, i) => (
                  <div
                    key={i}
                    className="aam_sug_item"
                    onClick={() => pickAnime(s)}
                  >
                    {s.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="aam_sug_thumb" src={s.thumb} alt="" />
                    ) : (
                      <span className="aam_sug_thumb_empty"></span>
                    )}
                    <span className="aam_sug_name">{s.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* category */}
          <div className="aam_section">
            <select
              className="aam_category_select"
              value={catId}
              onChange={(e) => setCatId(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* stars */}
          <div className="aam_section">
            <div className="aam_star_row">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
                <span
                  key={v}
                  className={`aam_star${v <= rating ? " aam_star_active" : ""}`}
                  onClick={() => setRating(v)}
                >
                  ★
                </span>
              ))}
            </div>
          </div>

          {/* seasons & OVAs */}
          <div className="aam_section">
            <div className="aam_seasons_header">
              <span className="aam_seasons_title">Seasons</span>
            </div>
            <div className="aam_seasons_cols">
              <span>Season / OVA</span>
              <span>Watched / Total</span>
              <span>Comment</span>
            </div>
            <div className="aam_seasons_list">
              {entries.map((entry, i) => {
                const isOva = entry.type === "ova";
                if (!isOva) {
                  seasonCounter++;
                  if (!entry.number) entry.number = seasonCounter;
                }
                return (
                  <div
                    key={i}
                    className={`aam_season_row${isOva ? " aam_ova_row" : ""}`}
                  >
                    {isOva ? (
                      <span className="aam_season_label aam_ova_label">OVA</span>
                    ) : editingNumIdx === i ? (
                      <span className="aam_season_label">
                        Season{" "}
                        <input
                          className="aam_season_num_input"
                          type="number"
                          min={1}
                          max={100}
                          defaultValue={entry.number}
                          autoFocus
                          style={{
                            width: 40,
                            marginLeft: 4,
                            padding: 2,
                            border: "1px solid var(--border)",
                            borderRadius: 4,
                            background: "var(--bg-tertiary)",
                            color: "var(--text)",
                          }}
                          onBlur={(e) => {
                            const val = parseInt(e.target.value);
                            if (!isNaN(val) && val >= 1 && val <= 100) {
                              patchEntry(i, { number: val });
                            }
                            setEditingNumIdx(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                        />
                      </span>
                    ) : (
                      <span
                        className="aam_season_label"
                        title="Double-click to edit season number"
                        style={{ cursor: "pointer" }}
                        onDoubleClick={() => setEditingNumIdx(i)}
                      >
                        Season {entry.number}
                      </span>
                    )}

                    <div className="aam_ep_cell">
                      <input
                        className="aam_ep_watched"
                        type="number"
                        min={0}
                        placeholder="0"
                        value={String(entry.watched)}
                        onChange={(e) =>
                          patchEntry(i, { watched: +e.target.value || 0 })
                        }
                        onBlur={() => commitEpisodes(i)}
                      />
                      <span className="aam_ep_slash">/</span>
                      <input
                        className="aam_ep_total"
                        type="number"
                        min={0}
                        placeholder="0"
                        value={String(entry.total)}
                        onChange={(e) =>
                          patchEntry(i, { total: +e.target.value || 0 })
                        }
                        onBlur={() => commitEpisodes(i)}
                      />
                    </div>

                    <textarea
                      className="aam_season_comment"
                      placeholder="Enter your thoughts…"
                      rows={1}
                      value={entry.comment}
                      onChange={(e) => patchEntry(i, { comment: e.target.value })}
                    />

                    {entries.length > 1 && (
                      <button
                        type="button"
                        className="aam_season_remove"
                        onClick={() =>
                          setEntries((es) => es.filter((_, j) => j !== i))
                        }
                      >
                        &times;
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="aam_season_btns">
              <button
                type="button"
                className="aam_add_season_btn"
                onClick={addSeason}
              >
                + Add Season
              </button>
              <button type="button" className="aam_add_ova_btn" onClick={addOva}>
                + Add OVA
              </button>
            </div>
          </div>

          {/* languages */}
          <div className="aam_section">
            <div className="aam_lang_wrap" ref={langWrapRef}>
              <div className="aam_lang_tags">
                {languages.map((lang, i) => (
                  <span key={lang} className="aam_lang_chip">
                    {lang}
                    <button
                      type="button"
                      className="aam_lang_chip_x"
                      onClick={() =>
                        setLanguages((ls) => ls.filter((_, j) => j !== i))
                      }
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
              <div className="aam_lang_input_wrap">
                <input
                  className="aam_lang_input"
                  type="text"
                  placeholder="Type to add language…"
                  autoComplete="off"
                  value={langQuery}
                  onChange={(e) => setLangQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const v = langQuery.trim();
                      if (v) addLanguage(v.charAt(0).toUpperCase() + v.slice(1));
                    }
                  }}
                />
                {(langOptions.length > 0 || langCustom) && (
                  <div
                    className="aam_lang_dropdown"
                    style={{
                      display: "block",
                      top: "100%",
                      left: 0,
                      minWidth: "100%",
                      marginTop: 4,
                    }}
                  >
                    {langOptions.map((l) => (
                      <div
                        key={l}
                        className="aam_lang_opt"
                        onClick={() => addLanguage(l)}
                      >
                        {l}
                      </div>
                    ))}
                    {langCustom && (
                      <div
                        className="aam_lang_opt aam_lang_custom"
                        onClick={() => addLanguage(langCustom)}
                      >
                        Add &quot;{langCustom}&quot;
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className={`aam_footer${isEdit ? " aam_footer_with_delete" : ""}`}>
          {isEdit && (
            <button type="button" className="aam_delete_btn" onClick={del}>
              Delete
            </button>
          )}
          <div className="aam_footer_right">
            <span className="aam_error">{error}</span>
            <button type="button" className="aam_save_btn" onClick={save}>
              {isEdit ? "Update" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
