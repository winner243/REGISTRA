-- Migration 20260917000001 — Résilience : Jobs génériques + Queue + Worker + Logs
-- ---------------------------------------------------------------------------
-- Rôle : doter le Starter d'un système de jobs asynchrones GÉNÉRIQUE, réutilisable
-- par tout futur SaaS, sans infrastructure externe (Redis, BullMQ…).
--   * Une seule table `jobs` pour toutes les queues (emails, exports, webhooks, billing, notifications, cleanup…)
--   * Idempotence via `unique(queue_name, idempotency_key)` — même clé = pas de doublon
--   * Statuts : pending → processing → completed | failed | cancelled
--   * Retries : `attempts`, `max_attempts`, `next_attempt_at` (backoff géré côté worker)
--   * Delayed jobs : `scheduled_at` (exécution future) — index pour claim efficace
--   * Logs sanitized : `job_logs` (quoi, quand, statut, tentatives, erreur SANS secrets)
--   * RLS : activée, AUCUNE policy → accès strictement `service_role` (côté serveur)
--   * Fonctions `security definer` pour claim/mark — exécutoires uniquement par `service_role`
-- ---------------------------------------------------------------------------
-- Principes de sécurité :
--   * `jobs` / `job_logs` : RLS activée, SANS policy → illisibles/inaccessibles par anon/authenticated
--   * Toutes les mutations passent par fonctions `security definer` (`search_path = ''`)
--   * `payload` / `error` : données minimales, JAMAIS de secrets (tokens, clés, mots de passe)
--   * `idempotency_key` : fournie par l'appelant (ex. invitation token, export ID, webhook ID)
-- ---------------------------------------------------------------------------
-- Décisions d'intégrité :
--   * `unique (queue_name, idempotency_key)` → idempotence forte par queue
--   * `status` : pending → processing → completed | failed | cancelled (transitions pilotées par worker)
--   * `attempts` + `max_attempts` + `next_attempt_at` → backoff, pas de blocage définitif
--   * `scheduled_at` NULL = immédiat ; futur = delayed job (claim seulement quand <= now())
--   * `completed_at` / `failed_at` / `cancelled_at` : horodatage précis de fin
--   * `job_logs` : une ligne par transition d'état + erreurs, rétention configurable (purge doc)
--   * Pas de `deleted_at` (soft delete non appliqué — voir `documentation/database.md`)
-- ---------------------------------------------------------------------------

-- 1. Enum pour les noms de queues (borné, extensible par migration future)
create type public.job_queue_name as enum (
  'emails',
  'exports',
  'notifications',
  'webhooks',
  'billing',
  'cleanup'
);

create type public.job_status as enum (
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled'
);

-- 2. Table jobs — file unifiée multi-queue
create table public.jobs (
  id                   uuid primary key default gen_random_uuid(),
  queue_name           public.job_queue_name not null,
  idempotency_key      text not null check (length(btrim(idempotency_key)) between 1 and 200),
  status               public.job_status not null default 'pending',
  payload              jsonb not null default '{}'::jsonb,
  error                text,
  attempts             integer not null default 0 check (attempts >= 0),
  max_attempts         integer not null default 3 check (max_attempts >= 1),
  scheduled_at         timestamptz not null default now(),
  started_at           timestamptz,
  completed_at         timestamptz,
  failed_at            timestamptz,
  cancelled_at         timestamptz,
  next_attempt_at      timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (queue_name, idempotency_key)
);

comment on table public.jobs is
  'File unifiée de jobs asynchrones. Côté serveur uniquement (service_role), jamais lisible par le client.';
comment on column public.jobs.queue_name is
  'Nom de la file (emails, exports, notifications, webhooks, billing, cleanup).';
comment on column public.jobs.idempotency_key is
  'Clé d''idempotence fournie par l''appelant (ex. token invitation, export ID). `unique(queue_name, idempotency_key)` = pas de doublon.';
