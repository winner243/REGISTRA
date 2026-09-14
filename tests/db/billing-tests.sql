-- Billing tests — plans, entitlements, limites, usage, sécurité (RLS)
-- ---------------------------------------------------------------------------
-- Exécuté par la CI (job `db-migrations`) APRÈS `tests/db/isolation-tests.sql`
-- (les helpers `_test_assert` / `_test_expect_denied` sont (re)créés ici afin
-- de rester autonomes). Matrice testée :
--
--   Entitlements : feature autorisée / interdite / absente de l'abonnement
--   Plans        : plan déterminé, changement de plan reflété, downgrade
--   Limites      : usage < limite OK ; usage = limite (nouvelle unité REFUSÉE) ;
--                  dépassement REFUSÉ (usage_limit_exceeded)
--   Usage        : consume atomique, clé non bornée, rollover de période
--   Authorization: membre autorisé / refusé ; A ne voit PAS le billing de B
--   Sécurité     : l'utilisateur ne peut modifier abonnement, entitlements,
--                  limites, ni falsifier son usage (aucune écriture directe)
--   Billing      : organisation sans abonnement → comportement défini ;
--                  abonnement expiré / cancelé → comportement défini
--
-- Fixtures : alice (…001) OWNER de Billing Alpha, bob (…002) OWNER de Billing
-- Beta, dave (…004) OWNER de Billing Gamma (sans abonnement), carol (…003)
-- invitée MEMBER de Billing Alpha.
-- ---------------------------------------------------------------------------

-- =============================================================================
-- 0. Helpers de test (créés en tant que postgres, AVANT changement de rôle)
-- =============================================================================

create or replace function public._test_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if p_condition is not true then
    raise exception 'BILLING FAILED: %', p_message;
  end if;
end;
$$;

