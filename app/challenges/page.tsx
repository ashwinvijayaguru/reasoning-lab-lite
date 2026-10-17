import type { Metadata } from "next";
import { listFamilies } from "@/lib/problems/catalog";
import { CATEGORIES } from "@/lib/problems/categories";
import { ChallengeLibrary } from "@/components/challenge-library";

export const metadata: Metadata = { title: "Challenges" };
export const dynamic = "force-dynamic";

export default async function ChallengesPage() {
  let families: Awaited<ReturnType<typeof listFamilies>> = [];
  let loadError = false;
  try {
    families = await listFamilies();
  } catch {
    loadError = true;
  }
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-semibold text-ink sm:text-4xl">Challenges</h1>
      <p className="mt-3 max-w-2xl text-ink-soft">
        Each challenge takes about few minutes only. You’ll answer and explain first; the comparison appears only after your response is locked.
      </p>
      {loadError ? (
        <div role="alert" className="mt-8 rounded-2xl border border-bad/30 bg-bad-soft p-5 text-bad">
          Challenges couldn’t be loaded right now. Please refresh in a moment.
        </div>
      ) : (
        <ChallengeLibrary families={families} categories={CATEGORIES.map(({ id, label, blurb, status, plannedNotes }) => ({ id, label, blurb, status, plannedNotes }))} />
      )}
    </div>
  );
}
