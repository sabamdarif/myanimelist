"use client";

// Port of home.js card renderers + skeletons. Same markup/classes.

import {
  type JikanAnime,
  calculateAiredEpisodes,
  jikanImage,
  jikanTitle,
  parseDuration,
  parseRating,
} from "@/lib/jikan";

export type CardHandlers = {
  onEnter: (item: JikanAnime, el: HTMLElement) => void;
  onLeave: () => void;
  onClick: (item: JikanAnime, el: HTMLElement, e: React.MouseEvent) => void;
};

export function GridSkeleton({ count = 18 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="anime_card">
          <div className="card_cover_wrapper skel"></div>
          <div className="card_info">
            <div className="skel skel_text"></div>
            <div className="skel skel_text_sm" style={{ marginTop: 4 }}></div>
          </div>
        </div>
      ))}
    </>
  );
}

export function TrendingSkeleton() {
  return (
    <>
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="trending_card">
          <div className="trending_content">
            <div className="skel skel_text" style={{ marginBottom: 6 }}></div>
            <div className="skel skel_text_sm"></div>
          </div>
        </div>
      ))}
    </>
  );
}

export function AnimeCard({
  item,
  handlers,
}: {
  item: JikanAnime;
  handlers: CardHandlers;
}) {
  const score = item.score ? item.score.toFixed(1) : "";
  const rating = parseRating(item.rating);
  return (
    <div
      className="anime_card"
      data-id={item.mal_id}
      onMouseEnter={(e) => handlers.onEnter(item, e.currentTarget)}
      onMouseLeave={handlers.onLeave}
      onClick={(e) => handlers.onClick(item, e.currentTarget, e)}
    >
      <div
        className="card_cover_wrapper"
        style={{ backgroundImage: `url('${jikanImage(item)}')` }}
      >
        <div className="card_overlay_top">
          {score && (
            <span className="card_badge card_badge_star">
              <i className="nf nf-fa-star"></i> {score}
            </span>
          )}
          {rating && <span className="card_badge">{rating}</span>}
        </div>
        <div className="card_stats_bar">
          <div className="stat_item">
            <i className="nf nf-md-subtitles"></i> {calculateAiredEpisodes(item)}
          </div>
        </div>
      </div>
      <div className="card_info">
        <div className="card_title">{jikanTitle(item)}</div>
        <div className="card_meta">
          {item.type} · {parseDuration(item.duration)}
        </div>
      </div>
    </div>
  );
}

export function TrendingCard({
  item,
  rank,
  handlers,
}: {
  item: JikanAnime;
  rank: number;
  handlers: CardHandlers;
}) {
  return (
    <div
      className="trending_card"
      data-id={item.mal_id}
      onMouseEnter={(e) => handlers.onEnter(item, e.currentTarget)}
      onMouseLeave={handlers.onLeave}
      onClick={(e) => handlers.onClick(item, e.currentTarget, e)}
    >
      <div
        className="trending_bg_bleed"
        style={{ backgroundImage: `url('${jikanImage(item)}')` }}
      ></div>
      <div className="trending_rank">{rank}</div>
      <div className="trending_content">
        <div className="trending_title">{jikanTitle(item)}</div>
        <div className="trending_meta">
          <span className="stat_item">
            <i className="nf nf-fa-star" style={{ color: "var(--star)" }}></i>{" "}
            {item.score ? item.score.toFixed(1) : "?"}
          </span>
          <span>·</span>
          <span>{item.type}</span>
          <span>·</span>
          <span className="stat_item">
            <i className="nf nf-md-subtitles"></i> {calculateAiredEpisodes(item)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function TrendingList({
  items,
  handlers,
}: {
  items: JikanAnime[] | null;
  handlers: CardHandlers;
}) {
  if (items === null) return <TrendingSkeleton />;
  if (items.length === 0) return <div className="empty_msg">Failed to load data.</div>;
  return (
    <>
      {items.map((item, i) => (
        <TrendingCard key={item.mal_id} item={item} rank={i + 1} handlers={handlers} />
      ))}
    </>
  );
}
