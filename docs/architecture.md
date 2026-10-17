# Reasoning Lab (Lite) — Architecture

**Reasoning Lab-lite** lets a person to solves a problem, explains their approach, and **locks** that first response.
After that the app shows them:
1. a rule-based **answer check** for their answer and for a **reference explanation**;
2. a quoted comparison of what each explanation stated.

The reference explanations are written by me and labelled that way in this application. 

## 1. The big picture

```
Browser ──HTTPS──▶ Next.js app (pages + API routes) ──SQL──▶ PostgreSQL
                     │  guest cookie (signed)                   participants, attempts,
                     │  answer checker (rules)                  first_submissions, evaluations,
                     │  explanation comparer (keywords)         revisions, feedback,
                     │                                          problem_versions, problem_keys
                     └─ reads content/ only when seeding
```

- **The browser never talks to the database.** The server is the only database client,
  and every query on participant data filters by the signed-in guest’s id.
- **Answer keys stay on the server.** Rules, cue words, the authors’ explanations and the
  reference explanations are in `problem_keys`. They are read only after the response is
  locked, and never shipped in page code.
- Answer checking and comparison are plain TypeScript and fully deterministic. They run
  inside the submit request, so there is nothing to queue or retry.

## 2. One attempt, start to finish

```
1. Start challenge   POST /api/session      → guest row + signed cookie (after accepting the notice)
                     POST /api/attempts     → attempt in DRAFT (random matched variant; repeats flagged)
2. Solve             (browser only)         → draft autosaves to this device's localStorage
3. Lock              POST /api/attempts/:id/submit
                       submit_first_response()  ← one SQL transaction:
                         • row-lock the attempt, check owner + DRAFT
                         • insert the ONE first_submissions row
                         • DRAFT → SUBMITTED
                         • same idempotency key again → returns the original
                       evaluate (same request):
                         • validator: human answer + reference answer, identical rules
                         • comparer: A/B order randomised, quotes verified, counts by server
                         • insert evaluations, SUBMITTED → READY
4. Results           GET /api/attempts/:id/result  → 409 until locked; owner only
                       (if step 3's evaluation was interrupted, this re-runs it)
5. Afterwards        POST …/revision (stored separately) · POST …/feedback (dispute a finding)
6. My data           DELETE /api/privacy/data → deletes the guest and everything linked to them
```

**Attempt states:** `DRAFT → SUBMITTED → READY`. A database trigger blocks every other
change, so a locked response can never go back to draft. Another trigger makes
`first_submissions` and `revisions` impossible to edit.

## 3. Database (`db/migrations/001_schema.sql`)

| Table | Holds | Notes |
|---|---|---|
| `participants` | random id, pseudonym, notice version | no personal details |
| `problem_versions` | public statement, facts, requirements, answer options | immutable once published |
| `problem_keys` | answer rules, rubric cue words, authors’ explanation, reference explanation | server only; immutable |
| `attempts` | who, which version/variant, state, timestamps, repeat flag | state changes guarded by a trigger |
| `first_submissions` | the locked answer and explanation | one per attempt; never editable |
| `evaluations` | both answer checks + the comparison (findings with quotes and offsets) | one per attempt |
| `revisions` | answers changed after seeing the result | separate; never overwrite the first response |
| `feedback` | disputes and comments on findings | |

Deleting a participant cascades to all their rows.

## 4. The two checkers

**Answer check** (`lib/evaluation/validate.ts`):
- **Logic and community tasks:** each requirement ID maps to a small rule (for example: all different, before/after, not adjacent, within budget, stock limit, step-free). An answer is correct when every rule passes, so **every valid answer is accepted**.
- **Debugging tasks:** the answer is matched against reviewed (line, fix) answers. No code a person submits is ever run.
- If an answer can’t be interpreted, it is marked **unverified**, not wrong.

**Explanation comparison** (`lib/evaluation/rule-comparator.ts`, `evidence.ts`):
- Both explanations use the same layout.
- The comparer looks for reviewed cue words per requirement and quotes the sentence that contains them.
- The server then:
  - discards any finding whose quote isn’t an exact substring, or that claims what someone “thought”;
  - counts alternatives itself, merging rewordings.
- **“Not stated” means no sentence was found.** It never means “didn’t think of it”.
- Keyword matching misses paraphrases, so findings are labelled automatic and provisional, and anyone can dispute one.

## 5. File map

```
app/                       pages: / , /challenges, /challenges/[slug], /attempts/[id], /activity, /privacy
app/api/                   session · problems · attempts (+ submit, result, revision, feedback) · privacy/data
components/                UI (solve workspace, results, library, activity); components/ui = shadcn-style primitives
lib/auth/session.ts        signed guest cookie
lib/db/pool.ts             pg pool + withTx()
lib/attempts/service.ts    start, submit, evaluate, result, revision, feedback
lib/evaluation/            validate (answer rules) · explanation (text layout) · rule-comparator · evidence · compare
lib/problems/              content schemas, loader, catalog, seeding
lib/privacy/service.ts     activity list, delete everything
content/problems/          12 problem families (16 versions, incl. matched variants)
content/reference-explanations/  written reference explanations
db/migrations/001_schema.sql      the whole schema
db/seed.sql                generated plain-SQL seed (alternative to npm run db:seed)
scripts/                   setup-env · local-db · migrate · seed · build-seed-sql
