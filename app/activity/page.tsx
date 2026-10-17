import type { Metadata } from "next";
import Link from "next/link";
import { currentParticipantId } from "@/lib/auth/session";
import { getActivity } from "@/lib/privacy/service";
import { ActivityPanel } from "@/components/activity-panel";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "My activity" };
export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const participant = await currentParticipantId();
  if (!participant) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-semibold text-ink">My activity</h1>
        <div className="mt-8 rounded-2xl border border-dashed border-line-strong bg-paper p-8 text-center">
          <p className="font-semibold text-ink">You haven’t started a session on this device.</p>
          <p className="mt-2 text-sm text-ink-soft">Start any challenge to get a guest ID. Your attempts and privacy choices will appear here.</p>
          <Button asChild className="mt-5"><Link href="/challenges">Browse challenges</Link></Button>
        </div>
      </div>
    );
  }
  const activity = await getActivity(participant);
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-semibold text-ink sm:text-4xl">My activity</h1>
      <p className="mt-2 text-ink-soft">
        Guest ID <span className="font-mono text-sm text-ink">{activity.pseudonym}</span> · started {new Date(activity.created_at).toLocaleDateString()}
      </p>
      <ActivityPanel activity={JSON.parse(JSON.stringify(activity))} />
    </div>
  );
}
