import { useEffect, useMemo, useRef, useState } from 'react';
import type { Block, Scene } from './core';
import {
  collapseToRanges,
  computeThumbHeight,
  getMarkerBoundsPercent,
  type RangeSpan,
} from './scrollbarOverview';

export type { RangeSpan };

const MIN_MARKER_PX = 2;

export interface TimelineScrollbarOverlayProps {
  /** The current visible/paged list of blocks */
  items: Block[];
  /** Reference to the scrollable container to read clientHeight & scrollHeight */
  scrollerRef?: React.RefObject<HTMLDivElement | null>;
  /** Scenes registered in the project */
  scenes?: Scene[];
  /** Set of currently selected block IDs */
  selectedIds?: Set<string>;
  /** Search predicate function when query is active */
  searchMatchPredicate?: ((b: Block) => boolean) | null;
  /** Whether search filter is currently applied (ON) */
  searchFilterActive?: boolean;
  /** Current search query string */
  query?: string;
}

export function TimelineScrollbarOverlay({
  items,
  scrollerRef,
  scenes,
  selectedIds,
  searchMatchPredicate,
  searchFilterActive = false,
  query = '',
}: TimelineScrollbarOverlayProps) {
  const total = items.length;
  const trackRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ trackHeight: 600, thumbHeight: 0 });

  useEffect(() => {
    const trackEl = trackRef.current;
    if (!trackEl) return;

    const measure = () => {
      const th = trackEl.clientHeight;
      if (th <= 0) return;
      const scrollerEl = scrollerRef?.current;
      const nextThumb = scrollerEl
        ? computeThumbHeight(scrollerEl.clientHeight, scrollerEl.scrollHeight, th)
        : 0;
      setLayout((prev) =>
        prev.trackHeight === th && Math.abs(prev.thumbHeight - nextThumb) < 1
          ? prev
          : { trackHeight: th, thumbHeight: nextThumb },
      );
    };

    // Measure after DOM settles for current item count
    const rafId = requestAnimationFrame(measure);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(trackEl);
    }
    return () => {
      cancelAnimationFrame(rafId);
      ro?.disconnect();
    };
  }, [total, scrollerRef]);

  const { trackHeight, thumbHeight } = layout;

  // 1. Search Match Ranges: visible when query is present and filter is OFF
  const searchRanges = useMemo(() => {
    if (searchFilterActive || !query.trim() || !searchMatchPredicate || total === 0) {
      return [];
    }
    const matched: number[] = [];
    for (let i = 0; i < total; i++) {
      if (searchMatchPredicate(items[i])) {
        matched.push(i);
      }
    }
    return collapseToRanges(matched, {
      totalCount: total,
      trackHeightPx: trackHeight,
      thumbHeightPx: thumbHeight,
      minMarkerPx: MIN_MARKER_PX,
    });
  }, [
    items,
    searchMatchPredicate,
    searchFilterActive,
    query,
    total,
    trackHeight,
    thumbHeight,
  ]);

  // 2. Selected Message Ranges: visible when 1 or more messages are selected
  const selectedRanges = useMemo(() => {
    if (!selectedIds || selectedIds.size === 0 || total === 0) {
      return [];
    }
    const selectedIndices: number[] = [];
    for (let i = 0; i < total; i++) {
      if (selectedIds.has(items[i].id)) {
        selectedIndices.push(i);
      }
    }
    return collapseToRanges(selectedIndices, {
      totalCount: total,
      trackHeightPx: trackHeight,
      thumbHeightPx: thumbHeight,
      minMarkerPx: MIN_MARKER_PX,
    });
  }, [items, selectedIds, total, trackHeight, thumbHeight]);

  // 3. Scene Markers: yellow ticks at scene message positions
  const sceneMarkers = useMemo(() => {
    if (!scenes?.length || total === 0) {
      return [];
    }
    const idToIndex = new Map<string, number>();
    for (let i = 0; i < total; i++) {
      idToIndex.set(items[i].id, i);
    }
    const markers: { index: number; sceneId: string; name: string }[] = [];
    for (const s of scenes) {
      const idx = idToIndex.get(s.messageId);
      if (idx !== undefined) {
        markers.push({ index: idx, sceneId: s.id, name: s.name });
      }
    }
    return markers;
  }, [items, scenes, total]);

  if (total === 0) return null;

  return (
    <div ref={trackRef} className="scrollbar-marker-track" aria-hidden="true">
      {/* 1. Search Matches: Green translucent bands */}
      {searchRanges.map((r, i) => {
        const { topPercent, heightPercent } = getMarkerBoundsPercent(
          r.start,
          r.end,
          total,
          trackHeight,
          thumbHeight,
        );
        return (
          <div
            key={`search-${r.start}-${r.end}-${i}`}
            className="scrollbar-marker marker-search"
            style={{
              top: `${topPercent}%`,
              height: `max(${MIN_MARKER_PX}px, ${heightPercent}%)`,
            }}
          />
        );
      })}

      {/* 2. Selected Messages: Blue translucent bands */}
      {selectedRanges.map((r, i) => {
        const { topPercent, heightPercent } = getMarkerBoundsPercent(
          r.start,
          r.end,
          total,
          trackHeight,
          thumbHeight,
        );
        return (
          <div
            key={`sel-${r.start}-${r.end}-${i}`}
            className="scrollbar-marker marker-selected"
            style={{
              top: `${topPercent}%`,
              height: `max(${MIN_MARKER_PX}px, ${heightPercent}%)`,
            }}
          />
        );
      })}

      {/* 3. Scene Bookmarks: Yellow prominent ticks */}
      {sceneMarkers.map((m) => {
        const { topPercent } = getMarkerBoundsPercent(
          m.index,
          m.index,
          total,
          trackHeight,
          thumbHeight,
        );
        return (
          <div
            key={`scene-${m.sceneId}`}
            className="scrollbar-marker marker-scene"
            style={{
              top: `${topPercent}%`,
            }}
            title={m.name}
          />
        );
      })}
    </div>
  );
}
