// kalma/frontend/components/shared/MasonryColumns.tsx
//
// True masonry without the CSS pitfalls. `column-count` masonry overflowed and
// overlapped variable-height cards; a row-based CSS grid never overlaps but
// leaves big vertical holes when cards in a row differ a lot in height (the
// /profile complaint). This distributes children into independent flex columns
// — each column flows top-to-bottom on its own, so cards can't overlap and one
// tall card doesn't push a hole under its short neighbour.
//
// Children are distributed shortest-column-first by measured height so the
// columns stay balanced; falls back to round-robin before measurement.

'use client';

import {
  Children,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

const useIso = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export default function MasonryColumns({
  children,
  gap = 14,
  breakpoints = { 1024: 3, 760: 2 },
}: {
  children: ReactNode;
  gap?: number;
  /** min-width (px) → column count, largest first is auto-sorted. Default 1. */
  breakpoints?: Record<number, number>;
}) {
  const items = Children.toArray(children).filter(isValidElement);
  const [columns, setColumns] = useState(1);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const [order, setOrder] = useState<number[][]>([]);

  useEffect(() => {
    const points = Object.entries(breakpoints)
      .map(([w, c]) => [Number(w), c] as const)
      .sort((a, b) => b[0] - a[0]);
    function update() {
      const w = window.innerWidth;
      const hit = points.find(([min]) => w >= min);
      setColumns(hit ? hit[1] : 1);
    }
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [breakpoints]);

  // Measure each item once rendered and pack shortest-column-first.
  useIso(() => {
    if (columns <= 1) {
      setOrder([items.map((_, i) => i)]);
      return;
    }
    const heights = refs.current.map((el) => el?.offsetHeight ?? 0);
    const colHeights = new Array(columns).fill(0);
    const cols: number[][] = Array.from({ length: columns }, () => []);
    // Round-robin until measured (all zero), else shortest-first.
    const measured = heights.some((h) => h > 0);
    items.forEach((_, i) => {
      let target = i % columns;
      if (measured) {
        target = colHeights.indexOf(Math.min(...colHeights));
      }
      cols[target].push(i);
      colHeights[target] += (heights[i] || 1) + gap;
    });
    setOrder(cols);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, items.length]);

  const layout = order.length === columns && order.length > 0
    ? order
    : Array.from({ length: columns }, (_, c) =>
        items.map((_, i) => i).filter((i) => i % columns === c),
      );

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap }}>
      {layout.map((colIdxs, c) => (
        <div key={c} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap }}>
          {colIdxs.map((i) => (
            <div
              key={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              className="k-masonry-item"
              style={{ minWidth: 0 }}
            >
              {items[i]}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
