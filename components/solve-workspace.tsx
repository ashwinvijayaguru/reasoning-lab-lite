"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CloudOff, Loader2, Lock, Save, Trash2 } from "lucide-react";
import type { PublicProblem } from "@/lib/problems/types";
import { ProblemPanel } from "@/components/problem-panel";
import { AnswerInput, answerComplete, emptyAnswer, type AnswerValue } from "@/components/answer-input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface Draft {
  answer: AnswerValue;
  main: string;
  alternatives: string;
  assumptions: string;
  confidence: number | null;
  savedAt: string;
}

const LIMITS = { main: 4000, alternatives: 3000, assumptions: 3000 };

/* localStorage can be unavailable (private mode, blocked storage) — never let that break solving. */
function load<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function save(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
function remove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function newKey() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function SolveWorkspace({ attemptId, problem, exposure }: { attemptId: string; problem: PublicProblem; exposure: string }) {
  const router = useRouter();
  const format = problem.public_payload.answer_format;
  const draftKey = `rl-draft:${attemptId}`;
  const idemKey = `rl-idem:${attemptId}`;

  const [answer, setAnswer] = useState<AnswerValue>(() => emptyAnswer(format));
  const [main, setMain] = useState("");
  const [alternatives, setAlternatives] = useState("");
  const [assumptions, setAssumptions] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [draftStatus, setDraftStatus] = useState<"idle" | "saved" | "unavailable" | "restored">("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("problem");
  const hydrated = useRef(false);
  // Once a submit starts, autosave must never write the draft back after it was cleared.
  const submittingRef = useRef(false);
  const ids = { main: useId(), alt: useId(), ass: useId(), conf: useId() };

  // Restore a local draft once.
  useEffect(() => {
    const d = load<Draft>(draftKey);
    if (d) {
      setAnswer(d.answer ?? emptyAnswer(format));
      setMain(d.main ?? "");
      setAlternatives(d.alternatives ?? "");
      setAssumptions(d.assumptions ?? "");
      setConfidence(d.confidence ?? null);
      setSavedAt(d.savedAt);
      setDraftStatus("restored");
    }
    hydrated.current = true;
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [draftKey, format]);

  // Autosave (debounced) to this device only.
  useEffect(() => {
    if (!hydrated.current || submittingRef.current) return;
    const t = setTimeout(() => {
      if (submittingRef.current) return;
      const at = new Date().toISOString();
      const ok = save(draftKey, { answer, main, alternatives, assumptions, confidence, savedAt: at } satisfies Draft);
      setDraftStatus(ok ? "saved" : "unavailable");
      if (ok) setSavedAt(at);
    }, 600);
    return () => clearTimeout(t);
  }, [answer, main, alternatives, assumptions, confidence, draftKey]);

  const clearDraft = useCallback(() => {
    remove(draftKey);
    setAnswer(emptyAnswer(format));
    setMain("");
    setAlternatives("");
    setAssumptions("");
    setConfidence(null);
    setSavedAt(null);
    setDraftStatus("idle");
  }, [draftKey, format]);

  const complete = answerComplete(format, answer);
  const ready = complete && main.trim().length >= 3;

  async function submit() {
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    // Reuse the same idempotency key until the server confirms, so a retry after a
    // dropped connection can never create a second submission.
    let key = load<string>(idemKey);
    if (!key) {
      key = newKey();
      save(idemKey, key);
    }
    try {
      const res = await fetch(`/api/attempts/${attemptId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ final_answer: answer, main_approach: main, alternatives: alternatives || null, assumptions: assumptions || null, confidence, idempotency_key: key }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok || res.status === 409) {
        remove(draftKey);
        remove(idemKey);
        setConfirmOpen(false);
        router.refresh();
        return;
      }
      setError(data?.error?.message ?? "Your response wasn’t submitted. Your draft is still saved here.");
    } catch {
      setError("You appear to be offline. Nothing was submitted; your draft is still saved on this device.");
    }
    submittingRef.current = false;
    setSubmitting(false);
    setConfirmOpen(false);
  }

  const savedLabel =
    draftStatus === "unavailable"
      ? "This browser isn’t letting us save a draft. Keep this tab open until you submit."
      : savedAt
        ? `${draftStatus === "restored" ? "Draft restored" : "Draft saved on this device"} · ${new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
        : "Your draft saves automatically on this device.";

  const form = (
    <form
      aria-labelledby="response-h"
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && online) setConfirmOpen(true);
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="response-h" className="text-xl font-semibold text-ink">
          Your response
        </h2>
        <p role="status" aria-live="polite" className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
          <Save aria-hidden className="size-3.5" /> {savedLabel}
        </p>
      </div>

      {exposure !== "first_exposure" && (
        <p className="rounded-xl border border-line bg-canvas-deep px-3.5 py-2.5 text-sm text-ink-soft">
          You’ve tried this challenge before. That’s fine for practice; repeat attempts aren’t counted as first-try results.
        </p>
      )}

      <section className="rounded-2xl border border-line bg-paper p-4 sm:p-5">
        <h3 className="mb-3 font-sans text-sm font-bold text-human-ink">1 · Final answer</h3>
        <AnswerInput format={format} value={answer} onChange={setAnswer} disabled={submitting} />
      </section>

      <section className="space-y-5 rounded-2xl border border-line bg-paper p-4 sm:p-5">
        <h3 className="font-sans text-sm font-bold text-human-ink">2 · Explain your thinking</h3>
        <p className="text-sm text-ink-soft">Short bullet points are fine. Optional boxes left blank are recorded as “not reported” — that’s not counted against you.</p>

        <div className="space-y-1.5">
          <Label htmlFor={ids.main}>Main approach <span className="font-normal text-ink-muted">(required)</span></Label>
          <p id={`${ids.main}-hint`} className="text-sm text-ink-muted">{problem.public_payload.explanation_prompt}</p>
          <Textarea id={ids.main} aria-describedby={`${ids.main}-hint ${ids.main}-count`} value={main} maxLength={LIMITS.main} onChange={(e) => setMain(e.target.value)} rows={5} required disabled={submitting} />
          <p id={`${ids.main}-count`} className="text-right text-xs text-ink-muted">{main.length}/{LIMITS.main}</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={ids.alt}>Other options you considered <span className="font-normal text-ink-muted">(optional)</span></Label>
          <p id={`${ids.alt}-hint`} className="text-sm text-ink-muted">One per line. What else could have worked, or what did you rule out?</p>
          <Textarea id={ids.alt} aria-describedby={`${ids.alt}-hint`} value={alternatives} maxLength={LIMITS.alternatives} onChange={(e) => setAlternatives(e.target.value)} rows={3} disabled={submitting} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={ids.ass}>Assumptions or requirements you noticed <span className="font-normal text-ink-muted">(optional)</span></Label>
          <Textarea id={ids.ass} value={assumptions} maxLength={LIMITS.assumptions} onChange={(e) => setAssumptions(e.target.value)} rows={3} disabled={submitting} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label id={ids.conf}>How confident are you? <span className="font-normal text-ink-muted">(optional)</span></Label>
            <span className="text-sm font-semibold text-ink" aria-hidden>
              {confidence === null ? "Not reported" : `${confidence}%`}
            </span>
          </div>
          <Slider
            aria-labelledby={ids.conf}
            thumbLabel="Confidence"
            valueText={confidence === null ? "Not reported" : `${confidence} percent`}
            min={0}
            max={100}
            step={5}
            value={[confidence ?? 50]}
            onValueChange={(v) => setConfidence(v[0])}
            disabled={submitting}
            className={confidence === null ? "opacity-60" : ""}
          />
          <div className="flex justify-between text-xs text-ink-muted">
            <span>Guessing</span>
            {confidence !== null ? (
              <button type="button" className="rounded underline underline-offset-2 hover:text-ink" onClick={() => setConfidence(null)}>
                Clear confidence
              </button>
            ) : (
              <span>Move the slider to report</span>
            )}
            <span>Certain</span>
          </div>
        </div>
      </section>

      {!online && (
        <p role="alert" className="flex items-center gap-2 rounded-xl border border-warn/30 bg-warn-soft px-3.5 py-2.5 text-sm text-warn">
          <CloudOff aria-hidden className="size-4" /> You’re offline. Your draft is saved on this device; submit when you’re back online.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl border border-bad/30 bg-bad-soft px-3.5 py-2.5 text-sm text-bad">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="ghost" size="sm" onClick={clearDraft} disabled={submitting}>
          <Trash2 aria-hidden /> Clear draft
        </Button>
        <div className="flex flex-col items-stretch gap-1 sm:items-end">
          <Button type="submit" variant="human" size="lg" disabled={!ready || !online || submitting}>
            <Lock aria-hidden /> Submit first response
          </Button>
          {!ready && <p className="text-xs text-ink-muted">Choose an answer and describe your main approach to submit.</p>}
        </div>
      </div>
    </form>
  );

  return (
    <>
      {/* Desktop: side-by-side. Mobile: tabs. Both panels stay mounted so nothing is lost when switching. */}
      <Tabs value={tab} onValueChange={setTab} className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8">
        <TabsList className="sticky top-2 z-10 mb-5 lg:hidden" aria-label="Workspace panels">
          <TabsTrigger value="problem">Problem</TabsTrigger>
          <TabsTrigger value="response">Your response</TabsTrigger>
        </TabsList>
        <TabsContent value="problem" forceMount className="data-[state=inactive]:hidden lg:!block lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:pr-2">
          <ProblemPanel problem={problem} />
          <div className="mt-6 lg:hidden">
            <Button variant="outline" className="w-full" onClick={() => setTab("response")}>
              Write your response
            </Button>
          </div>
        </TabsContent>
        <TabsContent value="response" forceMount className="data-[state=inactive]:hidden lg:!block">
          {form}
        </TabsContent>
      </Tabs>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !submitting && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogTitle>Lock in your first response?</AlertDialogTitle>
          <AlertDialogDescription>
            Your answer and explanation will be saved permanently as your first response. After that you’ll see the answer check and the AI explanation. You can add a
            separate revision later, but this first response won’t change.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Keep editing</AlertDialogCancel>
            <Button variant="human" onClick={submit} disabled={submitting}>
              {submitting ? <Loader2 aria-hidden className="motion-safe:animate-spin" /> : <Lock aria-hidden />}
              {submitting ? "Saving…" : "Submit and lock"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
