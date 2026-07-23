"use client";

import {
  DndContext,
  type DragEndEvent,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Anime } from "@/lib/anime";
import { starsNum } from "@/lib/anime";
import { LangBadges, MobileSeasons } from "./seasons";
import { Thumb } from "./Thumb";

function SkeletonCards({ rows }: { rows: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="m_card m_card_skel">
          <div className="skel skel_thumb_m"></div>
          <div className="m_card_body">
            <div className="skel skel_text" style={{ width: "60%" }}></div>
            <div
              className="skel skel_text"
              style={{ width: "80%", marginTop: 6 }}
            ></div>
            <div className="skel skel_badge" style={{ marginTop: 8 }}></div>
          </div>
        </div>
      ))}
    </>
  );
}

// Whole card is the drag activator (250ms hold), so scrolling stays free:
// touch-action manipulation + delay-based activation.
function SortableCard({
  a,
  categoryId,
  onThumbLoaded,
  dragDisabled,
  onEdit,
}: {
  a: Anime;
  categoryId: number | null;
  onThumbLoaded: (animeId: number | string, thumbUrl: string) => void;
  dragDisabled: boolean;
  onEdit?: (a: Anime) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: a.id, disabled: dragDisabled });
  const rating = starsNum(a.stars);

  return (
    <div
      ref={setNodeRef}
      className={`m_card${isDragging ? " anime_dragging_mobile" : ""}`}
      data-anime-id={a.id}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        touchAction: "manipulation",
      }}
      {...attributes}
      {...listeners}
    >
      <Thumb
        url={a.thumbnail_url}
        name={a.name}
        imgClass="m_card_thumb"
        animeId={a.id}
        categoryId={categoryId}
        onLoaded={onThumbLoaded}
        showLoadBtn
      />
      <div className="m_card_body">
        <h3 className="m_card_title">{a.name}</h3>
        <div className="m_card_seasons">
          <MobileSeasons seasons={a.seasons} />
        </div>
        <div className="badge_wrap m_card_langs">
          <LangBadges language={a.language} />
        </div>
        <div className="m_card_footer">
          <span className="m_card_rating">
            <span className={`star single ${rating > 0 ? "filled" : "empty"}`}>
              {rating > 0 ? "★" : "☆"}
            </span>{" "}
            {rating.toFixed(1)}
          </span>
          <button
            className="edit_btn"
            title="Edit"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.(a);
            }}
          >
            <i className="nf nf-fa-pencil"></i>
          </button>
        </div>
      </div>
    </div>
  );
}

export function MobileCards({
  animes,
  categoryId,
  emptyMessage = "No anime found in this category.",
  onThumbLoaded,
  onReorder,
  dragDisabled = false,
  onEdit,
}: {
  animes: Anime[] | "loading" | "error";
  categoryId: number | null;
  emptyMessage?: string;
  onThumbLoaded: (animeId: number | string, thumbUrl: string) => void;
  onReorder?: (ordered: Anime[]) => void;
  dragDisabled?: boolean;
  onEdit?: (a: Anime) => void;
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
  );
  const list = Array.isArray(animes) ? animes : [];
  const disabled = dragDisabled || !onReorder;

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = list.findIndex((a) => a.id === active.id);
    const to = list.findIndex((a) => a.id === over.id);
    if (from < 0 || to < 0) return;
    onReorder?.(arrayMove(list, from, to));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={list.map((a) => a.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="mobile_card_list" id="mobile_card_list">
          {animes === "loading" ? (
            <SkeletonCards rows={4} />
          ) : animes === "error" ? (
            <p className="empty_msg">Failed to load anime.</p>
          ) : animes.length === 0 ? (
            <p className="empty_msg">{emptyMessage}</p>
          ) : (
            animes.map((a) => (
              <SortableCard
                key={a.id}
                a={a}
                categoryId={categoryId}
                onThumbLoaded={onThumbLoaded}
                dragDisabled={disabled}
                onEdit={onEdit}
              />
            ))
          )}
        </div>
      </SortableContext>
    </DndContext>
  );
}
