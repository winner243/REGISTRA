-- Migration 20260917000002 — Cron Registry centralisé + Sécurité
-- ---------------------------------------------------------------------------
-- Rôle : registry unique pour toutes les tâches programmées (cron) du Starter.
--   * Une seule table `cron_tasks` : définition déclarative (nom, queue, schedule, payload, enabled)
--   * Endpoint unique `/api/cron/run` protégé par `CRON_SECRET` (Bearer) — remplace endpoints dispersés
--   * Exécution : le scheduler (Vercel Cron / pg_cron / externe) appelle `/api/cron/run?task=<name>`
--   * Idempotence : chaque exécution crée un job via `queue_job` (clé = `cron:<task_name>:<timestamp_window>`)
--   * Sécurité : RLS activée, lecture catalogue public (anon/authenticated), écriture service_role seulement
--   * Logs : `cron_executions` pour traçabilité (quoi, quand, succès/échec, job_id créé)
-- ---------------------------------------------------------------------------
-- Principes de sécurité :
--   * `cron_tasks` : RLS + policy SELECT public (catalogue), INSERT/UPDATE/DELETE service_role seulement
--   * `cron_executions` : RLS sans policy → server-only (service_role)
--   * Endpoint cron : authentification Bearer `CRON_SECRET` (jamais exposé au client)
--   * Aucune tâche métier réelle créée ici — le futur SaaS insère ses tâches via migration
-- ---------------------------------------------------------------------------
-- Décisions d'intégrité :
--   * `schedule` : expression cron standard (ex. "0 2 * * *" = chaque jour 02:00 UTC)
--   * `timezone` : IANA timezone (ex. "UTC", "Europe/Paris") pour interprétation schedule
--   * `payload` : JSON pour paramètres du job (queue_name, idempotency_key pattern, payload job)
--   * `enabled` : activation/désactivation sans suppression
--   * `last_run_at` / `next_run_at` : maintenus par le scheduler pour observabilité
--   * `cron_executions` : une ligne par exécution (succès/échec), rétention configurable
-- ---------------------------------------------------------------------------

-- 1. Table cron_tasks — registry centralisé
create table public.cron_tasks (
  name              text primary key check (length(btrim(name)) between 1 and 100),
  description       text not null check (length(btrim(description)) between 1 and 500),
  queue_name        public.job_queue_name not null,
  schedule          text not null check (schedule ~ '^(@(annually|yearly|monthly|weekly|daily|hourly)|([0-9*,\-\/]+\s+){4,5}[0-9*,\-\/]+)$'),
  timezone          text not null default 'UTC' check (timezone ~ '^[A-Za-z0-9_+\-]+/[A-Za-z0-9_+\-]+$'),
  payload           jsonb not null default '{}'::jsonb,
  enabled           boolean not null default true,
  last_run_at       timestamptz,
  next_run_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.cron_tasks is
  'Registry centralisé des tâches programmées. Catalogue public en lecture, écriture service_role.';
comment on column public.cron_tasks.name is 'Nom unique de la tâche (identifiant naturel, ex. email-outbox, daily-cleanup).';
comment on column public.cron_tasks.queue_name is 'Queue cible pour le job créé (emails, exports, cleanup, etc.).';
comment on column public.cron_tasks.schedule is 'Expression cron standard (5 ou 6 champs, ou @annually/@daily/...).';
comment on column public.cron_tasks.timezone is 'Timezone IANA pour interprétation du schedule (ex. UTC, Europe/Paris).';
comment on column public.cron_tasks.payload is 'Paramètres JSON pour le job : {idempotency_key_pattern, max_attempts, job_payload...}.';
comment on column public.cron_tasks.enabled is 'Tâche active ? Désactivable sans suppression.';

-- 2. Timestamps
create trigger handle_cron_tasks_updated_at
  before update on public.cron_tasks
  for each row execute function public.handle_updated_at();

-- 3. Table d'exécutions (traçabilité)
create table public.cron_executions (
  id              uuid primary key default gen_random_uuid(),
  task_name       text not null references public.cron_tasks (name) on delete cascade,
  status          text not null check (status in ('success', 'failed', 'skipped')),
  job_id          uuid references public.jobs (id) on delete set null,
  error           text,
  duration_ms     integer,
  created_at      timestamptz not null default now()
);

comment on table public.cron_executions is
  'Historique des exécutions de tâches cron (server-only, observabilité).';
comment on column public.cron_executions.status is 'success = job créé, failed = erreur création, skipped = tâche désactivée.';

create index cron_executions_task_created_idx on public.cron_executions (task_name, created_at desc);

-- 4. RLS
alter table public.cron_tasks enable row level security;
alter table public.cron_executions enable row level security;

-- 4.1 cron_tasks : lecture publique du catalogue (comme roles/permissions/templates)
create policy "cron_tasks_select_public"
  on public.cron_tasks
  for select
  to anon, authenticated
  using (true);

-- 4.2 cron_executions : AUCUNE policy → server-only (service_role)

-- 5. Droits (ACL)
grant select on public.cron_tasks to anon, authenticated;
revoke insert, update, delete on public.cron_tasks from anon, authenticated;
revoke all on public.cron_tasks from public;

revoke all on table public.cron_executions from anon, authenticated;
revoke all on table public.cron_executions from public;

-- 6. Fonction helper : calcule next_run_at depuis schedule (utilise pg_cron ou calcul applicatif)
--    Note : le calcul réel du next_run_at est fait côté applicatif (scheduler Vercel/pg_cron)
--    Cette fonction sert à mettre à jour last_run_at/next_run_at après exécution.
create or replace function public.mark_cron_execution(
  p_task_name text,
  p_status text,
  p_job_id uuid default null,
  p_error text default null,
  p_duration_ms integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.cron_executions (task_name, status, job_id, error, duration_ms)
  values (p_task_name, p_status, p_job_id, left(p_error, 500), p_duration_ms);

  if p_status = 'success' then
    update public.cron_tasks
       set last_run_at = now(),
           -- next_run_at sera calculé par le scheduler externe (Vercel Cron / pg_cron)
           updated_at = now()
     where name = p_task_name;
  end if;
end;
$$;

comment on function public.mark_cron_execution(text, text, uuid, text, integer) is
  'Enregistre une exécution cron et met à jour last_run_at (service_role).';

revoke all on function public.mark_cron_execution(text, text, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.mark_cron_execution(text, text, uuid, text, integer) to service_role;

-- 7. Seed idempotent : tâche email-outbox (exemple, le futur SaaS ajoute les siennes)
insert into public.cron_tasks (name, description, queue_name, schedule, timezone, payload)
values (
  'email-outbox',
  'Traite la file d''attente des emails (outbox) — réclame les emails dus et tente l''envoi.',
  'emails',
  '* * * * *',  -- chaque minute
  'UTC',
  '{"idempotency_key_pattern": "cron:email-outbox:%Y%m%d%H%M", "max_attempts": 3, "batch_size": 10}'::jsonb
)
on conflict (name) do nothing;