export interface RangeSpan {
  start: number;
  end: number;
}

export interface CollapseRangeOptions {
  /** Total number of items in the list */
  totalCount?: number;
  /** Height of the scrollbar track in pixels */
  trackHeightPx?: number;
  /** Height of the scrollbar thumb in pixels (for travel range compensation) */
  thumbHeightPx?: number;
  /** Minimum visual height of a marker in pixels (default: 2) */
  minMarkerPx?: number;
}

/**
 * Estimates the native scrollbar thumb height in pixels.
 * Returns 0 when content fits without scrolling.
 */
export function computeThumbHeight(
  clientHeight: number,
  scrollHeight: number,
  trackHeight: number,
  minThumbPx = 30,
): number {
  if (scrollHeight <= clientHeight || clientHeight <= 0 || trackHeight <= 0) {
    return 0;
  }
  const raw = (clientHeight / scrollHeight) * trackHeight;
  return Math.min(trackHeight, Math.max(minThumbPx, raw));
}

/**
 * Groups sorted numerical indices into contiguous range spans.
 * When `totalCount` and `trackHeightPx` are provided, indices whose visual
 * markers would overlap or touch within `minMarkerPx` on screen are also merged
 * into a single band, accounting for scrollbar thumb travel range.
 */
export function collapseToRanges(
  indices: number[],
  options?: CollapseRangeOptions,
): RangeSpan[] {
  if (!indices.length) return [];

  const totalCount = options?.totalCount ?? 0;
  const trackHeightPx = options?.trackHeightPx ?? 0;
  const thumbHeightPx = options?.thumbHeightPx ?? 0;
  const minMarkerPx = options?.minMarkerPx ?? 2;

  const travelPx = Math.max(0, trackHeightPx - thumbHeightPx);
  const useVisualMerge = totalCount > 0 && travelPx > 0;
  const pxPerItem = useVisualMerge ? travelPx / totalCount : 0;
  const offsetPx = thumbHeightPx / 2;

  const ranges: RangeSpan[] = [];
  let curStart = indices[0];
  let curEnd = indices[0];

  for (let i = 1; i < indices.length; i++) {
    const idx = indices[i];
    let shouldMerge = idx === curEnd + 1;

    if (!shouldMerge && useVisualMerge) {
      const curStartPx = offsetPx + curStart * pxPerItem;
      const curEndPx = offsetPx + (curEnd + 1) * pxPerItem;
      const curVisualBottomPx = Math.max(curStartPx + minMarkerPx, curEndPx);
      const nextTopPx = offsetPx + idx * pxPerItem;

      if (nextTopPx <= curVisualBottomPx) {
        shouldMerge = true;
      }
    }

    if (shouldMerge) {
      curEnd = idx;
    } else {
      ranges.push({ start: curStart, end: curEnd });
      curStart = idx;
      curEnd = idx;
    }
  }
  ranges.push({ start: curStart, end: curEnd });
  return ranges;
}

/**
 * Computes percentage top & height for a single index or range span,
 * compensating for scrollbar thumb height so markers align with the thumb center.
 */
export function getMarkerBoundsPercent(
  startIndex: number,
  endIndex: number,
  totalCount: number,
  trackHeightPx = 0,
  thumbHeightPx = 0,
): { topPercent: number; heightPercent: number } {
  if (totalCount <= 0) return { topPercent: 0, heightPercent: 0 };

  if (trackHeightPx > 0 && thumbHeightPx > 0 && thumbHeightPx < trackHeightPx) {
    const travel = trackHeightPx - thumbHeightPx;
    const offset = thumbHeightPx / 2;
    const startPx = offset + (startIndex / totalCount) * travel;
    const endPx = offset + ((endIndex + 1) / totalCount) * travel;
    return {
      topPercent: (startPx / trackHeightPx) * 100,
      heightPercent: Math.max(0, ((endPx - startPx) / trackHeightPx) * 100),
    };
  }

  const topPercent = (startIndex / totalCount) * 100;
  const heightPercent = ((endIndex - startIndex + 1) / totalCount) * 100;
  return { topPercent, heightPercent };
}
