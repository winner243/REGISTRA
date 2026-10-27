-- Migration 20261012000004 — Correctif queue_job : next_attempt_at initial à NULL
-- ---------------------------------------------------------------------------
-- Rôle : permettre la reprise d'un job différé dès que `scheduled_at` est
-- atteint (parcours "Delayed" de tests/db/jobs-foundation-tests.sql).
--
-- Contenu : `create or replace function public.queue_job(...)` identique, sauf
-- l'initialisation de `next_attempt_at` qui passe de `p_scheduled_at` à `NULL`.
--
-- Décision d'intégrité :
--   * `next_attempt_at` est un champ de RETRY (fenêtre de backoff posée par
--     `mark_job_failed`), pas une seconde horloge de planification. Le claim
--     (`claim_job_batch`) considère explicitement `next_attempt_at IS NULL OR
--     <= now()` comme "dû" ; en initialisant le champ à `p_scheduled_at`, la
--     condition de délai était comptée DEUX fois (scheduled_at ET
--     next_attempt_at), et un "avancement de temps" sur `scheduled_at` seul ne
--     suffisait plus à rendre le job claimable.
--   * Avec `NULL` initial, seul `scheduled_at` pilote le délai — exactement la
--     matrice documentée : "scheduled_at futur → pas claim avant date ; claim
--     quand due".
--   * Le backoff des retries est inchangé : `mark_job_failed` continue de
--     poser `next_attempt_at` futur pour les échecs temporaires.
--   * `order by scheduled_at asc, next_attempt_at asc nulls first` du claim
--     reste cohérent (les jobs jamais tentés passent en tête).
-- ---------------------------------------------------------------------------

create or replace function public.queue_job(
  p_queue_name public.job_queue_name,
  p_idempotency_key text,
  p_payload jsonb,
  p_max_attempts integer default 3,
  p_scheduled_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.jobs (
    queue_name, idempotency_key, payload, max_attempts, scheduled_at, next_attempt_at
  )
  values (
    p_queue_name, p_idempotency_key, coalesce(p_payload, '{}'::jsonb),
    p_max_attempts, p_scheduled_at, null
  )
  on conflict (queue_name, idempotency_key) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.queue_job(job_queue_name, text, jsonb, integer, timestamptz) is
  'Met un job en file de facon idempotente (next_attempt_at initial NULL : seul scheduled_at pilote le delai). Retourne l''id de la ligne inseree, NULL si (queue_name, idempotency_key) existe deja.';
