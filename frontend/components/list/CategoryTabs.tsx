"use client";

import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import type { Category } from "@/lib/anime";

function SortableTab({
  cat,
  active,
  editVisible,
  onClick,
  onHover,
  onEdit,
}: {
  cat: Category;
  active: boolean;
  editVisible: boolean;
  onClick: () => void;
  onHover?: () => void;
  onEdit?: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cat.id });

  return (
    <div
      ref={setNodeRef}
      className={`category_tab_wrapper${active ? " active" : ""}${
        editVisible ? " category_edit_visible" : ""
      }${isDragging ? " cat_dragging" : ""}`}
      data-category-id={cat.id}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        touchAction: "manipulation",
      }}
      {...attributes}
      {...listeners}
    >
      <button
        type="button"
        className={`category_tab${active ? " active" : ""}`}
        onClick={onClick}
        onMouseEnter={onHover}
      >
        {cat.name}
      </button>
      <button
        type="button"
        className="category_edit_btn"
        aria-label="Edit category"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onEdit?.();
        }}
      >
        <i className="nf nf-fa-pencil"></i>
      </button>
    </div>
  );
}

export function CategoryTabs({
  categories,
  activeId,
  onSelect,
  onHover,
  onReorder,
  onEditCategory,
}: {
  categories: Category[] | "loading" | "error";
  activeId: number | null;
  onSelect: (id: number) => void;
  onHover?: (id: number) => void;
  onReorder?: (ordered: Category[]) => void;
  onEditCategory?: (cat: Category) => void;
}) {
  // second click on the active tab reveals the edit pencil (edit modal = phase 6)
  const [editVisibleId, setEditVisibleId] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const list = Array.isArray(categories) ? categories : [];

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = list.findIndex((c) => c.id === active.id);
    const to = list.findIndex((c) => c.id === over.id);
    if (from < 0 || to < 0) return;
    onReorder?.(arrayMove(list, from, to));
  };

  return (
    <nav className="category_tabs" id="category_tabs">
      {categories === "loading" ? (
        <div
          className="m_search_loader search_loading"
          style={{
            width: 24,
            height: 24,
            display: "inline-block",
            marginLeft: 20,
          }}
        ></div>
      ) : categories === "error" ? (
        <span style={{ color: "red", marginLeft: 12 }}>
          Failed to load categories. Please refresh.
        </span>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={list.map((c) => c.id)}
            strategy={horizontalListSortingStrategy}
          >
            {list.map((cat) => {
              const active = cat.id === activeId;
              return (
                <SortableTab
                  key={cat.id}
                  cat={cat}
                  active={active}
                  editVisible={editVisibleId === cat.id}
                  onHover={onHover ? () => onHover(cat.id) : undefined}
                  onEdit={
                    onEditCategory ? () => onEditCategory(cat) : undefined
                  }
                  onClick={() => {
                    if (active) {
                      setEditVisibleId((v) => (v === cat.id ? null : cat.id));
                      return;
                    }
                    setEditVisibleId(null);
                    onSelect(cat.id);
                  }}
                />
              );
            })}
          </SortableContext>
        </DndContext>
      )}
    </nav>
  );
}