comment on column public.jobs.payload is
  'Données minimales non sensibles pour le traitement du job (jamais de token, secret, mot de passe).';
comment on column public.jobs.error is
  'Dernier message d''erreur (tronqué, sanitized).';
comment on column public.jobs.attempts is 'Nombre de tentatives déjà effectuées.';
comment on column public.jobs.max_attempts is 'Plafond de tentatives avant échec définitif.';
comment on column public.jobs.scheduled_at is
  'Date d''exécution prévue. NULL/now() = immédiat ; futur = delayed job.';
comment on column public.jobs.next_attempt_at is
  'Prochaine fenêtre de retry (calculée par le worker via backoff exponentiel).';

--    Index pour le claim du worker : due jobs (pending/failed dont fenêtre atteinte) + scheduled_at <= now()
create index jobs_due_idx
  on public.jobs (queue_name, status, next_attempt_at)
  where status in ('pending', 'failed');

--    Index pour les delayed jobs (scheduled_at futur)
create index jobs_scheduled_idx
  on public.jobs (queue_name, scheduled_at)
  where status = 'pending' and scheduled_at > now();

-- 3. Timestamps maintenus par le serveur (fonction existante `handle_updated_at`)
create trigger handle_jobs_updated_at
  before update on public.jobs
  for each row execute function public.handle_updated_at();

-- 4. Mise en file (idempotente) : insère ou retourne l'id de la ligne existante.
--    Retourne NULL si (queue_name, idempotency_key) existe déjà (aucun doublon).
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
    p_max_attempts, p_scheduled_at, p_scheduled_at
  )
  on conflict (queue_name, idempotency_key) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.queue_job(job_queue_name, text, jsonb, integer, timestamptz) is
  'Met un job en file de façon idempotente. Retourne l''id de la ligne insérée, NULL si (queue_name, idempotency_key) existe déjà.';

-- 5. Réclame un lot de jobs dus pour une queue donnée.
--    `for update skip locked` : plusieurs workers concurrents ne se volent jamais la même ligne.
--    Conditions : status IN ('pending', 'failed') ET (next_attempt_at IS NULL OR next_attempt_at <= now())
--    ET scheduled_at <= now()
create or replace function public.claim_job_batch(
  p_queue_name public.job_queue_name,
  p_limit integer
)
returns setof public.jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
    update public.jobs j
       set status = 'processing',
           attempts = j.attempts + 1,
           started_at = coalesce(j.started_at, now()),
           next_attempt_at = null,
           updated_at = now()
     where j.id in (
       select o.id
       from public.jobs o
       where o.queue_name = p_queue_name
         and o.status in ('pending', 'failed')
         and (o.next_attempt_at is null or o.next_attempt_at <= now())
         and o.scheduled_at <= now()
       order by o.scheduled_at asc, o.next_attempt_at asc nulls first
       limit p_limit
       for update skip locked
     )
   returning j.*;
end;
$$;

comment on function public.claim_job_batch(job_queue_name, integer) is
  'Réclame jusqu''à p_limit jobs dus pour la queue donnée, les passe en processing et les retourne.';

