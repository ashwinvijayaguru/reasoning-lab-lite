"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Clock, SearchX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CategoryIcon } from "@/components/category-icon";
import { cn } from "@/lib/utils";

interface Family {
  family_id: string;
  slug: string;
  title: string;
  summary: string;
  category: string;
  difficulty: "easy" | "moderate";
  est_minutes: number;
}
interface Category {
  id: string;
  label: string;
  blurb: string;
  status: "available" | "coming_soon";
  plannedNotes?: string;
}

function FilterChip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus",
        pressed ? "border-ink bg-ink text-canvas" : "border-line-strong bg-paper text-ink-soft hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

export function ChallengeLibrary({ families, categories }: { families: Family[]; categories: Category[] }) {
  const [category, setCategory] = useState<string>("all");
  const [difficulty, setDifficulty] = useState<string>("all");

  const selectedCat = categories.find((c) => c.id === category);
  const visible = useMemo(
    () => families.filter((f) => (category === "all" || f.category === category) && (difficulty === "all" || f.difficulty === difficulty)),
    [families, category, difficulty],
  );
  const comingSoon = categories.filter((c) => c.status === "coming_soon" && (category === "all" || category === c.id));

  return (
    <div className="mt-8">
      <div className="flex flex-col gap-4 rounded-2xl border border-line bg-paper p-4 sm:p-5">
        <fieldset className="min-w-0">
          <legend className="mb-2 text-xs font-bold text-ink-muted">Category</legend>
          <div className="flex flex-wrap gap-2">
            <FilterChip pressed={category === "all"} onClick={() => setCategory("all")}>All</FilterChip>
            {categories.map((c) => (
              <FilterChip key={c.id} pressed={category === c.id} onClick={() => setCategory(c.id)}>
                {c.label}
                {c.status === "coming_soon" && <span className="sr-only"> (coming soon)</span>}
              </FilterChip>
            ))}
          </div>
        </fieldset>
        <fieldset className="min-w-0">
          <legend className="mb-2 text-xs font-bold text-ink-muted">Difficulty</legend>
          <div className="flex flex-wrap gap-2">
            {[
              ["all", "Any"],
              ["easy", "Easy"],
              ["moderate", "Moderate"],
            ].map(([v, l]) => (
              <FilterChip key={v} pressed={difficulty === v} onClick={() => setDifficulty(v)}>{l}</FilterChip>
            ))}
          </div>
        </fieldset>
      </div>

      <p role="status" className="mt-6 text-sm text-ink-muted">
        {visible.length} {visible.length === 1 ? "challenge" : "challenges"} available
      </p>

      {visible.length > 0 && (
        <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((f) => (
            <li key={f.family_id}>
              <Link
                href={`/challenges/${f.slug}`}
                className="group flex h-full flex-col rounded-2xl border border-line bg-paper p-5 transition-shadow hover:shadow-[0_10px_30px_-20px_rgba(19,35,63,0.45)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus"
              >
                <div className="flex items-start gap-3">
                  <CategoryIcon category={f.category} />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-ink-muted">{categories.find((c) => c.id === f.category)?.label}</p>
                    <h2 className="mt-0.5 font-sans text-[17px] font-bold leading-snug text-ink">{f.title}</h2>
                  </div>
                </div>
                <p className="mt-3 flex-1 text-[15px] text-ink-soft">{f.summary}</p>
                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{f.difficulty === "easy" ? "Easy" : "Moderate"}</Badge>
                    <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
                      <Clock aria-hidden className="size-3.5" /> about {f.est_minutes} min
                    </span>
                  </div>
                  <ArrowRight aria-hidden className="size-4 text-ink-muted transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {visible.length === 0 && selectedCat?.status !== "coming_soon" && (
        <div className="mt-3 flex flex-col items-center rounded-2xl border border-dashed border-line-strong bg-paper px-6 py-12 text-center">
          <SearchX aria-hidden className="size-8 text-ink-muted" />
          <p className="mt-3 font-semibold text-ink">No challenges match these filters.</p>
          <p className="mt-1 text-sm text-ink-soft">Try a different difficulty or category.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => { setCategory("all"); setDifficulty("all"); }}>
            Clear filters
          </Button>
        </div>
      )}

      {comingSoon.length > 0 && (
        <section aria-labelledby="soon" className="mt-10">
          <h2 id="soon" className="text-xl font-semibold text-ink">Coming soon</h2>
          <p className="mt-1 text-sm text-ink-soft">These categories are planned but not open yet — they need their own answer checkers before anyone can try them.</p>
          <ul className="mt-4 grid gap-4 sm:grid-cols-3">
            {comingSoon.map((c) => (
              <li key={c.id} className="flex gap-3 rounded-2xl border border-line bg-canvas-deep/60 p-5">
                <CategoryIcon category={c.id} />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-sans text-base font-bold text-ink">{c.label}</h3>
                    <Badge>Coming soon</Badge>
                  </div>
                  <p className="mt-1 text-sm text-ink-soft">{c.blurb}</p>
                  {c.plannedNotes && <p className="mt-2 text-xs text-ink-muted">{c.plannedNotes}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
