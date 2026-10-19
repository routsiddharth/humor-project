"use client";

import { useEffect } from "react";

const STORAGE_KEY = "site-theme";
const LIGHT_BACKGROUND = "#ffffff";
const DARK_BACKGROUND = "#0a0a0a";

type Theme = "light" | "dark";

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void> };
};

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? DARK_BACKGROUND : LIGHT_BACKGROUND);
}

export function ThemeToggle() {
  useEffect(() => {
    const preference = window.matchMedia("(prefers-color-scheme: dark)");
    const followSystem = () => {
      if (!storedTheme()) applyTheme(systemTheme());
    };

    preference.addEventListener("change", followSystem);
    return () => preference.removeEventListener("change", followSystem);
  }, []);

  function toggleTheme(event: React.MouseEvent<HTMLButtonElement>) {
    const root = document.documentElement;
    const next: Theme = root.dataset.theme === "dark" ? "light" : "dark";

    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // A private browsing policy may block storage; the theme still changes.
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const transitionDocument = document as ViewTransitionDocument;

    if (reduceMotion || !transitionDocument.startViewTransition) {
      applyTheme(next);
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const x = bounds.left + bounds.width / 2;
    const y = bounds.top + bounds.height / 2;
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );

    const transition = transitionDocument.startViewTransition(() => applyTheme(next));
    transition.ready.then(() => {
      root.animate(
        {
          clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`],
        },
        {
          duration: 650,
          easing: "cubic-bezier(0.2, 0.7, 0.2, 1)",
          pseudoElement: "::view-transition-new(root)",
        },
      );
    }).catch(() => {
      // The theme has already been applied if a transition is interrupted.
    });
  }

  return (
    <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label="Toggle color theme">
      <svg className="theme-toggle__sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.5v2.4M12 19.1v2.4M4.4 4.4l1.7 1.7M17.9 17.9l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.4 19.6l1.7-1.7M17.9 6.1l1.7-1.7" />
      </svg>
      <svg className="theme-toggle__moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11Z" />
      </svg>
    </button>
  );
}
