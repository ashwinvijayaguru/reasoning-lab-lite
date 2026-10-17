"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from "@/components/ui/alert-dialog";

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? "Something went wrong. Please try again.");
  return data;
}

export function StartChallenge({ slug, hasSession }: { slug: string; hasSession: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noticeId = useId();

  async function start() {
    setBusy(true);
    setError(null);
    try {
      if (!hasSession) await postJson("/api/session", { accept_notice: true });
      const { attempt_id } = await postJson("/api/attempts", { family_slug: slug });
      router.push(`/attempts/${attempt_id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div>
      <Button size="lg" onClick={() => (hasSession ? start() : setOpen(true))} disabled={busy}>
        {busy ? <Loader2 className="motion-safe:animate-spin" aria-hidden /> : null}
        {busy ? "Starting…" : "Start this challenge"}
        {!busy && <ArrowRight aria-hidden />}
      </Button>
      {error && !open && (
        <p role="alert" className="mt-3 text-sm text-bad">
          {error}
        </p>
      )}

      <AlertDialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <AlertDialogContent aria-describedby="notice-desc">
          <AlertDialogTitle>Start as a guest</AlertDialogTitle>
          <AlertDialogDescription id="notice-desc">
            You’ll get a random guest ID — no name, email, school, or birth date. Your answers are stored in this app only, to show your results, and you can delete them
            any time.
          </AlertDialogDescription>
          <div className="flex gap-3 rounded-xl border border-line bg-canvas p-4">
            <input id={noticeId} type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1 size-5 shrink-0 accent-[var(--color-human)]" />
            <Label htmlFor={noticeId}>
              I’ve read{" "}
              <Link href="/privacy" target="_blank" className="font-semibold text-ink underline underline-offset-2">
                how my data is used
              </Link>
            </Label>
          </div>
          {error && (
            <p role="alert" className="text-sm text-bad">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button onClick={start} disabled={!accepted || busy}>
              {busy && <Loader2 className="motion-safe:animate-spin" aria-hidden />}
              Start
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
