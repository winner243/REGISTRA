-- Email outbox tests — file, idempotence, claim, retry, sécurité (RLS)
-- ---------------------------------------------------------------------------
-- Exécuté par la CI (job `db-migrations`) APRÈS `tests/db/billing-tests.sql`
-- (les helpers `_test_assert` / `_test_expect_denied` sont (re)créés ici afin
-- de rester autonomes). Matrice testée :
--
--   File          : queue_email insère une ligne `queued`, claim_email_batch
--                   la passe en `processing` (attempts +1) en la retournant
--   Idempotence   : re-queue du même (type, reference_id) → NULL, aucun doublon
--   Retry         : mark_email_failed planifie next_attempt_at future (plus de
--                   claim immédiat) puis re-claim une fois la fenêtre atteinte
--   Fin de vie    : mark_email_sent clôt la ligne (status sent, sent_at)
--   Sécurité      : RLS activé + AUCUNE policy → authenticated/anon ne voient
--                   AUCUNE ligne ; aucune exécution des fonctions par
--                   authenticated/anon/PUBLIC (réservé à service_role)
-- ---------------------------------------------------------------------------

-- =============================================================================
-- 0. Helpers de test (créés en tant que postgres)
-- =============================================================================

create or replace function public._test_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if p_condition is not true then
    raise exception 'OUTBOX FAILED: %', p_message;
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
    raise exception 'OUTBOX FAILED: refus attendu, mais instruction réussie: %', p_sql;
  exception when insufficient_privilege then
    return;
  end;
end;
$$;

-- =============================================================================
-- 1. File — queue + claim
-- =============================================================================
select public.queue_email(
  'invitation', 'token-1', 'alice@example.com',
  'Invitation', '<p>bonjour</p>', 'bonjour',
  '{"role":"admin"}'::jsonb
) as outbox_q1 \gset

select public._test_assert(
  :'outbox_q1' is not null,
  'queue_email doit retourner l''id de la ligne insérée'
);
select public._test_assert(
  (select count(*) from public.email_outbox e
    where e.type = 'invitation' and e.reference_id = 'token-1'
      and e.recipient = 'alice@example.com'
      and e.status = 'queued' and e.attempts = 0) = 1,
  'queue_email doit insérer une ligne queued avec attempts = 0'
);

--    Claim : passe en processing, attempts +1, retourne la ligne.
select public.claim_email_batch(10) as outbox_claimed \gset

select public._test_assert(
  (select count(*) from public.email_outbox e
    where e.reference_id = 'token-1'
      and e.status = 'processing' and e.attempts = 1) = 1,
  'claim_email_batch doit passer la ligne en processing (attempts +1)'
);

-- =============================================================================
-- 2. Idempotence — même (type, reference_id) → NULL, aucun doublon
-- =============================================================================
select public._test_assert(
  public.queue_email(
    'invitation', 'token-1', 'alice@example.com',
    'Invitation bis', '<p>bis</p>', 'bis',
    '{}'::jsonb
  ) is null,
  're-queue du même (type, reference_id) doit retourner NULL'
);
select public._test_assert(
  (select count(*) from public.email_outbox e
    where e.reference_id = 'token-1') = 1,
  'aucun doublon ne doit être créé pour la même référence'
);

--    Un autre reference_id crée bien une seconde ligne.
select public.queue_email(
  'invitation', 'token-2', 'bob@example.com',
  'Invitation 2', '<p>deux</p>', 'deux',
  '{}'::jsonb
) as outbox_q3 \gset

select public._test_assert(
  :'outbox_q3' is not null,
  'un reference_id distinct doit créer une nouvelle ligne'
);

-- =============================================================================
-- 3. Fin de vie — mark_email_sent
-- =============================================================================
select public.mark_email_sent(:'outbox_q1'::uuid) as outbox_sent \gset

select public._test_assert(
  (select count(*) from public.email_outbox e
    where e.id = :'outbox_q1'::uuid and e.status = 'sent'
      and e.sent_at is not null and e.last_error is null) = 1,
  'mark_email_sent doit clôturer la ligne (sent, sent_at)'
);

--    Une ligne `sent` n''est plus ré-claimée par le worker.
select public._test_assert(
  (select count(*) from public.claim_email_batch(10) c
    where c.id = :'outbox_q1'::uuid) = 0,
  'une ligne sent ne doit plus être réclamée'
);

-- =============================================================================
-- 4. Retry — échec puis re-tentative à la fenêtre suivante
-- =============================================================================
--    token-2 est encore processing (claims par le worker) → on simule un échec.
select public.mark_email_failed(
  :'outbox_q3'::uuid,
  'Resend : 500 (erreur transitoire)',
  now() + interval '1 minute'
) as outbox_failed \gset

