create extension if not exists pgcrypto;

create type attempt_state as enum ('DRAFT', 'SUBMITTED', 'READY');
create type exposure_kind as enum ('first_exposure', 'repeat_family', 'previously_revealed');

-- participants
-- Pseudonymous guests: No names, emails, schools or birth dates.
create table participants (
  id uuid primary key default gen_random_uuid(),
  pseudonym text not null unique,
  notice_version text not null,
  created_at timestamptz not null default now()
);
-- problems
create table problem_versions (
  id text primary key,
  family_id text not null,
  slug text not null,
  version integer not null check (version > 0),
  variant text not null default 'standard',
  category text not null check (category in ('logic', 'debugging', 'community')),
  difficulty text not null check (difficulty in ('easy', 'moderate')),
  est_minutes integer not null check (est_minutes between 1 and 60),
  title text not null,
  public_payload jsonb not null,          -- statement, facts, requirements, answer format
  provenance jsonb not null,
  status text not null default 'published' check (status in ('published', 'retired')),
  content_hash text not null,
  published_at timestamptz not null default now(),
  unique (family_id, version, variant)
);

create index problem_versions_slug_idx on problem_versions (slug, status);

-- Server-only content: answer rules, rubric cue words, the authors' explanation, and the
-- hand-written reference explanation shown after the lock. Never sent before submission.
create table problem_keys (
  problem_version_id text primary key references problem_versions (id) on delete cascade,
  validator jsonb not null,
  validator_version text not null,
  rubric jsonb not null,
  rubric_version text not null,
  reviewed_explanation jsonb not null,
  review jsonb not null,
  reference_output jsonb not null,        -- hand-written comparison explanation (not model output)
  reference_source text not null default 'hand_written' check (reference_source = 'hand_written')
);

-- attempts
create table attempts (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants (id) on delete cascade,
  problem_version_id text not null references problem_versions (id) on delete restrict,
  family_id text not null,
  variant text not null,
  exposure exposure_kind not null,
  state attempt_state not null default 'DRAFT',
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  revealed_at timestamptz,
  constraint locked_has_time check (state = 'DRAFT' or submitted_at is not null)
);
create index attempts_participant_idx on attempts (participant_id, started_at desc);
create index attempts_family_idx on attempts (participant_id, family_id);

-- first submissions
create table first_submissions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique references attempts (id) on delete cascade,
  participant_id uuid not null references participants (id) on delete cascade,
  final_answer jsonb not null check (jsonb_typeof(final_answer) = 'object' and pg_column_size(final_answer) < 8192),
  main_approach text not null check (length(main_approach) between 1 and 4000),
  alternatives text check (alternatives is null or length(alternatives) <= 3000),
  assumptions text check (assumptions is null or length(assumptions) <= 3000),
  confidence integer check (confidence is null or confidence between 0 and 100),
  idempotency_key text not null check (length(idempotency_key) between 8 and 100),
  locked_at timestamptz not null default now()
);

-- evaluations
create table evaluations (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique references attempts (id) on delete cascade,
  participant_id uuid not null references participants (id) on delete cascade,
  human_validation jsonb not null,
  reference_validation jsonb not null,
  comparison jsonb not null,
  validator_version text not null,
  rubric_version text not null,
  comparator_version text not null,
  review_state text not null default 'automated_provisional' check (review_state in ('automated_provisional', 'disputed')),
  created_at timestamptz not null default now()
);

-- revisions
create table revisions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references attempts (id) on delete cascade,
  participant_id uuid not null references participants (id) on delete cascade,
  revised_answer jsonb not null check (jsonb_typeof(revised_answer) = 'object' and pg_column_size(revised_answer) < 8192),
  note text check (note is null or length(note) <= 2000),
  revision_validation jsonb not null,
  created_at timestamptz not null default now()
);

-- feedback
create table feedback (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references attempts (id) on delete cascade,
  participant_id uuid not null references participants (id) on delete cascade,
  finding_id text check (finding_id is null or length(finding_id) <= 80),
  kind text not null check (kind in ('dispute', 'unclear', 'helpful')),
  comment text check (comment is null or length(comment) <= 1000),
  created_at timestamptz not null default now()
);

