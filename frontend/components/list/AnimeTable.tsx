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
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Anime } from "@/lib/anime";
import { LangBadges, SeasonPills, Stars } from "./seasons";
import { Thumb } from "./Thumb";

function SkeletonRows({ rows, readOnly }: { rows: number; readOnly: boolean }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i} className="skeleton_row">
          <td className="col_id">
            <span className="skel"></span>
          </td>
          <td className="col_thumb">
            <span className="skel skel_thumb"></span>
          </td>
          <td className="col_name">
            <span className="skel skel_text"></span>
          </td>
          <td className="col_season">
            <span className="skel skel_badge"></span>
          </td>
          <td className="col_lang">
            <span className="skel skel_badge"></span>
          </td>
          <td className="col_stars">
            <span className="skel skel_text_sm"></span>
          </td>
          {!readOnly && (
            <td className="col_edit">
              <span className="skel skel_btn"></span>
            </td>
          )}
        </tr>
      ))}
    </>
  );
}

function SortableRow({
  a,
  idx,
  categoryId,
  onThumbLoaded,
  dragDisabled,
  onEdit,
  readOnly,
}: {
  a: Anime;
  idx: number;
  categoryId: number | null;
  onThumbLoaded: (animeId: number | string, thumbUrl: string) => void;
  dragDisabled: boolean;
  onEdit?: (a: Anime) => void;
  readOnly: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: a.id, disabled: dragDisabled });

  return (
    <tr
      ref={setNodeRef}
      data-anime-id={a.id}
      className={isDragging ? "anime_dragging" : undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <td
        className="col_id"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        style={dragDisabled ? undefined : { cursor: "grab", touchAction: "none" }}
      >
        {idx + 1}
      </td>
      <td className="col_thumb">
        <Thumb
          url={a.thumbnail_url}
          name={a.name}
          imgClass="thumb_img"
          animeId={a.id}
          categoryId={categoryId}
          onLoaded={onThumbLoaded}
          showLoadBtn={!readOnly}
        />
      </td>
      <td className="col_name">{a.name}</td>
      <td className="col_season">
        <div className="season_wrap">
          <SeasonPills seasons={a.seasons} />
        </div>
      </td>
      <td className="col_lang">
        <div className="badge_wrap">
          <LangBadges language={a.language} />
        </div>
      </td>
      <td className="col_stars">
        <Stars value={a.stars} />
      </td>
      {!readOnly && (
        <td className="col_edit">
          <button className="edit_btn" title="Edit" onClick={() => onEdit?.(a)}>
            <i className="nf nf-fa-pencil"></i>
          </button>
        </td>
      )}
    </tr>
  );
}

export function AnimeTable({
  animes,
  categoryId,
  emptyMessage = "No anime found in this category.",
  onThumbLoaded,
  filterSlot,
  onReorder,
  dragDisabled = false,
  onEdit,
  readOnly = false,
}: {
  animes: Anime[] | "loading" | "error";
  categoryId: number | null;
  emptyMessage?: string;
  onThumbLoaded: (animeId: number | string, thumbUrl: string) => void;
  filterSlot?: React.ReactNode;
  onReorder?: (ordered: Anime[]) => void;
  dragDisabled?: boolean;
  onEdit?: (a: Anime) => void;
  readOnly?: boolean;
}) {
  const colSpan = readOnly ? 6 : 7;
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
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
        <table className="anime_table" id="anime_table">
          <thead>
            <tr style={{ position: "relative" }}>
              <th className="col_id">#</th>
              <th className="col_thumb">Thumbnail</th>
              <th className="col_name">Name</th>
              <th className="col_season">Season</th>
              <th className="col_lang">Language</th>
              <th className="col_stars">Stars</th>
              <th className="col_edit"></th>
              <th
                className="col_filter_anchor"
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  padding: 0,
                  border: "none",
                  width: "auto",
                }}
              >
                {filterSlot}
              </th>
            </tr>
          </thead>
          <tbody id="anime_table_body">
            {animes === "loading" ? (
              <SkeletonRows rows={4} />
            ) : animes === "error" ? (
              <tr>
                <td colSpan={COL_SPAN} className="empty_msg">
                  Failed to load anime.
                </td>
              </tr>
            ) : animes.length === 0 ? (
              <tr>
                <td colSpan={COL_SPAN} className="empty_msg">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              animes.map((a, idx) => (
                <SortableRow
                  key={a.id}
                  a={a}
                  idx={idx}
                  categoryId={categoryId}
                  onThumbLoaded={onThumbLoaded}
                  dragDisabled={disabled}
                  onEdit={onEdit}
                />
              ))
            )}
          </tbody>
        </table>
      </SortableContext>
    </DndContext>
  );
}
