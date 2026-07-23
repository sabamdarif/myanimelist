"use client";

import { useEffect, useRef, useState } from "react";
import type { Filters } from "@/lib/filters";
import { hasActiveFilters } from "@/lib/filters";

const GROUPS: {
  label: string;
  type: "sort" | "status" | "attr" | "lang";
  opts: [string, string][];
}[] = [
  {
    label: "Sort:",
    type: "sort",
    opts: [
      ["az", "A → Z"],
      ["za", "Z → A"],
      ["rating_high", "High → Low Rating"],
      ["rating_low", "Low → High Rating"],
    ],
  },
  {
    label: "Status:",
    type: "status",
    opts: [
      ["completed", "Completed"],
      ["watching", "Watching"],
      ["watching_first", "Watching First"],
      ["completed_first", "Completed First"],
    ],
  },
  {
    label: "Attrs:",
    type: "attr",
    opts: [
      ["ova", "Has OVA"],
      ["ova_first", "Has OVA First"],
    ],
  },
  {
    label: "Lang:",
    type: "lang",
    opts: [
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
    ].map((l) => [l, l]),
  },
];

function isActive(f: Filters, type: string, val: string): boolean {
  if (type === "sort") return f.sort === val;
  if (type === "status") return f.status === val;
  if (type === "attr") return f.attr.includes(val);
  return f.lang === val;
}

export function FilterPills({
  filters,
  onToggle,
  onClear,
}: {
  filters: Filters;
  onToggle: (type: string, val: string) => void;
  onClear: () => void;
}) {
  return (
    <>
      {GROUPS.map((g) => (
        <div key={g.type} className="filter_group">
          <span className="filter_label">{g.label}</span>
          {g.opts.map(([val, label]) => (
            <button
              key={val}
              type="button"
              className={`filter_pill${isActive(filters, g.type, val) ? " active" : ""}`}
              onClick={() => onToggle(g.type, val)}
            >
              {label}
            </button>
          ))}
        </div>
      ))}
      {hasActiveFilters(filters) && (
        <button type="button" className="filter_clear_btn" onClick={onClear}>
          <i className="nf nf-cod-clear_all"></i> Clear Filters
        </button>
      )}
    </>
  );
}

// Desktop: filter icon in the table header + dropdown
export function FilterToolbar({
  filters,
  onToggle,
  onClear,
}: {
  filters: Filters;
  onToggle: (type: string, val: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open]);

  return (
    <div
      className="table_filter_container"
      id="anime_filter_toolbar"
      ref={containerRef}
    >
      <button
        type="button"
        className={`table_filter_icon_btn${hasActiveFilters(filters) ? " active" : ""}`}
        id="m_filter_toggle_btn"
        title="Filters"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <i className="nf nf-fa-filter"></i>
      </button>
      <div
        className={`filter_controls_dropdown${open ? " open" : ""}`}
        id="filter_controls_wrapper"
      >
        <FilterPills filters={filters} onToggle={onToggle} onClear={onClear} />
      </div>
    </div>
  );
}
