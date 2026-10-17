"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, CircleDashed, CircleHelp, Loader2, XCircle } from "lucide-react";
import type { ActivityView } from "@/lib/privacy/service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

const STATE_TEXT: Record<string, string> = {
  DRAFT: "Draft (not submitted)",
  SUBMITTED: "Submitted",
  EVALUATING: "Comparing…",
  READY: "Result ready",
  EVALUATION_FAILED: "Comparison pending",
};

function Outcome({ status, who }: { status: string | null; who: string }) {
  if (!status) return <span className="inline-flex items-center gap-1 text-ink-muted"><CircleDashed aria-hidden className="size-4" /> {who}: —</span>;
  if (status === "correct") return <span className="inline-flex items-center gap-1 text-ok"><CheckCircle2 aria-hidden className="size-4" /> {who}: meets requirements</span>;
  if (status === "incorrect") return <span className="inline-flex items-center gap-1 text-bad"><XCircle aria-hidden className="size-4" /> {who}: breaks a requirement</span>;
  return <span className="inline-flex items-center gap-1 text-warn"><CircleHelp aria-hidden className="size-4" /> {who}: unverified</span>;
}

export function ActivityPanel({ activity }: { activity: ActivityView }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function call(url: string, init: RequestInit, label: string) {
    setBusy(label);
    setMsg(null);
    try {
      const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error?.message ?? "That didn’t work. Please try again.");
      return true;
    } catch (e) {
      setMsg((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function del() {
    if (await call("/api/privacy/data", { method: "DELETE" }, "delete")) {
      try {
        for (const k of Object.keys(window.localStorage)) if (k.startsWith("rl-")) window.localStorage.removeItem(k);
      } catch {
        /* storage unavailable */
      }
      router.push("/?deleted=1");
      router.refresh();
    }
  }

  return (
    <div className="mt-8 space-y-8">
      <p role="status" aria-live="polite" className={msg ? "rounded-xl border border-line bg-paper px-4 py-3 text-sm text-ink" : "sr-only"}>
        {msg}
      </p>

      <section aria-labelledby="attempts-h">
        <h2 id="attempts-h" className="text-xl font-semibold text-ink">Your attempts</h2>
        {activity.attempts.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-line-strong bg-paper p-6 text-center text-ink-soft">
            No attempts yet. <Link href="/challenges" className="font-semibold text-ink underline underline-offset-2">Pick a challenge</Link>.
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {activity.attempts.map((a) => (
              <li key={a.id}>
                <Link href={`/attempts/${a.id}`} className="block rounded-2xl border border-line bg-paper p-4 hover:shadow-[0_8px_24px_-18px_rgba(19,35,63,0.5)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-ink">{a.title}</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={a.state === "READY" ? "ok" : a.state === "DRAFT" ? "neutral" : "warn"}>{STATE_TEXT[a.state] ?? a.state}</Badge>
                      {a.exposure !== "first_exposure" && <Badge>Practice repeat</Badge>}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                    <Outcome status={a.human_status} who="You" />
                    <Outcome status={a.reference_status} who="Reference" />
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">Started {new Date(a.started_at).toLocaleString()}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="privacy-h" className="space-y-4">
        <h2 id="privacy-h" className="text-xl font-semibold text-ink">Your data</h2>
        <div className="grid gap-4">
          <div className="rounded-2xl border border-bad/25 bg-paper p-5">
            <h3 className="font-sans text-base font-bold text-ink">Delete all my data</h3>
            <p className="mt-1 text-sm text-ink-soft">Permanently deletes your attempts, responses, revisions and feedback, and ends this guest session.</p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="mt-4" variant="danger" disabled={busy !== null}>Delete everything</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogTitle>Delete all your data?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes everything linked to guest ID {activity.pseudonym}. It can’t be undone. Database backups expire on their own schedule (see the privacy page).
                </AlertDialogDescription>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep my data</AlertDialogCancel>
                  <Button variant="danger" onClick={del} disabled={busy !== null}>
                    {busy === "delete" && <Loader2 aria-hidden className="motion-safe:animate-spin" />} Delete permanently
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </section>
    </div>
  );
}
