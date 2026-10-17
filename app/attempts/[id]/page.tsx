import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { currentParticipantId } from "@/lib/auth/session";
import { getResult, getWorkspace } from "@/lib/attempts/service";
import { isAppError } from "@/lib/errors";
import { SolveWorkspace } from "@/components/solve-workspace";
import { ResultsView } from "@/components/results-view";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Challenge" };

/**
 * One URL for the whole attempt: the solve workspace while DRAFT, the results once
 * locked. Rendered per request for the signed-in owner only (never cached).
 */
export default async function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const participant = await currentParticipantId();
  if (!participant) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
        <h1 className="text-2xl font-semibold text-ink">This attempt isn’t available here</h1>
        <p className="mt-3 text-ink-soft">Attempts belong to the guest session that started them. If you cleared your cookies or deleted your data, the attempt can’t be opened.</p>
        <Button asChild className="mt-6"><Link href="/challenges">Browse challenges</Link></Button>
      </div>
    );
  }
  let ws;
  try {
    ws = await getWorkspace(participant, id);
  } catch (e) {
    if (isAppError(e) && e.status === 404) notFound();
    throw e;
  }
  if (ws.attempt.state === "DRAFT") {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <SolveWorkspace attemptId={ws.attempt.id} problem={ws.problem} exposure={ws.attempt.exposure} />
      </div>
    );
  }
  const result = await getResult(participant, id);
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <ResultsView initial={JSON.parse(JSON.stringify(result))} />
    </div>
  );
}
