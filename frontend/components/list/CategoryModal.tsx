"use client";

// Add / Edit category modal (edit adds a Delete button). Ports the acm_/ecm_
// markup + animation from add_category_modal.js / edit_category_modal.js, but
// drives writes through useCategoryWrites (optimistic, no reload).

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { useCategoryWrites } from "@/lib/categoryWrites";
import "../../app/styles/add_category.css";

export type CategoryModalState =
  | { mode: "add" }
  | { mode: "edit"; id: number; name: string };

export function CategoryModal({
  state,
  onClose,
}: {
  state: CategoryModalState | null;
  onClose: () => void;
}) {
  const { create, rename, remove } = useCategoryWrites();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isEdit = state?.mode === "edit";
  const busy = create.isPending || rename.isPending || remove.isPending;

  useEffect(() => {
    if (!state) return;
    setName(state.mode === "edit" ? state.name : "");
    setError("");
    const id = requestAnimationFrame(() => {
      setVisible(true);
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [state]);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  function close() {
    setVisible(false);
    setTimeout(onClose, 250);
  }

  function errMsg(e: unknown, fallback: string) {
    return e instanceof ApiError && e.messages.length
      ? e.messages[0]
      : fallback;
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required");
      inputRef.current?.focus();
      return;
    }
    setError("");
    try {
      if (isEdit) {
        await rename.mutateAsync({ id: state.id, name: trimmed });
      } else {
        await create.mutateAsync(trimmed);
      }
      close();
    } catch (e) {
      setError(errMsg(e, "Save failed"));
    }
  }

  async function del() {
    if (!isEdit) return;
    if (
      !confirm("Are you sure you want to delete this category and all its anime?")
    )
      return;
    setError("");
    try {
      await remove.mutateAsync(state.id);
      close();
    } catch (e) {
      setError(errMsg(e, "Delete failed"));
    }
  }

  if (!state) return null;

  return (
    <div
      className={`acm_overlay${visible ? " acm_visible" : ""}`}
      style={{ display: "flex" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="acm_card">
        <div className="acm_header">
          <span className="acm_title">
            {isEdit ? "Edit Category" : "Add New Category"}
          </span>
          <button
            type="button"
            className="acm_close_btn"
            aria-label="Close"
            onClick={close}
          >
            &times;
          </button>
        </div>
        <div className="acm_body">
          <div className="acm_section">
            <label className="acm_label" htmlFor="acm_name_input">
              Category Name
            </label>
            <input
              ref={inputRef}
              className="acm_name_input"
              id="acm_name_input"
              type="text"
              placeholder="e.g., Favorites, Winter 2024"
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  save();
                }
              }}
            />
          </div>
        </div>
        <div
          className="acm_footer"
          style={isEdit ? { justifyContent: "space-between" } : undefined}
        >
          {isEdit && (
            <button
              type="button"
              className="acm_cancel_btn"
              style={{
                color: "var(--danger)",
                borderColor: "var(--danger)",
                background: "transparent",
              }}
              disabled={busy}
              onClick={del}
            >
              {remove.isPending ? (
                <>
                  <span className="btn_spinner"></span> Deleting…
                </>
              ) : (
                "Delete"
              )}
            </button>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="acm_error">{error}</span>
            <button
              type="button"
              className="acm_cancel_btn"
              onClick={close}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="acm_save_btn"
              onClick={save}
              disabled={busy}
            >
              {create.isPending || rename.isPending ? (
                <>
                  <span className="btn_spinner"></span> Saving…
                </>
              ) : isEdit ? (
                "Save"
              ) : (
                "Add Category"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