--    Assure qu'une instruction ÉCHOUE (SQLSTATE 42501).
create or replace function public._test_expect_denied(p_sql text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
    raise exception 'BILLING FAILED: refus attendu, mais instruction réussie: %', p_sql;
  exception when insufficient_privilege then
    return;
  end;
end;
$$;

--    Assure qu'une instruction ÉCHOUE avec un SQLSTATE donné
--    (ex. P0001 = raise_exception pour les erreurs métier du moteur).
--    Le « succès inattendu » est signalé HORS du bloc EXCEPTION : un `raise`
--    interne y serait capté par `when others` (même SQLSTATE P0001) et ferait
--    passer la vérification à tort sur une instruction qui devait échouer.
create or replace function public._test_expect_sqlstate(p_sql text, p_sqlstate text default 'P0001')
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_sqlstate then
      return;
    end if;
    raise exception 'BILLING FAILED: SQLSTATE % attendu, % obtenu: %', p_sqlstate, sqlstate, p_sql;
  end;
  raise exception 'BILLING FAILED: échec (% ) attendu, mais instruction réussie: %', p_sqlstate, p_sql;
end;
$$;

-- =============================================================================
-- 1. Fixtures utilisateurs (Auth)
-- =============================================================================
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000004', 'dave@example.com')
on conflict (id) do nothing;

-- =============================================================================
-- 2. Création des organisations de test
-- =============================================================================
set role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001', false);

--    ALPHA (alice, owner) — abonnement PRO actif seedé en section 4.
insert into public.organizations (name, created_by)
values ('Billing Alpha', '00000000-0000-0000-0000-000000000001')
returning id \gset billing_a_

select public._test_assert(
  (select count(*) from public.memberships m
    where m.organization_id = :'billing_a_id'::uuid
      and m.user_id = '00000000-0000-0000-0000-000000000001'
      and m.role = 'owner') = 1,
  'le trigger doit créer l''appartenance owner d''alice sur Billing Alpha'
);

select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000002', false);

--    BETA (bob, owner) — abonnement PRO actif seedé en section 4.
insert into public.organizations (name, created_by)
values ('Billing Beta', '00000000-0000-0000-0000-000000000002')
returning id \gset billing_b_

select public._test_assert(
  (select count(*) from public.memberships m
    where m.organization_id = :'billing_b_id'::uuid
      and m.user_id = '00000000-0000-0000-0000-000000000002'
      and m.role = 'owner') = 1,
  'le trigger doit créer l''appartenance owner de bob sur Billing Beta'
);

select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000004', false);

--    GAMMA (dave, owner) — SANS abonnement.
insert into public.organizations (name, created_by)
values ('Billing Gamma', '00000000-0000-0000-0000-000000000004')
returning id \gset billing_g_

select public._test_assert(
  (select count(*) from public.memberships m
    where m.organization_id = :'billing_g_id'::uuid
      and m.user_id = '00000000-0000-0000-0000-000000000004'
      and m.role = 'owner') = 1,
  'le trigger doit créer l''appartenance owner de dave sur Billing Gamma'
);

-- =============================================================================
-- 3. CAROL rejoint Billing Alpha en tant que MEMBER (via invitation)
-- =============================================================================
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001', false);

select public.create_invitation(:'billing_a_id'::uuid, 'carol@example.com', 'member')
  as token \gset inv_bc_

select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000003', false);

select public.accept_invitation(:'inv_bc_token') as org_id \gset acc_bc_

select public._test_assert(
  :'acc_bc_org_id' = :'billing_a_id',
  'carol doit rejoindre Billing Alpha'
);

select public._test_assert(
  (select count(*) from public.memberships m
    where m.organization_id = :'billing_a_id'::uuid
      and m.user_id = '00000000-0000-0000-0000-000000000003'
      and m.role = 'member') = 1,
  'carol doit être MEMBER (et non owner) de Billing Alpha'
);

-- =============================================================================
-- 4. Seeds d'abonnements (réservé au backend / postgres, jamais au client :
--    pas de policy d'écriture sur `subscriptions`).
--    Alpha et Beta → plan `pro` actif. Gamma → aucun.
-- =============================================================================
reset role;

insert into public.subscriptions (
  organization_id, plan_code, status, current_period_start, current_period_end
)
values (
  (:'billing_a_id')::uuid, 'pro', 'active',
  now() - interval '1 day', now() + interval '30 days'
),
(
  (:'billing_b_id')::uuid, 'pro', 'active',
  now() - interval '1 day', now() + interval '30 days'
);

-- =============================================================================
-- 5. Entitlements — features activées / interdites
-- =============================================================================
set role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001', false);

--    Plan PRO : analytics / export / team activés, api non.
select public._test_assert(
  public.get_organization_plan(:'billing_a_id'::uuid) = 'pro',
  'le plan effectif de Billing Alpha doit être pro'
);

select public._test_assert(
  public.can_use_feature(:'billing_a_id'::uuid, 'feature.export'),
  'feature.export doit être autorisée sur pro'
);
select public._test_assert(
  public.can_use_feature(:'billing_a_id'::uuid, 'feature.analytics'),
  'feature.analytics doit être autorisée sur pro'
);
select public._test_assert(
  public.can_use_feature(:'billing_a_id'::uuid, 'feature.team'),
  'feature.team doit être autorisée sur pro'
);
select public._test_assert(
  not public.can_use_feature(:'billing_a_id'::uuid, 'feature.api'),
  'feature.api doit être REFUSÉE sur pro'
);

--    Cross-organisation : alice ne peut PAS utiliser les features de Beta.
select public._test_assert(
  not public.can_use_feature(:'billing_b_id'::uuid, 'feature.export'),
  'alice ne doit pas exploiter les features de Billing Beta (cross-org)'
);

--    Organisation sans abonnement : AUCUNE feature.
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000004', false);

select public._test_assert(
  public.get_organization_plan(:'billing_g_id'::uuid) is null,
  'sans abonnement, le plan effectif doit être NULL'
);
select public._test_assert(
  not public.can_use_feature(:'billing_g_id'::uuid, 'feature.export'),
  'sans abonnement, aucune feature ne doit être autorisée'
);
select public._test_assert(
  public.get_plan_limit(:'billing_g_id'::uuid, 'exports.monthly') is null,
  'sans abonnement, aucune limite ne doit être définie'
);

--    Membre simple : carol peut utiliser les features du plan (usage métier),
--    même sans `billing.read`.
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000003', false);

select public._test_assert(
  public.can_use_feature(:'billing_a_id'::uuid, 'feature.export'),
  'un MEMBER doit pouvoir utiliser une feature incluse dans le plan'
);

-- =============================================================================
-- 6. Limites et usage (alice, owner de Billing Alpha)
-- =============================================================================
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001', false);

select public._test_assert(
  public.get_plan_limit(:'billing_a_id'::uuid, 'exports.monthly') = 100,
  'la limite exports.monthly du plan pro doit être 100'
);
select public._test_assert(
  public.get_usage(:'billing_a_id'::uuid, 'exports.monthly') = 0,
  'l''usage exports.monthly doit démarrer à 0'
);
select public._test_assert(
  public.can_consume_usage(:'billing_a_id'::uuid, 'exports.monthly', 1),
  'une consommation de 1 sous la limite doit être acceptée (pré-vérification)'
);

--    Consommation séquentielle : 40 puis 60 → 100, soit LA LIMITE.
select public._test_assert(
  public.consume_usage(:'billing_a_id'::uuid, 'exports.monthly', 40) = 40,
  'consommer 40 doit porter l''usage à 40'
);
select public._test_assert(
  public.consume_usage(:'billing_a_id'::uuid, 'exports.monthly', 60) = 100,
  'consommer 60 doit porter l''usage à 100 (= limite, autorisé)'
);
select public._test_assert(
  public.get_usage(:'billing_a_id'::uuid, 'exports.monthly') = 100,
  'l''usage aggregé doit être 100'
);

--    Usage = LIMITE : une nouvelle unité positive est REFUSÉE.
select public._test_assert(
  not public.can_consume_usage(:'billing_a_id'::uuid, 'exports.monthly', 1),
  'à usage = limite, une nouvelle unité doit être refusée (pré-vérification)'
);
select public._test_assert(
  public.can_consume_usage(:'billing_a_id'::uuid, 'exports.monthly', 0),
  'une vérification à quantité 0 reste acceptée à usage = limite'
);
select public._test_expect_sqlstate(
  format('select public.consume_usage(%L::uuid, %L, 1)', :'billing_a_id', 'exports.monthly')
);

--    Journal append-only : 2 événements pour les consommations réussies.
select public._test_assert(
  (select count(*) from public.usage_events ue
    where ue.organization_id = :'billing_a_id'::uuid
      and ue.usage_key = 'exports.monthly') = 2,
  'le journal doit contenir 2 événements d''export'
);

--    Clé SANS limite définie sur pro (ex. invites.monthly) : non bornée.
select public._test_assert(
  public.get_plan_limit(:'billing_a_id'::uuid, 'invites.monthly') is null,
  'une clé non définie dans le plan doit avoir une limite NULL'
);
select public._test_assert(
  public.can_consume_usage(:'billing_a_id'::uuid, 'invites.monthly', 1),
  'une clé non bornée doit être consommable'
);
select public._test_assert(
  public.consume_usage(:'billing_a_id'::uuid, 'invites.monthly', 1) = 1,
  'consommer sur une clé non bornée doit enregistrer la quantité'
);
select public._test_assert(
  public.consume_usage(:'billing_a_id'::uuid, 'invites.monthly', 1) = 2,
  'la clé non bornée doit cumuler les quantités'
);

--    Membre simple : carol peut faire consommer l'organisation (feature active).
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000003', false);

select public._test_assert(
  public.consume_usage(:'billing_a_id'::uuid, 'invites.monthly', 1) = 3,
  'un MEMBER doit pouvoir enregistrer une consommation au nom de l''organisation'
);

-- =============================================================================
-- 7. Autorisation (RLS) — lecture du billing
-- =============================================================================
--    alice (owner) voit SON abonnement ; pas ceux de Beta/Gamma.
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001', false);

select public._test_assert(
  (select count(*) from public.subscriptions s
    where s.organization_id = :'billing_a_id'::uuid) = 1,
  'alice doit voir l''abonnement de Billing Alpha'
);
select public._test_assert(
  (select count(*) from public.subscriptions s
    where s.organization_id IN (:'billing_b_id'::uuid, :'billing_g_id'::uuid)) = 0,
  'alice ne doit voir AUCUN abonnement de Beta ni Gamma'
);

--    bob (owner) ne voit pas l'abonnement d'Alpha.
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000002', false);

select public._test_assert(
  (select count(*) from public.subscriptions s
    where s.organization_id = :'billing_a_id'::uuid) = 0,
  'bob ne doit pas voir l''abonnement de Billing Alpha'
);

--    carol (MEMBER) n'a PAS billing.read : elle ne voit pas l'abonnement,
--    pas plus que l'usage d'Alpha.
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000003', false);

select public._test_assert(
  (select count(*) from public.subscriptions s
    where s.organization_id = :'billing_a_id'::uuid) = 0,
  'un MEMBER ne doit pas voir l''abonnement (billing.read requis)'
);
select public._test_assert(
  (select count(*) from public.usage u
    where u.organization_id = :'billing_a_id'::uuid) = 0,
  'un MEMBER ne doit pas voir l''usage (billing.read requis)'
);

-- =============================================================================
-- 8. Sécurité — aucune écriture client possible
-- =============================================================================
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001', false);

--    Abonnement : ni création, ni modification, ni suppression.
select public._test_expect_denied(
  format('insert into public.subscriptions (organization_id, plan_code, status, current_period_start, current_period_end)
          values (%L::uuid, %L, %L, now(), now() + interval %L)',
    :'billing_a_id', 'business', 'active', '30 days')
);
select public._test_expect_denied(
  format('update public.subscriptions set plan_code = %L where organization_id = %L::uuid',
    'business', :'billing_a_id')
);
select public._test_expect_denied(
  format('delete from public.subscriptions where organization_id = %L::uuid', :'billing_a_id')
);

--    Même tentative cross-org : alice ne peut pas modifier l'abonnement de Beta.
select public._test_expect_denied(
  format('update public.subscriptions set plan_code = %L where organization_id = %L::uuid',
    'free', :'billing_b_id')
);

--    Cross-org : alice ne peut pas consommer l'usage de Billing Beta
--    (is_member → insufficient_permission, SQLSTATE 42501).
select public._test_expect_sqlstate(
  format('select public.consume_usage(%L::uuid, %L, 1)', :'billing_b_id', 'exports.monthly'),
  '42501'
);

--    Usage : aucune écriture directe (ni compteur, ni journal).
select public._test_expect_denied(
  format('insert into public.usage (organization_id, usage_key, period_start, period_end, quantity)
          values (%L::uuid, %L, now(), now() + interval %L, 100)',
    :'billing_a_id', 'exports.monthly', '30 days')
);
select public._test_expect_denied(
  format('update public.usage set quantity = 999999 where organization_id = %L::uuid', :'billing_a_id')
);
select public._test_expect_denied(
  format('insert into public.usage_events (organization_id, usage_key, period_start, period_end, amount)
          values (%L::uuid, %L, now(), now() + interval %L, 999999)',
    :'billing_a_id', 'exports.monthly', '30 days')
);
select public._test_expect_denied(
  format('delete from public.usage_events where organization_id = %L::uuid', :'billing_a_id')
);

--    Catalogues : lecture publique, AUCUNE écriture (entitlements/limites).
select public._test_expect_denied(
  format('insert into public.plans (code, name) values (%L, %L)', 'hacked', 'Hacked')
);
select public._test_expect_denied(
  format('update public.plans set is_active = false where code = %L', 'pro')
);
select public._test_expect_denied(
  format('insert into public.plan_features (plan_code, feature_code) values (%L, %L)', 'free', 'feature.api')
);
select public._test_expect_denied(
  format('insert into public.plan_limits (plan_code, limit_key, limit_value) values (%L, %L, %L)',
    'free', 'projects.max', 999)
);
select public._test_expect_denied(
  format('insert into public.features (code, name) values (%L, %L)', 'feature.hacked', 'Hacked')
);

-- =============================================================================
-- 9. Billing — plan change reflété, puis downgrade
-- =============================================================================
reset role;

--    Beyoncé… non : upgrade de Billing Alpha pro → business (backend).
update public.subscriptions
   set plan_code = 'business'
 where organization_id = :'billing_a_id'::uuid;

set role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001', false);

select public._test_assert(
  public.get_organization_plan(:'billing_a_id'::uuid) = 'business',
  'le changement de plan doit être reflété par get_organization_plan'
);
select public._test_assert(
  public.can_use_feature(:'billing_a_id'::uuid, 'feature.api'),
  'feature.api doit être autorisée après l''upgrade vers business'
);
select public._test_assert(
  public.get_plan_limit(:'billing_a_id'::uuid, 'exports.monthly') = 1000,
  'la limite exports.monthly doit passer à 1000 sur business'
);
select public._test_assert(
  public.can_consume_usage(:'billing_a_id'::uuid, 'exports.monthly', 1),
  '100 exports utilisés + 1 doit rester sous la limite 1000'
);
select public._test_assert(
  public.consume_usage(:'billing_a_id'::uuid, 'exports.monthly', 1) = 101,
  'la consommation doit être acceptée après upgrade (usage = 101)'
);

--    Vue dashboard : limites / usage / restant.
select public._test_assert(
  (select count(*) from public.plan_limits_status(:'billing_a_id'::uuid)
    where limit_key = 'exports.monthly'
      and limit_value = 1000 and used = 101 and remaining = 899) = 1,
  'plan_limits_status doit exposer limite 1000 / usage 101 / restant 899'
);

--    Downgrade business → free (exports.monthly = 5, usage = 101).
reset role;

update public.subscriptions
   set plan_code = 'free'
 where organization_id = :'billing_a_id'::uuid;

set role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001', false);

select public._test_assert(
  public.get_organization_plan(:'billing_a_id'::uuid) = 'free',
  'le downgrade doit être reflété par get_organization_plan'
);
select public._test_assert(
  public.get_plan_limit(:'billing_a_id'::uuid, 'exports.monthly') = 5,
  'la limite exports.monthly doit retomber à 5 sur free'
);
select public._test_assert(
  not public.can_consume_usage(:'billing_a_id'::uuid, 'exports.monthly', 1),
  'usage 101 > limite 5 : une nouvelle consommation doit être refusée (pré-vérification)'
);
select public._test_expect_sqlstate(
  format('select public.consume_usage(%L::uuid, %L, 1)', :'billing_a_id', 'exports.monthly')
);
select public._test_assert(
  not public.can_use_feature(:'billing_a_id'::uuid, 'feature.analytics'),
  'feature.analytics doit être REFUSÉE après le downgrade vers free'
);
select public._test_assert(
  public.can_use_feature(:'billing_a_id'::uuid, 'feature.export'),
  'feature.export reste autorisée sur free (entitlement du plan free)'
);

-- =============================================================================
-- 10. Billing — abonnement expiré / cancelé : comportement défini
-- =============================================================================
reset role;

--    Beta : période expirée (statut toujours `active` mais période passée).
update public.subscriptions
   set current_period_end = now() - interval '1 day'
 where organization_id = :'billing_b_id'::uuid;

set role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000002', false);

select public._test_assert(
  public.get_organization_plan(:'billing_b_id'::uuid) is null,
  'un abonnement expiré doit donner un plan NULL'
);
select public._test_assert(
  not public.can_use_feature(:'billing_b_id'::uuid, 'feature.export'),
  'un abonnement expiré ne doit autoriser AUCUNE feature'
);
select public._test_assert(
  public.get_usage(:'billing_b_id'::uuid, 'exports.monthly') = 0,
  'un abonnement expiré doit rapporter un usage nul'
);
select public._test_assert(
  not public.can_consume_usage(:'billing_b_id'::uuid, 'exports.monthly', 1),
  'un abonnement expiré doit refuser toute consommation (pré-vérification)'
);
select public._test_expect_sqlstate(
  format('select public.consume_usage(%L::uuid, %L, 1)', :'billing_b_id', 'exports.monthly')
);

--    Variante : statut `canceled` (période pourtant future) → non courant.
reset role;

update public.subscriptions
   set status = 'canceled',
       current_period_end = now() + interval '30 days'
 where organization_id = :'billing_b_id'::uuid;

set role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000002', false);

select public._test_assert(
  not public.can_use_feature(:'billing_b_id'::uuid, 'feature.export'),
  'un abonnement canceled ne doit autoriser AUCUNE feature'
);
select public._test_expect_sqlstate(
  format('select public.consume_usage(%L::uuid, %L, 1)', :'billing_b_id', 'exports.monthly')
);

-- =============================================================================
-- 11. Isolation sur le rôle ANONYME
-- =============================================================================
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);

