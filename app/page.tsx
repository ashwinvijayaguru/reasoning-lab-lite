import Link from "next/link";
import { BookOpen, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CategoryIcon } from "@/components/category-icon";
import { CATEGORIES } from "@/lib/problems/categories";

const STEPS = [
  { title: "Think first", body: "Solve a short problem and write how you approached it — bullet points are fine." },
  { title: "Lock it in", body: "Your first response is saved permanently before anything is revealed, so it stays your own." },
  { title: "Compare second", body: "See a rule-based answer check and a reference explanation side by side, with exact quotes showing what each one stated." },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="grid gap-10 py-14 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <h1 className="text-5xl text-ink sm:text-5xl">
            Think first.
            <br />
            Compare second.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">
            Work through a logic puzzle, a bug, or a community planning decision. Then see what your explanation and a reference explanation each
            noticed, and what each one left unstated.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" variant="human">
              <Link href="/challenges">
                Try a challenge
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/privacy">How your data is used</Link>
            </Button>
          </div>
        </div>

        <figure aria-label="Example comparison, illustrative only" className="relative rounded-2xl border border-line bg-paper p-5 shadow-[0_2px_0_var(--color-line),6px_8px_0_-1px_var(--color-canvas-deep)] sm:rotate-[0.6deg] sm:p-7">
          <figcaption className="mb-5 flex items-center justify-between gap-3 border-b border-dashed border-line-strong pb-3 text-sm font-bold text-ink-muted">
            <span>Example result</span>
            <Badge variant="neutral">Illustrative only</Badge>
          </figcaption>
          <div className="space-y-5 text-[17px] leading-8">
            <div>
              <p className="mb-1 inline-flex items-center gap-1.5 text-sm font-bold text-human-ink"><User aria-hidden className="size-4" /> You wrote</p>
              <p className="text-ink">
                “Two guests use wheelchairs, so{" "}
                <mark className="hl-human motion-safe:animate-[swipe_700ms_200ms_ease-out_both]">I ruled out the hall with front steps</mark>.”
              </p>
            </div>
            <div>
              <p className="mb-1 inline-flex items-center gap-1.5 text-sm font-bold text-ai-ink"><BookOpen aria-hidden className="size-4" /> Reference explanation</p>
              <p className="text-ink">
                “Summit Arts Loft is{" "}
                <mark className="hl-ai motion-safe:animate-[swipe_700ms_900ms_ease-out_both]">the cheapest remaining option</mark> and only a 2-minute walk from transit.”
              </p>
            </div>
            <p className="border-t border-line pt-4 text-[15px] leading-relaxed text-ink-soft">
              Your plan kept the step-free entrance requirement. The reference explanation chose a venue that breaks it, and did not state the requirement.
            </p>
          </div>
        </figure>
      </section>

      <section aria-labelledby="how" className="border-t border-line py-14">
        <h2 id="how" className="text-2xl font-semibold text-ink sm:text-3xl">How it works</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-4 rounded-2xl border border-line bg-paper p-5 shadow-[0_2px_0_var(--color-line)]">
              <span aria-hidden className="font-display text-5xl font-bold leading-none text-line-strong [font-stretch:80%]">{i + 1}</span>
              <div>
                <h3 className="text-xl text-ink">{s.title}</h3>
                <p className="mt-1 text-[15px] text-ink-soft">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="cats" className="border-t border-line py-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="cats" className="text-2xl font-semibold text-ink sm:text-3xl">Challenge categories</h2>
          <Link href="/challenges" className="text-sm font-semibold text-ink underline underline-offset-4 hover:text-human-ink">
            Browse all challenges
          </Link>
        </div>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((c) => (
            <li key={c.id} className={`flex gap-4 rounded-2xl border border-line p-5 shadow-[0_2px_0_var(--color-line)] ${c.status === "available" ? "bg-paper" : "bg-canvas-deep/60"}`}>
              <CategoryIcon category={c.id} />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-sans text-base font-bold text-ink">{c.label}</h3>
                  {c.status === "coming_soon" && <Badge>Coming soon</Badge>}
                </div>
                <p className="mt-1 text-sm text-ink-soft">{c.blurb}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="data" className="border-t border-line py-14">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <h2 id="data" className="text-2xl font-semibold text-ink sm:text-3xl">What happens to your answers</h2>
          <ul className="space-y-3 text-[15px] text-ink-soft">
            <li><strong className="text-ink">No account details.</strong> You get a random guest ID. We never ask for your name, school, email, or birth date.</li>
            <li><strong className="text-ink">Nothing leaves this app.</strong> Your answers are stored only in this app’s database to show your results. They are not sent to any AI service or third party.</li>
            <li><strong className="text-ink">You stay in control.</strong> Delete everything linked to your guest ID at any time from My activity.</li>
            <li><strong className="text-ink">Nothing is ranked.</strong> There is no intelligence score. Results describe what was written, not what anyone thought.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
