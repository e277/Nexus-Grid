"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "nexus_grid_theme";

/**
 * Dark/light switch.
 *
 * Dark is the product's mode and the stylesheet's bare `:root`, so an element
 * with no `data-theme` is dark — the system preference is deliberately not
 * consulted. The stored choice is applied before paint by an inline script in
 * the layout, so this only reads back what is already on the element; starting
 * from `null` keeps the server and client markup identical until after mount.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme((document.documentElement.dataset.theme as Theme | undefined) ?? "dark");
  }, []);

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing: the toggle still works for this session.
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-ng-border bg-ng-surface text-ng-secondary transition-colors hover:bg-ng-bg hover:text-ng-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent"
    >
      {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
    </button>
  );
}
