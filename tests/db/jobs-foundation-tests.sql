-- Jobs foundation tests — queue, idempotence, claim, retry, failed, logs, sécurité
-- ---------------------------------------------------------------------------
-- Exécuté par la CI (job `db-migrations`) APRÈS les migrations jobs + cron
-- Matrice testée :
--   Queue         : queue_job insère une ligne `pending`, claim_job_batch
--                   la passe en `processing` (attempts +1) en la retournant
--   Idempotence   : re-queue du même (queue_name, idempotency_key) → NULL, aucun doublon
--   Delayed       : scheduled_at futur → pas claim avant date ; claim quand due
--   Retry         : mark_job_failed planifie next_attempt_at future puis re-claim
--   Max attempts  : attempts >= max_attempts → failed définitif (pas de next_attempt_at)
--   Completion    : mark_job_completed clôt la ligne (completed, completed_at)
--   Cancel        : cancel_job annule seulement si pending
--   Logs          : log_job_transition enregistre transitions sanitized
--   Failed jobs   : getFailedJobs récupère jobs failed définitifs
--   Sécurité      : RLS activé + AUCUNE policy → authenticated/anon ne voient
--                   AUCUNE ligne ; fonctions réservées à service_role
--   Cron tasks    : catalogue public lisible, seed email-outbox présent
--   Cron execs    : mark_cron_execution enregistre historique
-- ---------------------------------------------------------------------------

-- =============================================================================
-- 0. Helpers de test
-- =============================================================================
create or replace function public._test_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if p_condition is not true then
    raise exception 'JOBS FAILED: %', p_message;
  end if;
end;
$$;

