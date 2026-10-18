"use client";
/**
 * Light/dark switch in the header. The choice is remembered in this browser only;
 * until someone picks, the app follows the device's own light/dark setting.
 * The inline script in app/layout.tsx applies the saved choice before the page
 * paints, so there's no flash of the wrong theme.
 */
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export const THEME_KEY = "reasoning-lab-theme";
type Theme = "light" | "dark";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* storage unavailable: the switch still works for this visit */
    }
    setTheme(next);
  }

  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      aria-label="Dark mode"
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="ml-1 inline-flex size-10 items-center justify-center rounded-md text-ink-soft hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus"
    >
      {dark ? <Sun aria-hidden className="size-5" /> : <Moon aria-hidden className="size-5" />}
    </button>
  );
}
