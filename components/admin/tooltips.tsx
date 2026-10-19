"use client";

import { useEffect, useRef } from "react";

// One floating tooltip for the whole panel. Any element with a `data-tip`
// attribute gets it on hover — which keeps the charts themselves as plain
// server-rendered HTML with no client state of their own.
export function Tooltips() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tip = ref.current!;
    let current: Element | null = null;

    function move(event: PointerEvent) {
      const target = (event.target as Element | null)?.closest?.("[data-tip]") ?? null;
      if (target !== current) {
        current = target;
        if (!target) {
          tip.hidden = true;
          return;
        }
        tip.textContent = target.getAttribute("data-tip");
        tip.hidden = false;
      }
      if (!current) return;
      const pad = 14;
      const { offsetWidth: w, offsetHeight: h } = tip;
      let x = event.clientX + pad;
      let y = event.clientY - h - pad;
      if (x + w > window.innerWidth - 8) x = event.clientX - w - pad;
      if (y < 8) y = event.clientY + pad;
      tip.style.left = `${Math.max(8, x)}px`;
      tip.style.top = `${y}px`;
    }

    function hide() {
      current = null;
      tip.hidden = true;
    }

    document.addEventListener("pointermove", move);
    document.addEventListener("scroll", hide, true);
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("scroll", hide, true);
    };
  }, []);

  return <div ref={ref} className="ad-tip" role="tooltip" hidden />;
}