select public._test_assert(
  (select count(*) from public.subscriptions) = 0,
  'anon ne doit voir aucun abonnement'
);
select public._test_assert(
  (select count(*) from public.usage) = 0,
  'anon ne doit voir aucun usage'
);
select public._test_assert(
  (select count(*) from public.plans) = 3,
  'anon peut lire le catalogue public des plans'
);

reset role;

-- =============================================================================
-- 12. Vérifications structurelles (RLS activé, permissions et fonctions)
-- =============================================================================
select public._test_assert(
  (select count(*) from pg_tables t
    where t.schemaname = 'public'
      and t.tablename in (
        'plans', 'features', 'plan_features', 'plan_limits',
        'subscriptions', 'usage', 'usage_events'
      )
      and t.relrowsecurity) = 7,
  'RLS doit être activé sur les 7 tables du billing engine'
);

select public._test_assert(
  exists (select 1 from public.permissions p where p.name = 'billing.read'),
  'la permission billing.read doit être seedée'
);
select public._test_assert(
  exists (select 1 from public.permissions p where p.name = 'billing.manage'),
  'la permission billing.manage doit être seedée'
);
select public._test_assert(
  exists (select 1 from public.role_permissions rp
    where rp.role = 'owner' and rp.permission = 'billing.read'),
  'owner doit porter billing.read'
);
select public._test_assert(
  not exists (select 1 from public.role_permissions rp
    where rp.role = 'member' and rp.permission = 'billing.read'),
  'member ne doit PAS porter billing.read'
);

--    Le rôle `anon` ne doit exécuter AUCUNE fonction du moteur.
select public._test_assert(
  not exists (
    select 1 from information_schema.role_routine_grants g
    where g.routine_schema = 'public'
      and g.privilege_type = 'EXECUTE'
      and g.grantee = 'PUBLIC'
      and g.routine_name in (
        'get_organization_plan', 'can_use_feature', 'get_plan_limit',
        'get_usage', 'can_consume_usage', 'consume_usage', 'plan_limits_status'
      )
  ),
  'aucune fonction exposée du moteur ne doit être exécutable par PUBLIC'
);

-- =============================================================================
-- 13. Succès
-- =============================================================================
\echo 'BILLING TESTS PASSED'