select public._test_assert(
  :'outbox_failed',
  'mark_email_failed doit retourner true'
);
select public._test_assert(
  (select count(*) from public.email_outbox e
    where e.id = :'outbox_q3'::uuid and e.status = 'failed'
      and e.last_error like 'Resend : 500%'
      and e.next_attempt_at > now()) = 1,
  'un échec doit passer la ligne en failed avec next_attempt_at futur'
);

--    Fenêtre pas atteinte → le claim ne récupère PAS la ligne.
select public._test_assert(
  (select count(*) from public.claim_email_batch(10) c
    where c.id = :'outbox_q3'::uuid) = 0,
  'hors fenêtre, un email failed ne doit pas être ré-claimé'
);

--    Fenêtre atteinte → re-claim automatique (statut processing, attempts 2).
update public.email_outbox
   set next_attempt_at = now() - interval '1 second'
 where id = :'outbox_q3'::uuid;

select public._test_assert(
  (select count(*) from public.claim_email_batch(10) c
    where c.id = :'outbox_q3'::uuid
      and c.status = 'processing' and c.attempts = 2) = 1,
  'à la fenêtre, un email failed doit être re-claimé (attempts 2)'
);

-- =============================================================================
-- 5. Sécurité — aucune lecture ni exécution côté client
-- =============================================================================
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001', false);

--    Lecture client impossible : ACL révoquée (revoke all) + aucune policy.
--    L'intention « authenticated ne doit voir AUCUNE ligne de la file outbox »
--    est vérifiée sous sa forme la plus forte : la lecture est explicitement
--    refusée (SQLSTATE 42501) au lieu de renvoyer 0 ligne.
select public._test_expect_denied(
  'select count(*) from public.email_outbox'
);

--    Ni écriture, ni exécution des fonctions réservées à service_role.
select public._test_expect_denied(
  format('insert into public.email_outbox (type, reference_id, recipient, subject, body_html)
          values (%L, %L, %L, %L, %L)',
    'hack', 'x1', 'x@example.com', 'x', '<p>x</p>')
);
select public._test_expect_denied(
  format('select public.queue_email(%L, %L, %L, %L, %L, %L, %L::jsonb)',
    'invitation', 'token-x', 'x@example.com', 'x', '<p>x</p>', 'x', '{}')
);
select public._test_expect_denied(
  'select public.claim_email_batch(10)'
);
select public._test_expect_denied(
  format('select public.mark_email_sent(%L)', '00000000-0000-0000-0000-000000000099')
);
select public._test_expect_denied(
  format('select public.mark_email_failed(%L, %L, now())',
    '00000000-0000-0000-0000-000000000099', 'boom')
);

reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);

--    Idem pour anon : lecture explicitement refusée (ACL révoquée, aucune policy).
select public._test_expect_denied(
  'select count(*) from public.email_outbox'
);

-- =============================================================================
-- 6. Vérifications structurelles
-- =============================================================================
reset role;

select public._test_assert(
  (select count(*) from pg_tables t
    where t.schemaname = 'public'
      and t.tablename = 'email_outbox'
      and t.rowsecurity) = 1,
  'RLS doit être activé sur email_outbox'
);

--    Aucune policy : RLS activée sans policy = accès client totalement fermé.
select public._test_assert(
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'email_outbox') = 0,
  'email_outbox ne doit avoir AUCUNE policy (côté serveur strict)'
);

--    PUBLIC / authenticated / anon : aucune exécution des fonctions outbox.
select public._test_assert(
  not exists (
    select 1 from information_schema.role_routine_grants g
    where g.routine_schema = 'public'
      and g.privilege_type = 'EXECUTE'
      and g.grantee in ('PUBLIC', 'PUBLIC/authenticated', 'PUBLIC/anon')
      and g.routine_name in (
        'queue_email', 'claim_email_batch', 'mark_email_sent', 'mark_email_failed'
      )
  ),
  'les fonctions outbox ne doivent être exécutables ni par PUBLIC, ni par les rôles clients'
);

--    service_role (via son rôle propriétaire ici) reste le seul chemin.
select public._test_assert(
  exists (
    select 1 from information_schema.role_routine_grants g
    where g.routine_schema = 'public'
      and g.privilege_type = 'EXECUTE'
      and g.grantee = 'service_role'
      and g.routine_name in (
        'queue_email', 'claim_email_batch', 'mark_email_sent', 'mark_email_failed'
      )
  ),
  'service_role doit exécuter les fonctions outbox'
);

-- =============================================================================
-- 7. Succès
-- =============================================================================
\echo 'EMAIL OUTBOX TESTS PASSED'