-- integrity triggers

-- Draft -> Submitted -> Ready only. Nothing ever returns to Draft, so a lock can't be undone.
create function guard_attempt_update() returns trigger language plpgsql as $$
begin
  if new.participant_id <> old.participant_id or new.problem_version_id <> old.problem_version_id
     or new.family_id <> old.family_id or new.variant <> old.variant or new.exposure <> old.exposure
     or new.started_at <> old.started_at then
    raise exception 'attempt assignment fields are immutable' using errcode = 'RL422';
  end if;
  if old.submitted_at is not null and new.submitted_at is distinct from old.submitted_at then
    raise exception 'submission time is immutable' using errcode = 'RL422';
  end if;
  if new.state <> old.state and not (
       (old.state = 'DRAFT' and new.state = 'SUBMITTED')
    or (old.state = 'SUBMITTED' and new.state = 'READY')) then
    raise exception 'illegal attempt transition % -> %', old.state, new.state using errcode = 'RL422';
  end if;
  return new;
end $$;
create trigger attempts_guard before update on attempts for each row execute function guard_attempt_update();

-- First responses can never be edited (deleting the whole participant is still allowed).
create function forbid_update() returns trigger language plpgsql as $$
begin
  raise exception '% rows are immutable', tg_table_name using errcode = 'RL423';
end $$;
create trigger first_submissions_immutable before update on first_submissions for each row execute function forbid_update();
create trigger revisions_immutable before update on revisions for each row execute function forbid_update();

-- Published problems and their keys can't change; publish a new version instead.
create function guard_problem_update() returns trigger language plpgsql as $$
begin
  if new.public_payload <> old.public_payload or new.content_hash <> old.content_hash
     or new.version <> old.version or new.variant <> old.variant or new.family_id <> old.family_id then
    raise exception 'published problem versions are immutable; publish a new version' using errcode = 'RL423';
  end if;
  return new;
end $$;
create trigger problem_versions_immutable before update on problem_versions for each row execute function guard_problem_update();

create function guard_key_update() returns trigger language plpgsql as $$
begin
  if new.validator <> old.validator or new.rubric <> old.rubric or new.reference_output <> old.reference_output then
    raise exception 'problem keys are immutable; publish a new version' using errcode = 'RL423';
  end if;
  return new;
end $$;
create trigger problem_keys_immutable before update on problem_keys for each row execute function guard_key_update();

-- atomic submission
-- In one transaction: check ownership and DRAFT state, store the single first response, and lock the attempt. Re-sending the same
-- idempotency key returns the original submission instead of failing.
create function submit_first_response(
  p_participant uuid, p_attempt uuid, p_final_answer jsonb, p_main_approach text,
  p_alternatives text, p_assumptions text, p_confidence integer, p_idempotency_key text
) returns table (submission_id uuid, replayed boolean)
language plpgsql as $$
declare
  v_attempt attempts%rowtype;
  v_existing first_submissions%rowtype;
  v_id uuid;
begin
  select * into v_attempt from attempts where id = p_attempt and participant_id = p_participant for update;
  if not found then
    raise exception 'attempt not found' using errcode = 'RL404';
  end if;
  if v_attempt.state <> 'DRAFT' then
    select * into v_existing from first_submissions where attempt_id = p_attempt;
    if found and v_existing.idempotency_key = p_idempotency_key then
      return query select v_existing.id, true;
      return;
    end if;
    raise exception 'attempt already locked' using errcode = 'RL409';
  end if;
  insert into first_submissions (attempt_id, participant_id, final_answer, main_approach, alternatives, assumptions, confidence, idempotency_key)
  values (p_attempt, p_participant, p_final_answer, p_main_approach,
          nullif(btrim(p_alternatives), ''), nullif(btrim(p_assumptions), ''), p_confidence, p_idempotency_key)
  returning id into v_id;
  update attempts set state = 'SUBMITTED', submitted_at = now() where id = p_attempt;
  return query select v_id, false;
end $$;