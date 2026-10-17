"use client";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, BookOpen, CheckCircle2, CircleDashed, CircleHelp, Flag, Info, Loader2, Lock, MinusCircle, RefreshCw, ShieldCheck, User, XCircle } from "lucide-react";
import type { ResultView } from "@/lib/attempts/service";
import type { Finding } from "@/lib/evaluation/evidence";
import type { AnswerFormat } from "@/lib/problems/types";
import type { ValidationResult } from "@/lib/evaluation/validate";
import { describeAnswer } from "@/lib/evaluation/explanation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AnswerInput, answerComplete, emptyAnswer, type AnswerValue } from "@/components/answer-input";
import { cn } from "@/lib/utils";

type Status = "explicit" | "contradicted" | "not_stated" | "unclear";
const STATUS_TEXT: Record<Status, string> = { explicit: "Stated", contradicted: "Contradicted", not_stated: "Not stated", unclear: "Unclear" };
const DIMENSION_TEXT: Record<string, string> = { constraints: "Requirements", alternatives: "Other options", assumptions: "Assumptions", edge_cases: "Edge cases", trade_offs: "Trade-offs" };

function StatusPill({ status }: { status: Status }) {
  const map = {
    explicit: { icon: CheckCircle2, cls: "text-ok" },
    contradicted: { icon: XCircle, cls: "text-bad" },
    not_stated: { icon: MinusCircle, cls: "text-ink-muted" },
    unclear: { icon: CircleHelp, cls: "text-warn" },
  }[status];
  const Icon = map.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm font-semibold", map.cls)}>
      <Icon aria-hidden className="size-4" /> {STATUS_TEXT[status]}
    </span>
  );
}

function PassPill({ passed }: { passed: boolean | null }) {
  if (passed === null) return <span className="inline-flex items-center gap-1 text-sm text-ink-muted"><CircleHelp aria-hidden className="size-4" /> Not checked</span>;
  return passed ? (
    <span className="inline-flex items-center gap-1 text-sm font-semibold text-ok"><CheckCircle2 aria-hidden className="size-4" /> Meets it</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-sm font-semibold text-bad"><XCircle aria-hidden className="size-4" /> Breaks it</span>
  );
}

function SideLabel({ side }: { side: "human" | "reference" }) {
  return side === "human" ? (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-human-ink"><User aria-hidden className="size-3.5" /> You</span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-ai-ink"><BookOpen aria-hidden className="size-3.5" /> Reference explanation</span>
  );
}

function verdict(v: ValidationResult) {
  if (v.status === "correct") return { text: v.engine === "answer_key" ? "Matches a reviewed answer" : "Meets every requirement", icon: CheckCircle2, cls: "text-ok" };
  if (v.status === "incorrect") return { text: v.engine === "answer_key" ? "Doesn’t match a reviewed answer" : "Breaks at least one requirement", icon: XCircle, cls: "text-bad" };
  return { text: "Couldn’t be checked automatically", icon: CircleHelp, cls: "text-warn" };
}

/** Render text with verified excerpts highlighted by their server-computed offsets. */
function Highlighted({ text, findings, side, activeId }: { text: string; findings: Finding[]; side: "human" | "reference"; activeId: string | null }) {
  const ranges = findings
    .filter((f) => f.side === side && f.character_offsets)
    .map((f) => ({ start: f.character_offsets![0], end: f.character_offsets![1], id: f.id }))
    .sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let pos = 0;
  for (const r of ranges) {
    if (r.start < pos) continue; // skip overlaps; the first highlight wins
    if (r.start > pos) parts.push(text.slice(pos, r.start));
    parts.push(
      <mark
        key={r.id}
        id={`ev-${r.id}`}
        tabIndex={-1}
        className={cn(
          "rounded-sm",
          side === "human" ? "hl-human" : "hl-ai",
          activeId === r.id && "outline-[3px] outline-offset-2 outline-focus",
        )}
      >
        {text.slice(r.start, r.end)}
      </mark>,
    );
    pos = r.end;
  }
  parts.push(text.slice(pos));
  return <div className="whitespace-pre-wrap break-words text-[15px] leading-7 text-ink">{parts}</div>;
}

