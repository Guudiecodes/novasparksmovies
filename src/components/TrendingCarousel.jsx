// TrendingCarousel.jsx — rebuilt as Netflix/Prime horizontal drag row
// Interface unchanged: same props as before, drop-in replacement
import { useRef, useCallback, memo, useMemo } from "react";
import { imgUrl, isAnimeContent } from "../utils/api";
import { StarIcon, PlayIcon } from "./Icons";

const Card = memo(function Card({ item, onSelect, ageRating, restricted, isAnime }) {
  const title  = item.title || item.name || "";
  const year   = (item.release_date || item.first_air_date || "").slice(0, 4);
  const poster = item.poster_path ? imgUrl(item.poster_path, "w342") : null;
  const score  = item.vote_average > 0 ? item.vote_average.toFixed(1) : null;
  const type   = item.media_type === "tv" ? "SERIES" : isAnime ? "ANIME" : "FILM";

  const isUnreleased = useMemo(() => {
    if (!item.release_date && !item.first_air_date) return false;
    const today = new Date(); today.setHours(0,0,0,0);
    return new Date(item.release_date || item.first_air_date) > today;
  }, [item.release_date, item.first_air_date]);

  return (
    <div className="ns-row-card" onClick={() => !restricted && !isUnreleased && onSelect(item)}>
      <div className="ns-row-card-poster">
        {poster
          ? <img src={poster} alt={title} loading="lazy" draggable={false} />
          : <div className="ns-row-card-noposter"><PlayIcon /></div>
        }
        <div className="ns-row-card-overlay">
          <div className="ns-row-card-play"><PlayIcon /></div>
        </div>
        {score && <div className="ns-row-card-score"><StarIcon size={9} />{score}</div>}
        {isAnime && <div className="ns-row-card-badge ns-badge-anime">ANIME</div>}
        {restricted && <div className="ns-row-card-restricted">🔒</div>}
        {isUnreleased && <div className="ns-row-card-restricted">🔒<span>Soon</span></div>}
        {ageRating && (
          <div className={`ns-row-card-badge ns-badge-rating${restricted?" ns-badge-restricted":""}`}>
            {ageRating}
          </div>
        )}
      </div>
      <div className="ns-row-card-info">
        <div className="ns-row-card-title">{title}</div>
        <div className="ns-row-card-meta">
          {year && <span>{year}</span>}
          <span className="ns-row-card-type">{type}</span>
        </div>
      </div>
    </div>
  );
});

export default function TrendingCarousel({ items, onSelect, title, titleHighlight, ratingsMap = {} }) {
  const rowRef  = useRef(null);
  const dragRef = useRef({ down: false, sx: 0, sl: 0, moved: false });

  // ── Drag-to-scroll ────────────────────────────────────────────────────────
  const onMouseDown = useCallback((e) => {
    const el = rowRef.current; if (!el) return;
    dragRef.current = { down: true, sx: e.pageX - el.offsetLeft, sl: el.scrollLeft, moved: false };
    el.style.cursor = "grabbing"; el.style.userSelect = "none";
  }, []);

  const onMouseMove = useCallback((e) => {
    const d = dragRef.current; if (!d.down) return;
    const el = rowRef.current; if (!el) return;
    const dx = e.pageX - el.offsetLeft - d.sx;
    if (Math.abs(dx) > 4) d.moved = true;
    el.scrollLeft = d.sl - dx;
  }, []);

  const onMouseUp = useCallback(() => {
    const el = rowRef.current; if (!el) return;
    dragRef.current.down = false;
    el.style.cursor = "grab"; el.style.userSelect = "";
  }, []);

  const onClick = useCallback((e) => {
    if (dragRef.current.moved) { e.stopPropagation(); dragRef.current.moved = false; }
  }, []);

  if (!items || items.length === 0) return null;

  return (
    <div className="ns-row-section">
      <div className="ns-row-title">
        {titleHighlight
          ? <>{title}&nbsp;<span style={{ color: "var(--red)" }}>{titleHighlight}</span></>
          : title
        }
      </div>
      <div
        className="ns-row"
        ref={rowRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onClick={onClick}
      >
        {items.map((item) => {
          const type      = item.media_type === "tv" ? "tv" : "movie";
          const ratingKey = `${type}_${item.id}`;
          const rd        = ratingsMap[ratingKey] || {};
          return (
            <Card
              key={`${type}_${item.id}`}
              item={item}
              onSelect={onSelect}
              ageRating={rd.cert}
              restricted={!!rd.restricted}
              isAnime={isAnimeContent(item)}
            />
          );
        })}
      </div>
    </div>
  );
}