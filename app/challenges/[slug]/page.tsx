import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock } from "lucide-react";
import { familyBySlug } from "@/lib/problems/catalog";
import { currentParticipantId } from "@/lib/auth/session";
import { categoryById } from "@/lib/problems/categories";
import { CategoryIcon } from "@/components/category-icon";
import { Badge } from "@/components/ui/badge";
import { StartChallenge } from "@/components/start-challenge";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const fam = await familyBySlug(slug).catch(() => null);
  return { title: fam?.title ?? "Challenge" };
}

export default async function ChallengePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const card = await familyBySlug(slug);
  if (!card) notFound();
  const hasSession = !!(await currentParticipantId());
  const cat = categoryById(card.category);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <Link href="/challenges" className="inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-ink-soft hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" /> All challenges
      </Link>
      <div className="mt-6 flex items-start gap-4">
        <CategoryIcon category={card.category} className="size-12" />
        <div>
          <p className="text-xs font-bold text-ink-muted">{cat?.label}</p>
          <h1 className="text-3xl font-semibold text-ink sm:text-4xl">{card.title}</h1>
        </div>
      </div>
      <p className="mt-5 text-lg text-ink-soft">{card.summary}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge variant="outline">{card.difficulty === "easy" ? "Easy" : "Moderate"}</Badge>
        <span className="inline-flex items-center gap-1 text-sm text-ink-muted">
          <Clock aria-hidden className="size-4" /> about {card.est_minutes} minutes
        </span>
      </div>

      <div className="mt-8 rounded-2xl border border-line bg-paper p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-ink">Before you start</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[15px] text-ink-soft">
          <li>You’ll choose an answer and briefly explain your approach. Bullet points are fine.</li>
          <li>Your draft is saved on this device until you submit.</li>
          <li>Submitting locks your first response. You can add a separate revision afterwards, but the original never changes.</li>
          <li>Try it on your own first — no searching or AI tools — so the comparison tells you something.</li>
          {card.variants > 1 && <li>There are two versions of this task; one is chosen for you at random.</li>}
        </ul>
        <div className="mt-6">
          <StartChallenge slug={card.slug} hasSession={hasSession} />
        </div>
      </div>
    </div>
  );
}
