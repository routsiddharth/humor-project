"use client";

import { Children, useLayoutEffect, useRef, useState, type ReactNode } from "react";

// Matches the old grid's minmax(17.5rem, 1fr) and its 1rem gap, so the column
// count at any width is the same one the grid would have picked.
const MIN_COLUMN_REM = 17.5;
const GAP_REM = 1;

// A grid lines cards up in rows, so a short card sits above a hole the height
// of its tallest neighbour. Here each column is its own stack and a card sits
// directly under the one above it.
//
// Cards are dealt left to right (i % n) rather than poured down a column, as
// CSS `columns` would: the list arrives sorted by rating, and the top of the
// page should read #1, #2, #3 across, not #1, #2, #3 down the first column.
export function Masonry({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // null until measured. The server cannot know the width, so it renders the
  // plain grid; the layout effect swaps in the columns before the first paint
  // after hydration.
  const [columns, setColumns] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const fit = Math.floor((el.clientWidth + GAP_REM * rem) / ((MIN_COLUMN_REM + GAP_REM) * rem));
      setColumns(Math.max(1, fit));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const items = Children.toArray(children);

  if (columns === null) {
    return (
      <div ref={ref}>
        <ul className="grid">{items}</ul>
      </div>
    );
  }

  const stacks: ReactNode[][] = Array.from({ length: columns }, () => []);
  items.forEach((item, i) => stacks[i % columns].push(item));

  return (
    <div ref={ref} className="masonry">
      {stacks.map((stack, i) => (
        <ul key={i} className="masonry__column">
          {stack}
        </ul>
      ))}
    </div>
  );
}
