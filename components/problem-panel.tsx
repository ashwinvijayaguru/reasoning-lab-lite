import { Clock } from "lucide-react";
import type { PublicProblem } from "@/lib/problems/types";
import { Badge } from "@/components/ui/badge";
import { CategoryIcon } from "@/components/category-icon";

const CATEGORY_LABEL: Record<string, string> = { logic: "Logic", debugging: "Debugging", community: "Community planning" };

export function ProblemPanel({ problem, compact = false }: { problem: PublicProblem; compact?: boolean }) {
  const p = problem.public_payload;
  return (
    <article aria-labelledby="problem-title" className="space-y-5">
      <header className="flex items-start gap-3">
        <CategoryIcon category={problem.category} />
        <div>
          <p className="text-xs font-bold text-ink-muted">{CATEGORY_LABEL[problem.category] ?? problem.category}</p>
          <h1 id="problem-title" className={compact ? "text-xl font-semibold text-ink" : "text-2xl font-semibold text-ink sm:text-3xl"}>
            {problem.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{problem.difficulty === "easy" ? "Easy" : "Moderate"}</Badge>
            <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
              <Clock aria-hidden className="size-3.5" /> about {problem.est_minutes} min
            </span>
          </div>
        </div>
      </header>

      <p className="text-[16px] leading-relaxed text-ink">{p.statement}</p>

      {p.facts.length > 0 && (
        <section aria-labelledby="facts-h">
          <h2 id="facts-h" className="mb-2 font-sans text-sm font-bold text-ink-muted">Facts</h2>
          <ul className="list-disc space-y-1 pl-5 text-[15px] text-ink-soft">
            {p.facts.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </section>
      )}

      {p.fact_table && (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[520px] border-collapse text-left text-sm">
            <caption className="bg-canvas-deep px-3 py-2 text-left text-xs font-bold text-ink-muted">{p.fact_table.caption}</caption>
            <thead>
              <tr className="border-b border-line bg-paper">
                {p.fact_table.columns.map((c) => (
                  <th key={c} scope="col" className="px-3 py-2 font-semibold text-ink">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {p.fact_table.rows.map((row, i) => (
                <tr key={i} className="border-b border-line last:border-0 odd:bg-paper even:bg-canvas/60">
                  {row.map((cell, j) =>
                    j === 0 ? (
                      <th key={j} scope="row" className="px-3 py-2 font-semibold text-ink">
                        {cell}
                      </th>
                    ) : (
                      <td key={j} className="px-3 py-2 text-ink-soft">
                        {cell}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {p.code && (
        <figure>
          <figcaption className="mb-2 text-xs font-bold text-ink-muted">Code ({p.code.language})</figcaption>
          <pre className="overflow-x-auto rounded-xl border border-line bg-[#14213a] p-4 text-[13.5px] leading-6 text-[#e9edf5]" tabIndex={0} aria-label="Code listing with line numbers">
            <code>
              {p.code.lines.map((line, i) => (
                <span key={i} className="block">
                  <span aria-hidden className="mr-4 inline-block w-6 select-none text-right text-[#8b96ad]">
                    {i + 1}
                  </span>
                  <span className="sr-only">Line {i + 1}: </span>
                  {line || " "}
                </span>
              ))}
            </code>
          </pre>
        </figure>
      )}

      <section aria-labelledby="rules-h">
        <h2 id="rules-h" className="mb-2 font-sans text-sm font-bold text-ink-muted">Requirements</h2>
        <ul className="space-y-2">
          {p.constraints.map((c) => (
            <li key={c.id} className="flex gap-3 rounded-xl border border-line bg-paper px-3.5 py-2.5 text-[15px] text-ink">
              <span className="mt-0.5 shrink-0 rounded-md bg-canvas-deep px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink-soft">{c.id}</span>
              <span>{c.text}</span>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
