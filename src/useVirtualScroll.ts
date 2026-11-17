import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';

export type UseVirtualScrollOptions<T> = {
  items: T[];
  getItemKey: (item: T, index: number) => string;
  estimateHeight?: number;
  overscan?: number;
  enabled?: boolean;
};

export type VirtualScrollResult = {
  scrollerRef: React.RefObject<HTMLDivElement | null>;
  startIndex: number;
  endIndex: number;
  offsetTop: number;
  offsetBottom: number;
  totalHeight: number;
  positions: Float64Array;
  isVirtual: boolean;
  measureElement: (node: HTMLElement | null) => void;
  scrollToIndex: (index: number, align?: 'start' | 'center' | 'end' | 'auto') => void;
  scrollToKey: (key: string, align?: 'start' | 'center' | 'end' | 'auto') => void;
};

export function binarySearchFirst(positions: Float64Array, targetScrollTop: number, count: number): number {
  if (count <= 0) return 0;
  let low = 0;
  let high = count - 1;
  let result = 0;
  while (low <= high) {
    const mid = (low + high) >> 1;
    // positions[mid + 1] is the bottom edge of item mid
    if (positions[mid + 1] > targetScrollTop) {
      result = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }
  return result;
}

export function binarySearchLast(positions: Float64Array, targetBottom: number, count: number): number {
  if (count <= 0) return 0;
  let low = 0;
  let high = count - 1;
  let result = count - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    // positions[mid] is the top edge of item mid
    if (positions[mid] < targetBottom) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return result;
}

export function useVirtualScroll<T>({
  items,
  getItemKey,
  estimateHeight = 74,
  overscan = 25,
  enabled = true,
}: UseVirtualScrollOptions<T>): VirtualScrollResult {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(800);
  const [version, setVersion] = useState(0);

  const heightsRef = useRef<Map<string, number>>(new Map());
  const observerRef = useRef<ResizeObserver | null>(null);
  const rafMeasureId = useRef<number | null>(null);

  // Measure callback for ResizeObserver
  const handleResize = useCallback((entries: ResizeObserverEntry[]) => {
    let changed = false;
    for (const entry of entries) {
      const key = entry.target.getAttribute('data-message-id');
      if (!key) continue;
      const height = Math.round(
        entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height,
      );
      if (height > 0 && heightsRef.current.get(key) !== height) {
        heightsRef.current.set(key, height);
        changed = true;
      }
    }
    if (changed) {
      if (rafMeasureId.current === null) {
        rafMeasureId.current = requestAnimationFrame(() => {
          rafMeasureId.current = null;
          setVersion((v) => v + 1);
        });
      }
    }
  }, []);

  // Initialize ResizeObserver
  useEffect(() => {
    if (!enabled) return;
    const observer = new ResizeObserver(handleResize);
    observerRef.current = observer;
    return () => {
      observer.disconnect();
      observerRef.current = null;
      if (rafMeasureId.current !== null) {
        cancelAnimationFrame(rafMeasureId.current);
        rafMeasureId.current = null;
      }
    };
  }, [enabled, handleResize]);

  // Connect scroller scroll & size listener
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !enabled) return;

    let rafScrollId: number | null = null;
    const onScroll = () => {
      if (rafScrollId !== null) return;
      rafScrollId = requestAnimationFrame(() => {
        rafScrollId = null;
        if (scrollerRef.current) {
          setScrollTop(scrollerRef.current.scrollTop);
        }
      });
    };

    const scrollerObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === scroller) {
          setViewportHeight(entry.contentRect.height);
        }
      }
    });

    scroller.addEventListener('scroll', onScroll, { passive: true });
    scrollerObserver.observe(scroller);

    setScrollTop(scroller.scrollTop);
    setViewportHeight(scroller.clientHeight || 800);

    return () => {
      scroller.removeEventListener('scroll', onScroll);
      scrollerObserver.disconnect();
      if (rafScrollId !== null) cancelAnimationFrame(rafScrollId);
    };
  }, [enabled]);

  // Ref callback passed to each rendered item
  const measureElement = useCallback(
    (node: HTMLElement | null) => {
      if (!node || !enabled) return;
      const key = node.getAttribute('data-message-id');
      if (!key) return;

      const height = Math.round(node.getBoundingClientRect().height);
      if (height > 0 && heightsRef.current.get(key) !== height) {
        heightsRef.current.set(key, height);
        if (rafMeasureId.current === null) {
          rafMeasureId.current = requestAnimationFrame(() => {
            rafMeasureId.current = null;
            setVersion((v) => v + 1);
          });
        }
      }

      if (observerRef.current) {
        observerRef.current.observe(node);
      }
    },
    [enabled],
  );

  // Compute prefix sums
  const { positions, totalHeight } = useMemo(() => {
    const count = items.length;
    const pos = new Float64Array(count + 1);
    let sum = 0;
    const map = heightsRef.current;
    for (let i = 0; i < count; i++) {
      pos[i] = sum;
      const key = getItemKey(items[i], i);
      const h = map.get(key) ?? estimateHeight;
      sum += h;
    }
    pos[count] = sum;
    return { positions: pos, totalHeight: sum };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, getItemKey, estimateHeight, version]);

  // Range calculation
  const count = items.length;
  let startIndex = 0;
  let endIndex = count - 1;
  let offsetTop = 0;
  let offsetBottom = 0;

  if (enabled && count > 0) {
    const firstVisible = binarySearchFirst(positions, scrollTop, count);
    const lastVisible = binarySearchLast(positions, scrollTop + viewportHeight, count);

    startIndex = Math.max(0, firstVisible - overscan);
    endIndex = Math.min(count - 1, lastVisible + overscan);

    offsetTop = positions[startIndex] ?? 0;
    offsetBottom = Math.max(0, totalHeight - (positions[endIndex + 1] ?? totalHeight));
  } else if (!enabled) {
    startIndex = 0;
    endIndex = count - 1;
    offsetTop = 0;
    offsetBottom = 0;
  }

  const scrollToIndex = useCallback(
    (index: number, align: 'start' | 'center' | 'end' | 'auto' = 'auto') => {
      const scroller = scrollerRef.current;
      if (!scroller || index < 0 || index >= items.length) return;
      const itemTop = positions[index] ?? 0;
      const itemHeight = (positions[index + 1] ?? (itemTop + estimateHeight)) - itemTop;
      const clientH = scroller.clientHeight || 800;
      const currentScroll = scroller.scrollTop;

      let targetScroll = currentScroll;
      if (align === 'start') {
        targetScroll = itemTop;
      } else if (align === 'end') {
        targetScroll = itemTop + itemHeight - clientH;
      } else if (align === 'center') {
        targetScroll = itemTop - (clientH - itemHeight) / 2;
      } else {
        if (itemTop < currentScroll) {
          targetScroll = itemTop;
        } else if (itemTop + itemHeight > currentScroll + clientH) {
          targetScroll = itemTop + itemHeight - clientH;
        }
      }

      scroller.scrollTop = Math.max(0, targetScroll);
      setScrollTop(scroller.scrollTop);
    },
    [items.length, positions, estimateHeight],
  );

  const scrollToKey = useCallback(
    (key: string, align: 'start' | 'center' | 'end' | 'auto' = 'auto') => {
      const idx = items.findIndex((item, i) => getItemKey(item, i) === key);
      if (idx >= 0) scrollToIndex(idx, align);
    },
    [items, getItemKey, scrollToIndex],
  );

  return {
    scrollerRef,
    startIndex,
    endIndex,
    offsetTop,
    offsetBottom,
    totalHeight,
    positions,
    isVirtual: enabled,
    measureElement,
    scrollToIndex,
    scrollToKey,
  };
}