-- 6. Marquage fin de traitement — succès
create or replace function public.mark_job_completed(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.jobs j
     set status = 'completed',
         completed_at = now(),
         error = null,
         next_attempt_at = null,
         updated_at = now()
   where j.id = p_id;

  return found;
end;
$$;

comment on function public.mark_job_completed(uuid) is
  'Marque un job comme terminé avec succès.';

-- 7. Marquage fin de traitement — échec (planifie retry si attempts < max_attempts)
create or replace function public.mark_job_failed(
  p_id uuid,
  p_error text,
  p_next_attempt_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.jobs;
begin
  -- Récupère le job pour connaître max_attempts
  select * into v_job
  from public.jobs
  where id = p_id;

  if not found then
    return false;
  end if;

  if v_job.attempts >= v_job.max_attempts then
    -- Échec définitif
    update public.jobs j
       set status = 'failed',
           failed_at = now(),
           error = left(p_error, 500),
           next_attempt_at = null,
           updated_at = now()
     where j.id = p_id;
  else
    -- Échec temporaire : planifie retry
    update public.jobs j
       set status = 'failed',
           error = left(p_error, 500),
           next_attempt_at = p_next_attempt_at,
           updated_at = now()
     where j.id = p_id;
  end if;

  return found;
end;
$$;

comment on function public.mark_job_failed(uuid, text, timestamptz) is
  'Marque un job en échec. Si attempts < max_attempts : planifie retry (next_attempt_at). Sinon : failed définitif.';

-- 8. Annulation d'un job (pending uniquement)
create or replace function public.cancel_job(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.jobs j
     set status = 'cancelled',
         cancelled_at = now(),
         updated_at = now()
   where j.id = p_id
     and j.status = 'pending';

  return found;
end;
$$;

comment on function public.cancel_job(uuid) is
  'Annule un job en attente (pending only). Retourne true si annulé.';

-- 9. Table de logs sanitized pour observabilité
create table public.job_logs (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid not null references public.jobs (id) on delete cascade,
  queue_name      public.job_queue_name not null,
  status          public.job_status not null,
  attempt         integer not null check (attempt >= 1),
  error           text,
  duration_ms     integer,
  created_at      timestamptz not null default now()
);

comment on table public.job_logs is
  'Logs sanitized des transitions de jobs (quoi, quand, statut, tentative, erreur SANS secrets).';
comment on column public.job_logs.error is
  'Message d''erreur sanitized (tronqué 500 chars, jamais de secret).';

--    Index pour requêtes par job et par queue/date
create index job_logs_job_id_idx on public.job_logs (job_id);
create index job_logs_queue_created_idx on public.job_logs (queue_name, created_at desc);

-- 10. Fonction d'insertion de log (server-only, appelée par le worker)
create or replace function public.log_job_transition(
  p_job_id uuid,
  p_queue_name public.job_queue_name,
  p_status public.job_status,
  p_attempt integer,
  p_error text default null,
  p_duration_ms integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.job_logs (job_id, queue_name, status, attempt, error, duration_ms)
  values (p_job_id, p_queue_name, p_status, p_attempt, left(p_error, 500), p_duration_ms);
end;
$$;

comment on function public.log_job_transition(uuid, job_queue_name, job_status, integer, text, integer) is
  'Enregistre une transition de job (server-only via service_role).';

-- 11. RLS : activée et SANS AUCUNE policy → illisible et inatteignable par le client
alter table public.jobs enable row level security;
alter table public.job_logs enable row level security;

-- 12. Droits (ACL) : réservé à `service_role`, retiré à tous les autres
revoke all on table public.jobs from anon, authenticated;
revoke all on table public.jobs from public;

revoke all on function public.queue_job(job_queue_name, text, jsonb, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.queue_job(job_queue_name, text, jsonb, integer, timestamptz) to service_role;

revoke all on function public.claim_job_batch(job_queue_name, integer) from public, anon, authenticated;
grant execute on function public.claim_job_batch(job_queue_name, integer) to service_role;

revoke all on function public.mark_job_completed(uuid) from public, anon, authenticated;
grant execute on function public.mark_job_completed(uuid) to service_role;

revoke all on function public.mark_job_failed(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.mark_job_failed(uuid, text, timestamptz) to service_role;

revoke all on function public.cancel_job(uuid) from public, anon, authenticated;
grant execute on function public.cancel_job(uuid) to service_role;

revoke all on function public.log_job_transition(uuid, job_queue_name, job_status, integer, text, integer) from public, anon, authenticated;
grant execute on function public.log_job_transition(uuid, job_queue_name, job_status, integer, text, integer) to service_role;

revoke all on table public.job_logs from anon, authenticated;
revoke all on table public.job_logs from public;