create or replace function public._test_expect_denied(p_sql text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
    raise exception 'JOBS FAILED: refus attendu, mais instruction réussie: %', p_sql;
  exception when insufficient_privilege then
    return;
  end;
end;
$$;

-- =============================================================================
-- 1. Queue — queue_job + claim_job_batch
-- =============================================================================
select public.queue_job(
  'exports', 'export-1', '{"exportId":"export-1","format":"csv"}'::jsonb, 3, now()
) as job_q1 \gset

select public._test_assert(
  :'job_q1' is not null,
  'queue_job doit retourner l''id de la ligne insérée'
);
select public._test_assert(
  (select count(*) from public.jobs j
    where j.queue_name = 'exports' and j.idempotency_key = 'export-1'
      and j.status = 'pending' and j.attempts = 0) = 1,
  'queue_job doit insérer une ligne pending avec attempts = 0'
);

-- Claim : passe en processing, attempts +1, retourne la ligne
select public.claim_job_batch('exports', 10) as job_claimed \gset

select public._test_assert(
  (select count(*) from public.jobs j
    where j.idempotency_key = 'export-1'
      and j.status = 'processing' and j.attempts = 1) = 1,
  'claim_job_batch doit passer la ligne en processing (attempts +1)'
);

-- =============================================================================
-- 2. Idempotence — même (queue_name, idempotency_key) → NULL
-- =============================================================================
select public.queue_job(
  'exports', 'export-1', '{"exportId":"export-1","format":"json"}'::jsonb, 3, now()
) as job_q2 \gset

select public._test_assert(
  :'job_q2' is null,
  're-queue du même (queue_name, idempotency_key) doit retourner NULL'
);
select public._test_assert(
  (select count(*) from public.jobs j where j.idempotency_key = 'export-1') = 1,
  'aucun doublon ne doit être créé pour la même référence'
);

-- Autre clé → nouvelle ligne
select public.queue_job(
  'exports', 'export-2', '{"exportId":"export-2"}'::jsonb, 3, now()
) as job_q3 \gset
select public._test_assert(:'job_q3' is not null, 'clé distincte crée nouvelle ligne');

-- =============================================================================
-- 3. Delayed jobs — scheduled_at futur
-- =============================================================================
select public.queue_job(
  'cleanup', 'cleanup-future', '{"task":"purge_logs"}'::jsonb, 3, now() + interval '1 hour'
) as job_delayed \gset

select public._test_assert(
  :'job_delayed' is not null,
  'delayed job inséré'
);
select public._test_assert(
  (select status from public.jobs where id = :'job_delayed') = 'pending',
  'delayed job reste pending'
);
select public._test_assert(
  (select count(*) from public.claim_job_batch('cleanup', 10) c where c.id = :'job_delayed') = 0,
  'claim ne récupère PAS un job dont scheduled_at > now()'
);

-- Avancer le temps → claim fonctionne
update public.jobs set scheduled_at = now() - interval '1 minute' where id = :'job_delayed';
select public._test_assert(
  (select count(*) from public.claim_job_batch('cleanup', 10) c where c.id = :'job_delayed') = 1,
  'après scheduled_at, claim récupère le job'
);

-- =============================================================================
-- 4. Completion — mark_job_completed
-- =============================================================================
select public.mark_job_completed(:'job_q1'::uuid) as job_completed \gset
select public._test_assert(
  :'job_completed',
  'mark_job_completed retourne true'
);
select public._test_assert(
  (select count(*) from public.jobs j
    where j.id = :'job_q1'::uuid and j.status = 'completed'
      and j.completed_at is not null and j.error is null) = 1,
  'mark_job_completed clôture la ligne (completed, completed_at)'
);
select public._test_assert(
  (select count(*) from public.claim_job_batch('exports', 10) c where c.id = :'job_q1'::uuid) = 0,
  'job completed ne doit plus être réclamé'
);

-- =============================================================================
-- 5. Retry — échec puis re-tentative
-- =============================================================================
-- job_q3 est en processing (claim ci-dessus) → simule échec
select public.mark_job_failed(
  :'job_q3'::uuid,
  'Export generation failed: timeout',
  now() + interval '1 minute'
) as job_failed \gset

select public._test_assert(
  :'job_failed',
  'mark_job_failed retourne true'
);
select public._test_assert(
  (select count(*) from public.jobs j
    where j.id = :'job_q3'::uuid and j.status = 'failed'
      and j.error like 'Export generation failed%'
      and j.next_attempt_at > now()) = 1,
  'échec temporaire → failed + next_attempt_at futur'
);

-- Fenêtre pas atteinte → pas de re-claim
select public._test_assert(
  (select count(*) from public.claim_job_batch('exports', 10) c where c.id = :'job_q3'::uuid) = 0,
  'hors fenêtre, job failed non ré-claimé'
);

-- Fenêtre atteinte → re-claim (attempts 2)
update public.jobs set next_attempt_at = now() - interval '1 second' where id = :'job_q3'::uuid;
select public._test_assert(
  (select count(*) from public.claim_job_batch('exports', 10) c
    where c.id = :'job_q3'::uuid and c.status = 'processing' and c.attempts = 2) = 1,
  'à la fenêtre, job failed re-claimé (attempts 2)'
);

-- =============================================================================
-- 6. Max attempts — échec définitif
-- =============================================================================
select public.queue_job(
  'webhooks', 'webhook-max', '{"url":"https://example.com/hook"}'::jsonb, 2, now()
) as job_max \gset

-- Claim 1
select public.claim_job_batch('webhooks', 10);
-- Échec 1
select public.mark_job_failed(:'job_max'::uuid, 'Error 1', now() + interval '1 minute');
-- Claim 2 (après fenêtre)
update public.jobs set next_attempt_at = now() - interval '1 second' where id = :'job_max';
select public.claim_job_batch('webhooks', 10);
-- Échec 2 (max_attempts=2 atteint)
select public.mark_job_failed(:'job_max'::uuid, 'Error 2 final', now() + interval '1 hour');

select public._test_assert(
  (select count(*) from public.jobs j
    where j.id = :'job_max'::uuid and j.status = 'failed'
      and j.failed_at is not null and j.next_attempt_at is null) = 1,
  'après max_attempts → failed définitif (failed_at, next_attempt_at null)'
);

-- =============================================================================
-- 7. Cancel — annulation pending only
-- =============================================================================
select public.queue_job('billing', 'bill-cancel', '{}'::jsonb, 3, now()) as job_cancel \gset
select public.cancel_job(:'job_cancel'::uuid) as cancel_ok \gset
select public._test_assert(:'cancel_ok', 'cancel_job pending retourne true');

select public._test_assert(
  (select status from public.jobs where id = :'job_cancel') = 'cancelled',
  'job annulé → status cancelled'
);

-- Tentative cancel sur job processing → false
select public.claim_job_batch('billing', 10);
select public._test_assert(
  (select public.cancel_job(:'job_q3'::uuid)) = false,
  'cancel_job sur processing retourne false'
);

-- =============================================================================
-- 8. Logs — log_job_transition
-- =============================================================================
select public.log_job_transition(
  :'job_q1'::uuid, 'exports', 'completed', 1, null, 150
);

select public._test_assert(
  (select count(*) from public.job_logs l
    where l.job_id = :'job_q1'::uuid and l.status = 'completed' and l.attempt = 1
      and l.duration_ms = 150) = 1,
  'log_job_transition enregistre transition'
);

-- Erreur sanitized (tronquée 500)
select public.log_job_transition(
  :'job_q3'::uuid, 'exports', 'failed', 2, repeat('x', 1000), 5000
);
select public._test_assert(
  (select length(error) from public.job_logs where job_id = :'job_q3'::uuid order by created_at desc limit 1) = 500,
  'erreur tronquée à 500 chars'
);

-- =============================================================================
-- 9. Failed jobs — getFailedJobs (via SQL direct)
-- =============================================================================
select public._test_assert(
  (select count(*) from public.jobs where status = 'failed' and next_attempt_at is null) >= 1,
  'au moins un job failed définitif existe'
);

-- =============================================================================
-- 10. Cron tasks — catalogue public
-- =============================================================================
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);