export function ResultsView({ initial }: { initial: ResultView }) {
  const [view, setView] = useState(initial);
  const [checking, setChecking] = useState(false);
  const [activeFinding, setActiveFinding] = useState<string | null>(null);
  const format = view.problem.public_payload.answer_format as AnswerFormat;
  const constraints = view.problem.public_payload.constraints;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/attempts/${view.attempt.id}/result`, { cache: "no-store" });
      if (res.ok) setView(await res.json());
    } catch {
      /* offline: keep showing what we have */
    }
  }, [view.attempt.id]);

  // The comparison is normally ready immediately. If not (rare), asking for the result again re-runs it.
  async function checkAgain() {
    setChecking(true);
    await refresh();
    setChecking(false);
  }

  const checks = useMemo(() => {
    const hc = new Map(view.answer_check?.human.checks.map((c) => [c.constraint_id, c.passed]) ?? []);
    const ac = new Map(view.answer_check?.reference.checks.map((c) => [c.constraint_id, c.passed]) ?? []);
    return { hc, ac };
  }, [view.answer_check]);

  const comp = view.comparison;
  const matrix = comp?.constraint_matrix ?? [];
  const humanOnly = matrix.filter((m) => m.human.status === "explicit" && m.reference.status !== "explicit");
  const aiOnly = matrix.filter((m) => m.reference.status === "explicit" && m.human.status !== "explicit");
  const ctext = (id: string) => constraints.find((c) => c.id === id)?.text ?? id;
  const validatorContrasts = constraints.filter((c) => checks.hc.get(c.id) === true && checks.ac.get(c.id) === false);
  const validatorContrastsAi = constraints.filter((c) => checks.ac.get(c.id) === true && checks.hc.get(c.id) === false);
  const humanReviewed = false; // the lite app has no reviewer workflow

  const focusFinding = (id: string) => {
    setActiveFinding(id);
    const el = document.getElementById(`ev-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
      el.focus({ preventScroll: true });
    }
  };

  return (
    <div className="space-y-8">
      {/* Status */}
      <section aria-labelledby="status-h" className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-human-ink">
              <Lock aria-hidden className="size-4" /> Your first response is saved
            </p>
            <h1 id="status-h" className="mt-1 text-2xl font-semibold text-ink sm:text-3xl">{view.problem.title}</h1>
            <p className="mt-1 text-sm text-ink-muted">Locked {new Date(view.submission.locked_at).toLocaleString()}</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/challenges">
              Try another challenge <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
        <div role="status" aria-live="polite" className="mt-4">
          {!view.ready ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warn/30 bg-warn-soft px-3.5 py-2.5 text-sm text-warn">
              <AlertTriangle aria-hidden className="size-4" /> The comparison isn’t ready yet. Your response is saved and locked.
              <Button size="sm" variant="outline" onClick={checkAgain} disabled={checking}>
                {checking ? <Loader2 aria-hidden className="motion-safe:animate-spin" /> : <RefreshCw aria-hidden />} Check again
              </Button>
            </div>
          ) : (
            <p className="sr-only">Comparison ready.</p>
          )}
        </div>
        {view.attempt.exposure !== "first_exposure" && (
          <p className="mt-3 text-sm text-ink-muted">Repeat attempt: you’d already tried this challenge, so this result is practice rather than a first try.</p>
        )}
      </section>

      {view.reference && (
        <p className="flex items-start gap-2 rounded-xl border border-l-4 border-line border-l-ai bg-paper px-4 py-3 text-sm text-ink-soft">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>About the reference explanation.</strong> It was written by the project team in the style of an AI explanation, before anyone answered — it is not generated by AI. It is sometimes wrong on purpose, so check it like you would check anyone’s reasoning.
          </span>
        </p>
      )}

      {/* Three summary cards */}
      {view.answer_check && (
        <section aria-labelledby="summary-h">
          <h2 id="summary-h" className="sr-only">Summary</h2>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>Answer check</CardTitle>
                  <Badge variant="neutral"><ShieldCheck aria-hidden /> Rule check</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {(["human", "reference"] as const).map((side) => {
                  const v = verdict(view.answer_check![side]);
                  return (
                    <div key={side} className="rounded-xl border border-line p-3">
                      <SideLabel side={side} />
                      <p className={cn("mt-1 flex items-center gap-1.5 font-semibold", v.cls)}>
                        <v.icon aria-hidden className="size-4" /> {v.text}
                      </p>
                      <p className="mt-1 text-sm text-ink-soft">
                        {describeAnswer(format, side === "human" ? view.submission.final_answer : view.reference?.final_answer)}
                      </p>
                    </div>
                  );
                })}
                <p className="text-xs text-ink-muted">Both answers were checked with the same reviewed rules. Any answer that meets every requirement counts as correct.</p>
              </CardContent>
            </Card>

            <Card className="border-human/30">
              <CardHeader>
                <CardTitle className="text-human-ink">What you noticed</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-[15px] text-ink">
                {validatorContrasts.map((c) => (
                  <p key={c.id}>Your answer meets “{c.text}” — the reference answer breaks it.</p>
                ))}
                {comp ? (
                  <>
                    {humanOnly.length > 0 ? (
                      <div>
                        <p>Your explanation states {humanOnly.length === 1 ? "a requirement" : `${humanOnly.length} requirements`} the reference explanation doesn’t:</p>
                        <ul className="mt-1 list-disc pl-5 text-ink-soft">{humanOnly.map((m) => <li key={m.constraint_id}>{ctext(m.constraint_id)}</li>)}</ul>
                      </div>
                    ) : (
                      validatorContrasts.length === 0 && <p className="text-ink-soft">No requirement appears only in your explanation.</p>
                    )}
                    <p className="text-ink-soft">
                      You described {comp.alternatives.human.count} other {comp.alternatives.human.count === 1 ? "option" : "options"}; the reference explanation described {comp.alternatives.reference.count}. More options aren’t automatically better.
                    </p>
                  </>
                ) : (
                  <p className="text-ink-muted">Comparison pending.</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-ai/30">
              <CardHeader>
                <CardTitle className="text-ai-ink">What the reference added</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-[15px] text-ink">
                {validatorContrastsAi.map((c) => (
                  <p key={c.id}>The reference answer meets “{c.text}” — your answer breaks it.</p>
                ))}
                {comp ? (
                  aiOnly.length > 0 ? (
                    <div>
                      <p>The reference explanation states {aiOnly.length === 1 ? "a requirement" : `${aiOnly.length} requirements`} yours doesn’t:</p>
                      <ul className="mt-1 list-disc pl-5 text-ink-soft">{aiOnly.map((m) => <li key={m.constraint_id}>{ctext(m.constraint_id)}</li>)}</ul>
                    </div>
                  ) : (
                    validatorContrastsAi.length === 0 && <p className="text-ink-soft">No requirement appears only in the reference explanation.</p>
                  )
                ) : (
                  <p className="text-ink-muted">Comparison pending.</p>
                )}
                <p className="text-xs text-ink-muted">“Not stated” means no sentence about it was found — not that someone didn’t think of it.</p>
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* Requirement by requirement */}
      {view.answer_check && (
        <section aria-labelledby="req-h" className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="req-h" className="text-xl font-semibold text-ink">Requirement by requirement</h2>
            <div className="flex flex-wrap gap-2">
              <Badge variant="neutral"><ShieldCheck aria-hidden /> Answer: rule check</Badge>
              <Badge variant={humanReviewed ? "ok" : "warn"}>{humanReviewed ? "Explanation: human-reviewed" : "Explanation: automated, provisional"}</Badge>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <caption className="sr-only">For each requirement: whether each answer meets it, and whether each explanation states it.</caption>
              <thead>
                <tr className="border-b border-line text-ink-muted">
                  <th scope="col" className="py-2 pr-3 font-semibold">Requirement</th>
                  <th scope="col" className="px-3 py-2 font-semibold"><span className="text-human-ink">Your answer</span></th>
                  <th scope="col" className="px-3 py-2 font-semibold"><span className="text-human-ink">Your explanation</span></th>
                  <th scope="col" className="px-3 py-2 font-semibold"><span className="text-ai-ink">Reference answer</span></th>
                  <th scope="col" className="px-3 py-2 font-semibold"><span className="text-ai-ink">Reference explanation</span></th>
                </tr>
              </thead>
              <tbody>
                {constraints.map((c) => {
                  const m = matrix.find((x) => x.constraint_id === c.id);
                  const cell = (side: "human" | "reference") => {
                    if (!m) return <span className="text-ink-muted">Pending</span>;
                    const s = m[side];
                    return s.finding_id && comp?.findings.find((f) => f.id === s.finding_id)?.evidence_excerpt ? (
                      <button type="button" className="rounded text-left underline-offset-4 hover:underline" onClick={() => focusFinding(s.finding_id!)} aria-label={`${STATUS_TEXT[s.status as Status]} — show quote`}>
                        <StatusPill status={s.status as Status} />
                      </button>
                    ) : (
                      <StatusPill status={s.status as Status} />
                    );
                  };
                  return (
                    <tr key={c.id} className="border-b border-line align-top last:border-0">
                      <th scope="row" className="py-3 pr-3 font-normal text-ink">{c.text}</th>
                      <td className="px-3 py-3"><PassPill passed={checks.hc.has(c.id) ? checks.hc.get(c.id)! : null} /></td>
                      <td className="px-3 py-3">{cell("human")}</td>
                      <td className="px-3 py-3"><PassPill passed={checks.ac.has(c.id) ? checks.ac.get(c.id)! : null} /></td>
                      <td className="px-3 py-3">{cell("reference")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {view.answer_check.human.engine === "answer_key" && (
            <p className="mt-3 text-xs text-ink-muted">Debugging answers are checked against reviewed fixes, so per-requirement answer checks aren’t shown. No code you wrote was run.</p>
          )}
        </section>
      )}

      {/* Side-by-side evidence */}
      {view.reference && (
        <section aria-labelledby="ev-h">
          <h2 id="ev-h" className="mb-3 text-xl font-semibold text-ink">Side by side</h2>
          <p className="mb-4 text-sm text-ink-soft">Highlighted text is quoted evidence. Every quote was checked to be an exact part of the explanation it’s attributed to.</p>
          <Tabs defaultValue="human" className="lg:grid lg:grid-cols-2 lg:gap-5">
            <TabsList className="mb-4 lg:hidden" aria-label="Explanations">
              <TabsTrigger value="human">You</TabsTrigger>
              <TabsTrigger value="reference">Reference explanation</TabsTrigger>
            </TabsList>
            <TabsContent value="human" forceMount className="data-[state=inactive]:hidden lg:!block">
              <div className="h-full rounded-2xl border border-human/30 bg-paper p-5">
                <div className="mb-3 flex items-center justify-between"><SideLabel side="human" /><Badge variant="human">Your first response</Badge></div>
                <Highlighted text={view.human_doc.text} findings={comp?.offsets_valid ? comp.findings : []} side="human" activeId={activeFinding} />
                {view.submission.confidence !== null && <p className="mt-4 text-sm text-ink-muted">Confidence you reported: {view.submission.confidence}%</p>}
              </div>
            </TabsContent>
            <TabsContent value="reference" forceMount className="data-[state=inactive]:hidden lg:!block">
              <div className="h-full rounded-2xl border border-ai/30 bg-paper p-5">
                <div className="mb-3 flex items-center justify-between"><SideLabel side="reference" /><Badge variant="ai">Hand-written</Badge></div>
                <Highlighted text={view.reference.doc.text} findings={comp?.offsets_valid ? comp.findings : []} side="reference" activeId={activeFinding} />
              </div>
            </TabsContent>
          </Tabs>
        </section>
      )}

      {/* Details */}
      {comp && <FindingsDetails view={view} onFocus={focusFinding} />}

      {view.reviewed_explanation && (
        <details className="group rounded-2xl border border-line bg-paper p-5 sm:p-6">
          <summary className="cursor-pointer list-none text-lg font-semibold text-ink marker:hidden">
            <span className="inline-flex items-center gap-2">Reviewed explanation <Badge variant="neutral">Written by the task author</Badge></span>
          </summary>
          <p className="mt-3 text-[15px] leading-relaxed text-ink">{view.reviewed_explanation.text}</p>
          <p className="mt-2 text-sm text-ink-soft"><strong>Accepted:</strong> {view.reviewed_explanation.accepted_summary}</p>
        </details>
      )}

      {view.answer_check && <RevisionPanel view={view} format={format} onSaved={refresh} />}

      {view.versions && (
        <details className="rounded-2xl border border-line bg-paper p-5 text-sm sm:p-6">
          <summary className="cursor-pointer font-semibold text-ink">How this result was produced</summary>
          <ul className="mt-3 space-y-1 text-ink-soft">
            {comp?.limitations.map((l) => <li key={l}>• {l}</li>)}
            {comp && comp.rejected_total > 0 && (
              <li>• {comp.rejected_total} automated {comp.rejected_total === 1 ? "finding was" : "findings were"} discarded because the quote or claim couldn’t be verified.</li>
            )}
          </ul>
          <dl className="mt-4 grid gap-x-6 gap-y-1 font-mono text-xs text-ink-muted sm:grid-cols-2">
            {Object.entries(view.versions).filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="flex gap-2"><dt>{k}:</dt><dd className="break-all">{v}</dd></div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
}

function FindingsDetails({ view, onFocus }: { view: ResultView; onFocus: (id: string) => void }) {
  const comp = view.comparison!;
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [sent, setSent] = useState<Record<string, boolean>>(() => Object.fromEntries(view.feedback.filter((f) => f.finding_id).map((f) => [f.finding_id!, true])));
  const groups = Object.keys(DIMENSION_TEXT).map((d) => ({ d, items: comp.findings.filter((f) => f.dimension === d) })).filter((g) => g.items.length);
  const ctext = (id: string | null) => view.problem.public_payload.constraints.find((c) => c.id === id)?.text;

  return (
    <details className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
      <summary className="cursor-pointer list-none text-lg font-semibold text-ink">
        <span className="inline-flex flex-wrap items-center gap-2">
          All findings ({comp.findings.length}) <Badge variant="warn">Automated · provisional</Badge>
        </span>
      </summary>
      <p className="mt-2 text-sm text-ink-soft">
        These findings come from keyword matching against reviewed cue words, with the source labels hidden from the matcher. It can miss things written in other words.{" "}
        If one looks wrong, use Dispute — disputes are saved so the cue words can be improved.
      </p>
      <div className="mt-4 space-y-6">
        {groups.map((g) => (
          <section key={g.d} aria-label={DIMENSION_TEXT[g.d]}>
            <h3 className="mb-2 font-sans text-sm font-bold text-ink-muted">{DIMENSION_TEXT[g.d]}</h3>
            <ul className="space-y-2">
              {g.items.map((f) => (
                <li key={f.id} className={cn("rounded-xl border p-3.5", f.side === "human" ? "border-human/25" : "border-ai/25")}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <SideLabel side={f.side} />
                      <StatusPill status={f.evidence_status} />
                    </div>
                    <div className="flex gap-2">
                      {f.evidence_excerpt && f.character_offsets && comp.offsets_valid && (
                        <Button size="sm" variant="ghost" onClick={() => onFocus(f.id)}>Show in text</Button>
                      )}
                      {sent[f.id] ? (
                        <span className="self-center text-xs text-ink-muted">Feedback sent</span>
                      ) : (
                        <Button size="sm" variant="ghost" aria-expanded={openFor === f.id} onClick={() => setOpenFor(openFor === f.id ? null : f.id)}>
                          <Flag aria-hidden /> Dispute
                        </Button>
                      )}
                    </div>
                  </div>
                  {ctext(f.constraint_id) && <p className="mt-1.5 text-sm text-ink-soft">Requirement: {ctext(f.constraint_id)}</p>}
                  <p className="mt-1.5 text-[15px] text-ink">{f.observation}</p>
                  {f.evidence_excerpt && <blockquote className="mt-2 border-l-4 border-line-strong pl-3 text-[15px] italic text-ink-soft">“{f.evidence_excerpt}”</blockquote>}
                  {openFor === f.id && (
                    <DisputeForm attemptId={view.attempt.id} findingId={f.id} onDone={() => { setSent((s) => ({ ...s, [f.id]: true })); setOpenFor(null); }} />
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
        <section aria-label="Other options">
          <h3 className="mb-2 font-sans text-sm font-bold text-ink-muted">Other options, counted</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["human", "reference"] as const).map((side) => (
              <div key={side} className={cn("rounded-xl border p-3.5", side === "human" ? "border-human/25" : "border-ai/25")}>
                <SideLabel side={side} />
                <p className="mt-1 text-[15px] text-ink">{comp.alternatives[side].count} distinct {comp.alternatives[side].count === 1 ? "option" : "options"}</p>
                <ul className="mt-1 list-disc pl-5 text-sm text-ink-soft">
                  {comp.alternatives[side].excerpts.map((e) => <li key={e.offsets[0]}>“{e.text}”</li>)}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-muted">Rewordings of the same option are counted once. More options aren’t automatically better.</p>
        </section>
      </div>
    </details>
  );
}

function DisputeForm({ attemptId, findingId, onDone }: { attemptId: string; findingId: string; onDone: () => void }) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const id = `dispute-${findingId}`;
  async function send() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/attempts/${attemptId}/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "dispute", finding_id: findingId, comment: comment || null }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error?.message ?? "Couldn’t send feedback.");
      onDone();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="mt-3 space-y-2 rounded-xl bg-canvas p-3">
      <Label htmlFor={id}>What’s wrong with this finding? (optional)</Label>
      <Textarea id={id} rows={2} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="For example: the quote is about a different requirement." />
      {err && <p role="alert" className="text-sm text-bad">{err}</p>}
      <Button size="sm" onClick={send} disabled={busy}>{busy && <Loader2 aria-hidden className="motion-safe:animate-spin" />} Send dispute</Button>
    </div>
  );
}

function RevisionPanel({ view, format, onSaved }: { view: ResultView; format: AnswerFormat; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState<AnswerValue>(() => emptyAnswer(format));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const noteId = `rev-note-${view.attempt.id}`;

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/attempts/${view.attempt.id}/revision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revised_answer: answer, note: note || null }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error?.message ?? "Couldn’t save the revision.");
      setOpen(false);
      setAnswer(emptyAnswer(format));
      setNote("");
      await onSaved();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <section aria-labelledby="rev-h" className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
      <h2 id="rev-h" className="text-xl font-semibold text-ink">Change your mind?</h2>
      <p className="mt-1 text-sm text-ink-soft">You can record a revised answer. It’s saved separately — your first response stays exactly as you submitted it.</p>
      {view.revisions.length > 0 && (
        <ul className="mt-4 space-y-2">
          {view.revisions.map((r, i) => (
            <li key={r.id} className="rounded-xl border border-line p-3 text-sm">
              <p className="font-semibold text-ink">Revision {i + 1} · {new Date(r.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
              <p className="text-ink-soft">{describeAnswer(format, r.revised_answer)}</p>
              {r.validation && (
                <p className={cn("mt-1 inline-flex items-center gap-1 font-semibold", r.validation.status === "correct" ? "text-ok" : r.validation.status === "incorrect" ? "text-bad" : "text-warn")}>
                  {r.validation.status === "correct" ? <CheckCircle2 aria-hidden className="size-4" /> : r.validation.status === "incorrect" ? <XCircle aria-hidden className="size-4" /> : <CircleDashed aria-hidden className="size-4" />}
                  {r.validation.status === "correct" ? "Meets every requirement" : r.validation.status === "incorrect" ? "Breaks at least one requirement" : "Couldn’t be checked"}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {!open ? (
        view.revisions.length < 3 && (
          <Button className="mt-4" variant="outline" onClick={() => setOpen(true)}>
            Add a revised answer
          </Button>
        )
      ) : (
        <div className="mt-4 space-y-4">
          <AnswerInput format={format} value={answer} onChange={setAnswer} disabled={busy} />
          <div className="space-y-1.5">
            <Label htmlFor={noteId}>What changed your mind? (optional)</Label>
            <Textarea id={noteId} rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {err && <p role="alert" className="text-sm text-bad">{err}</p>}
          <div className="flex gap-2">
            <Button onClick={save} disabled={busy || !answerComplete(format, answer)}>{busy && <Loader2 aria-hidden className="motion-safe:animate-spin" />} Save revision</Button>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          </div>
        </div>
      )}
    </section>
  );
}
