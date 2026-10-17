import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Reasoning Lab — Think first. Compare second.", template: "%s · Reasoning Lab" },
  description: "Solve a short problem, explain your approach, then compare it with a reference explanation — with quotes, not scores.",
  robots: { index: false },
};

export const viewport: Viewport = { themeColor: "#edf2f6", width: "device-width", initialScale: 1 };

const NAV = [
  { href: "/challenges", label: "Challenges" },
  { href: "/activity", label: "My activity" },
  { href: "/privacy", label: "Privacy" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col">
        <a href="#main" className="sr-only z-50 rounded-md bg-ink px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
          Skip to content
        </a>
        <header className="border-b border-line bg-paper">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-center gap-2.5 rounded-md font-display text-xl font-bold tracking-tight text-ink [font-stretch:85%]">
              <LogoMark />
              Reasoning Lab
            </Link>
            <nav aria-label="Main" className="-mx-2 flex flex-wrap items-center">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="rounded-md px-3 py-2 text-sm font-bold text-ink-soft hover:bg-canvas hover:text-ink">
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main id="main" className="flex-1">
          {children}
        </main>
        <footer className="border-t border-line bg-paper">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-[13px] text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p>A student project. Comparisons describe written explanations, not intelligence.</p>
            <p>
              <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">How your data is used</Link>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}

/** Two highlighter strokes on a page: yours (yellow) and the reference's (pink). */
function LogoMark() {
  return (
    <svg aria-hidden viewBox="0 0 32 32" className="size-8 shrink-0">
      <rect x="1" y="1" width="30" height="30" rx="6" fill="#17223b" />
      <path d="M7 12.5 L24.5 10.5 L25 15 L7.5 17 Z" fill="#ffee6e" />
      <path d="M7.5 19 L25 17.5 L25.5 22 L8 23.5 Z" fill="#ffb8dc" />
    </svg>
  );
}