select public._test_assert(
  (select count(*) from public.cron_tasks) >= 1,
  'au moins une tâche cron (seed email-outbox)'
);
select public._test_assert(
  (select count(*) from public.cron_tasks where name = 'email-outbox') = 1,
  'tâche email-outbox seedée'
);
select public._test_assert(
  (select enabled from public.cron_tasks where name = 'email-outbox') = true,
  'tâche email-outbox activée par défaut'
);

-- Écriture interdite
select public._test_expect_denied(
  'insert into public.cron_tasks (name, description, queue_name, schedule) values (''test'', ''test'', ''emails'', ''* * * * *'')'
);

reset role;

-- =============================================================================
-- 11. Cron executions — mark_cron_execution
-- =============================================================================
select public.mark_cron_execution('email-outbox', 'success', null, null, 123);
select public._test_assert(
  (select count(*) from public.cron_executions where task_name = 'email-outbox' and status = 'success') = 1,
  'mark_cron_execution enregistre succès'
);

-- =============================================================================
-- 12. Sécurité — RLS + aucune policy + fonctions service_role only
-- =============================================================================
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);

select public._test_expect_denied(
  'select count(*) from public.jobs'
);
select public._test_expect_denied(
  'select count(*) from public.job_logs'
);
select public._test_expect_denied(
  'select count(*) from public.cron_executions'
);

-- Fonctions interdites
select public._test_expect_denied('select public.queue_job(''exports'', ''x'', ''{}''::jsonb, 3, now())');
select public._test_expect_denied('select public.claim_job_batch(''exports'', 10)');
select public._test_expect_denied('select public.mark_job_completed(''00000000-0000-0000-0000-000000000099'')');
select public._test_expect_denied('select public.mark_job_failed(''00000000-0000-0000-0000-000000000099'', ''e'', now())');
select public._test_expect_denied('select public.cancel_job(''00000000-0000-0000-0000-000000000099'')');
select public._test_expect_denied('select public.log_job_transition(''00000000-0000-0000-0000-000000000099'', ''exports'', ''pending'', 1, null, null)');

reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);

select public._test_expect_denied(
  'select count(*) from public.jobs'
);
--    Durcissement 20260918 (security_hardening) : la lecture du catalogue
--    cron_tasks est r�serv�e � authenticated (plus de anon). L'assertion
--    historique "anon PEUT lire" est donc devenue : anon ne PEUT PAS lire.
select public._test_expect_denied(
  'select count(*) from public.cron_tasks'
);

reset role;

-- =============================================================================
-- 13. Vérifications structurelles
-- =============================================================================
select public._test_assert(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'jobs') = true,
  'RLS activée sur jobs'
);
select public._test_assert(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'job_logs') = true,
  'RLS activée sur job_logs'
);
select public._test_assert(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'cron_tasks') = true,
  'RLS activée sur cron_tasks'
);
select public._test_assert(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'cron_executions') = true,
  'RLS activée sur cron_executions'
);

-- Aucune policy sur jobs, job_logs, cron_executions
select public._test_assert(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'jobs') = 0,
  'jobs: aucune policy (server-only)'
);
select public._test_assert(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'job_logs') = 0,
  'job_logs: aucune policy (server-only)'
);
select public._test_assert(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'cron_executions') = 0,
  'cron_executions: aucune policy (server-only)'
);
-- cron_tasks: UNE policy SELECT public
select public._test_assert(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'cron_tasks') = 1,
  'cron_tasks: une policy SELECT public'
);

-- Fonctions exécutables seulement par service_role
select public._test_assert(
  not exists (
    select 1 from information_schema.role_routine_grants g
    where g.routine_schema = 'public'
      and g.privilege_type = 'EXECUTE'
      and g.grantee in ('PUBLIC', 'PUBLIC/authenticated', 'PUBLIC/anon')
      and g.routine_name in (
        'queue_job', 'claim_job_batch', 'mark_job_completed', 'mark_job_failed',
        'cancel_job', 'log_job_transition', 'mark_cron_execution'
      )
  ),
  'fonctions jobs/cron non exécutables par rôles clients'
);

select public._test_assert(
  exists (
    select 1 from information_schema.role_routine_grants g
    where g.routine_schema = 'public'
      and g.privilege_type = 'EXECUTE'
      and g.grantee = 'service_role'
      and g.routine_name in (
        'queue_job', 'claim_job_batch', 'mark_job_completed', 'mark_job_failed',
        'cancel_job', 'log_job_transition', 'mark_cron_execution'
      )
  ),
  'service_role exécute les fonctions jobs/cron'
);

-- =============================================================================
-- 14. Succès
-- =============================================================================
\echo 'JOBS FOUNDATION TESTS PASSED'