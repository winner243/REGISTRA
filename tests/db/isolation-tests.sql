-- Isolation tests — multi-tenancy (RLS)
-- ---------------------------------------------------------------------------
-- Exécuté par la CI (job `db-migrations`) après application des migrations,
-- sur une base contenant les stubs Supabase. Aucune opération ne doit réussir
-- hors de la matrice d'isolation attendue ; tout échec = phase BLOQUÉE.
--
-- Matrice obligatoire (SELECT / INSERT / UPDATE / DELETE) :
--   User A → Organisation A : AUTORISÉ
--   User A → Organisation B : REFUSÉ
--   User B → Organisation B : AUTORISÉ
--   User B → Organisation A : REFUSÉ
--
-- Fixtures :
--   alice (…001) = membre OWNER de Org A
--   bob   (…002) = membre OWNER de Org B
--   carol (…003) = invitée puis ADMIN de Org A
--
-- Principe : chaque scénario joue un acteur via
--   set role authenticated + set_config('request.jwt.claim.sub', …),
--   puis vérifie le comportement RLS effectif. ATTENTION : la preuve qu'une
--   suppression/écriture cross-org a été réfutée doit être faite DU CÔTÉ du
--   propriétaire (l'attaquant ne peut de toute façon pas voir la ligne).
-- ---------------------------------------------------------------------------

-- =============================================================================
-- 0. Helpers de test (créés en tant que postgres, AVANT changement de rôle).
--    Ces helpers ne font pas partie du Starter : ils n'existent que sur la
--    base de validation CI.
-- =============================================================================

create or replace function public._test_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if p_condition is not true then
    raise exception 'ISOLATION FAILED: %', p_message;
  end if;
end;
$$;

--    Assure qu'une instruction ÉCHOUE (SQLSTATE 42501 = privilège insuffisant /
--    policy RLS / contrainte du dernier owner). Si elle réussit → échec du test.
create or replace function public._test_expect_denied(p_sql text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
    raise exception 'ISOLATION FAILED: refus attendu, mais instruction réussie: %', p_sql;
  exception when insufficient_privilege then
    return;
  end;
end;
$$;

-- =============================================================================
-- 1. Fixtures utilisateurs (Auth)
-- =============================================================================
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'alice@example.com'),
  ('00000000-0000-0000-0000-000000000002', 'bob@example.com'),
  ('00000000-0000-0000-0000-000000000003', 'carol@example.com')
on conflict (id) do nothing;

-- =============================================================================
-- 2. Scénario ALICE — création de Org A (INSERT A→A autorisé)
-- =============================================================================
set role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001', false);

insert into public.organizations (name, created_by)
values ('Org A', '00000000-0000-0000-0000-000000000001')
returning id \gset org_a_

--    L'appartenance OWNER doit avoir été créée automatiquement par le trigger.
select public._test_assert(
  exists (
    select 1 from public.memberships m
    where m.organization_id = :'org_a_id'::uuid
      and m.user_id = '00000000-0000-0000-0000-000000000001'
      and m.role = 'owner'
  ),
  'le trigger doit créer l''appartenance owner du créateur'
);

--    SELECT A→A autorisé.
select public._test_assert(
  (select count(*) from public.organizations o where o.id = :'org_a_id'::uuid) = 1,
  'SELECT A→A sur organizations doit être autorisé'
);

--    Moteur de permission.
select public._test_assert(
  public.has_permission(:'org_a_id'::uuid, 'organization.read'),
  'owner doit avoir organization.read'
);
select public._test_assert(
  public.has_permission(:'org_a_id'::uuid, 'organization.delete'),
  'owner doit avoir organization.delete'
);

-- =============================================================================
-- 3. Scénario BOB — création de Org B (INSERT B→B autorisé)
-- =============================================================================
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000002', false);

insert into public.organizations (name, created_by)
values ('Org B', '00000000-0000-0000-0000-000000000002')
returning id \gset org_b_

select public._test_assert(
  exists (
    select 1 from public.memberships m
    where m.organization_id = :'org_b_id'::uuid
      and m.user_id = '00000000-0000-0000-0000-000000000002'
      and m.role = 'owner'
  ),
  'le trigger doit créer l''appartenance owner de bob'
);

--    SELECT B→B autorisé / SELECT B→A REFUSÉ.
select public._test_assert(
  (select count(*) from public.organizations o where o.id = :'org_b_id'::uuid) = 1,
  'SELECT B→B sur organizations doit être autorisé'
);
select public._test_assert(
  (select count(*) from public.organizations o where o.id = :'org_a_id'::uuid) = 0,
  'SELECT B→A sur organizations doit être REFUSÉ (isolation)'
);

select public._test_assert(
  not public.has_permission(:'org_a_id'::uuid, 'organization.delete'),
  'bob ne doit PAS avoir organization.delete sur Org A'
);

-- =============================================================================
-- 4. Scénario ALICE — matrice d'isolation sur Org B (REFUS)
-- =============================================================================
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001', false);

--    SELECT A→B REFUSÉ.
select public._test_assert(
  (select count(*) from public.organizations o where o.id = :'org_b_id'::uuid) = 0,
  'SELECT A→B sur organizations doit être REFUSÉ (isolation)'
);

--    UPDATE A→A autorisé.
update public.organizations
   set name = 'Org A renamed'
 where id = :'org_a_id'::uuid;

select public._test_assert(
  (select count(*) from public.organizations o
    where o.id = :'org_a_id'::uuid and o.name = 'Org A renamed') = 1,
  'UPDATE A→A sur organizations doit être autorisé'
);

--    UPDATE A→B REFUSÉ (silencieux sous RLS : 0 ligne modifiée).
update public.organizations
   set name = 'Org B hacked'
 where id = :'org_b_id'::uuid;

--    Preuve côté propriétaire : Org B est intacte.
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000002', false);

select public._test_assert(
  (select count(*) from public.organizations o
    where o.id = :'org_b_id'::uuid and o.name = 'Org B') = 1,
  'UPDATE A→B doit être REFUSÉ : Org B doit être intacte'
);

--    DELETE A→B REFUSÉ.
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001', false);

delete from public.organizations o where o.id = :'org_b_id'::uuid;

select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000002', false);

select public._test_assert(
  (select count(*) from public.organizations o where o.id = :'org_b_id'::uuid) = 1,
  'DELETE A→B doit être REFUSÉ : Org B doit exister'
);

--    Retour acteur alice pour la suite du scénario.
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001', false);

--    INSERT cross-contexte REFUSÉ : alice ne peut pas créer une organisation
--    appartenant à bob (with check : created_by = auth.uid()).
select public._test_expect_denied(
  format(
    'insert into public.organizations (name, created_by) values (%L, %L)',
    'Org de bob par alice',
    '00000000-0000-0000-0000-000000000002'
  )
);

--    INSERT direct sur memberships REFUSÉ (aucune policy d'insertion) —
--    l'ajout d'un membre passe uniquement par l'acceptation d'une
--    invitation (fonction security definer).
select public._test_expect_denied(
  format(
    'insert into public.memberships (organization_id, user_id, role) values (%L::uuid, %L, %L)',
    :'org_b_id',
    '00000000-0000-0000-0000-000000000001',
    'member'
  )
);

--    Invitation A→A autorisée (alice invite carol sur Org A).
select public.create_invitation(:'org_a_id'::uuid, 'carol@example.com', 'member')
  as token \gset inv_

select public._test_assert(
  exists (
    select 1 from public.invitations i
    where i.organization_id = :'org_a_id'::uuid
      and i.email = 'carol@example.com'
      and i.status = 'pending'
  ),
  'l''invitation de carol doit être en attente sur Org A'
);

--    Invitation A→B REFUSÉE : alice n''a pas members.invite sur Org B.
select public._test_expect_denied(
  format(
    'select public.create_invitation(%L::uuid, %L, %L)',
    :'org_b_id',
    'someone@example.com',
    'member'
  )
);

-- =============================================================================
-- 5. Scénario CAROL — acceptation d'invitation, puis vérifications de rôle
-- =============================================================================
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000003', false);

--    Avant acceptation : carol ne voit AUCUNE organisation.
select public._test_assert(
  (select count(*) from public.organizations o where o.id = :'org_a_id'::uuid) = 0,
  'carol ne doit voir aucune organisation avant acceptation'
);

--    Acceptation : retourne l'id de l'organisation rejointe.
select public.accept_invitation(:'inv_token') as org_id \gset acc_

select public._test_assert(
  :'acc_org_id' = :'org_a_id',
  'accept_invitation doit retourner l''id de Org A'
);

select public._test_assert(
  exists (
    select 1 from public.memberships m
    where m.organization_id = :'org_a_id'::uuid
      and m.user_id = '00000000-0000-0000-0000-000000000003'
      and m.role = 'member'
  ),
  'carol doit être membre (role member) de Org A'
);

--    Après acceptation : carol voit Org A (SELECT A→C autorisé).
select public._test_assert(
  (select count(*) from public.organizations o where o.id = :'org_a_id'::uuid) = 1,
  'carol doit voir Org A après acceptation'
);

--    Matrice de permissions de carol (role member).
select public._test_assert(
  public.has_permission(:'org_a_id'::uuid, 'members.read'),
  'member doit avoir members.read'
);
select public._test_assert(
  not public.has_permission(:'org_a_id'::uuid, 'organization.update'),
  'member ne doit PAS avoir organization.update'
);

--    UPDATE A→A en tant que membre : REFUSÉ (carol n'a pas organization.update).
update public.organizations
   set name = 'Org A by carol'
 where id = :'org_a_id'::uuid;

select public._test_assert(
  (select count(*) from public.organizations o
    where o.id = :'org_a_id'::uuid and o.name = 'Org A by carol') = 0,
  'carol (member) ne doit pas pouvoir renommer Org A'
);

--    Réutilisation du token : REFUSÉE (déjà acceptée).
select public._test_expect_denied(
  format('select public.accept_invitation(%L)', :'inv_token')
);

-- =============================================================================
-- 6. Scénario ALICE — gestion des membres (members.update)
-- =============================================================================
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001', false);

--    Promotion carol member → admin (A→A autorisé, owner a members.update).
update public.memberships
   set role = 'admin'
 where organization_id = :'org_a_id'::uuid
   and user_id = '00000000-0000-0000-0000-000000000003';

select public._test_assert(
  (select count(*) from public.memberships m
    where m.organization_id = :'org_a_id'::uuid
      and m.user_id = '00000000-0000-0000-0000-000000000003'
      and m.role = 'admin') = 1,
  'owner doit pouvoir promouvoir un membre en admin'
);

--    Réaffectation cross-contexte REFUSÉE : alice ne peut pas changer le rôle
--    d'un membre de Org B (membre → admin). Silencieux sous RLS.
update public.memberships
   set role = 'admin'
 where organization_id = :'org_b_id'::uuid
   and user_id = '00000000-0000-0000-0000-000000000002';

--    Preuve côté propriétaire : bob est toujours owner de Org B.
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000002', false);

select public._test_assert(
  (select count(*) from public.memberships m
    where m.organization_id = :'org_b_id'::uuid
      and m.user_id = '00000000-0000-0000-0000-000000000002'
      and m.role = 'owner') = 1,
  'le rôle de bob sur Org B ne doit pas être modifiable par alice'
);

-- =============================================================================
-- 7. Révocation d'invitation + comptes sans compte Auth
-- =============================================================================
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001', false);

--    alice invite dave.
select public.create_invitation(:'org_a_id'::uuid, 'dave@example.com', 'member')
  as token \gset inv_dave_token_

select id from public.invitations i
where i.organization_id = :'org_a_id'::uuid
  and i.email = 'dave@example.com'
  and i.status = 'pending' \gset inv_dave_

--    bob tente de révoquer l'invitation de dave (cross-contexte REFUS).
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000002', false);

select public._test_expect_denied(
  format('select public.revoke_invitation(%L::uuid)', :'inv_dave_id')
);

--    alice révoque l'invitation de dave (A→A autorisé).
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001', false);

select public._test_assert(
  public.revoke_invitation(:'inv_dave_id'::uuid),
  'revoke_invitation doit retourner true pour une invitation pending'
);

select public._test_assert(
  (select count(*) from public.invitations i
    where i.id = :'inv_dave_id'::uuid and i.status = 'revoked') = 1,
  'l''invitation de dave doit être révoquée'
);

--    Invitation pour un email sans compte Auth : l'acceptation doit échouer.
select public.create_invitation(:'org_a_id'::uuid, 'ghost@example.com', 'member')
  as token \gset inv_ghost_

select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000003', false);

select public._test_expect_denied(
  format('select public.accept_invitation(%L)', :'inv_ghost_token')
);

-- =============================================================================
-- 8. Protection du dernier OWNER
-- =============================================================================
--    bob, seul owner de Org B, ne peut ni quitter ni se rétrograder.
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000002', false);

select public._test_expect_denied(
  format(
    'delete from public.memberships where organization_id = %L::uuid and user_id = %L::uuid',
    :'org_b_id',
    '00000000-0000-0000-0000-000000000002'
  )
);

select public._test_expect_denied(
  format(
    'update public.memberships set role = %L where organization_id = %L::uuid and user_id = %L::uuid',
    'member',
    :'org_b_id',
    '00000000-0000-0000-0000-000000000002'
  )
);

--    alice, seul owner de Org A, ne peut pas se rétrograder.
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001', false);

select public._test_expect_denied(
  format(
    'update public.memberships set role = %L where organization_id = %L::uuid and user_id = %L::uuid',
    'member',
    :'org_a_id',
    '00000000-0000-0000-0000-000000000001'
  )
);

-- =============================================================================
-- 9. DELETE A→A / B→B autorisés (orgs jetables) avec purge en cascade,
--    et DELETE B→A REFUSÉ avec preuve côté propriétaire
-- =============================================================================
--    alice : créer puis supprimer une org jetable (DELETE A→A autorisé).
insert into public.organizations (name, created_by)
values ('Org A disposable', '00000000-0000-0000-0000-000000000001')
returning id \gset del_a_

delete from public.organizations o
 where o.id = :'del_a_id'::uuid
returning id \gset del_a_del_

select public._test_assert(
  :'del_a_del_id' = :'del_a_id',
  'le DELETE A→A doit supprimer l''organisation jetable'
);

select public._test_assert(
  (select count(*) from public.memberships m where m.organization_id = :'del_a_id'::uuid) = 0,
  'la suppression d''une organisation doit purger ses appartenances (cascade)'
);

--    bob : idem (DELETE B→B autorisé).
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000002', false);

insert into public.organizations (name, created_by)
values ('Org B disposable', '00000000-0000-0000-0000-000000000002')
returning id \gset del_b_

delete from public.organizations o
 where o.id = :'del_b_id'::uuid
returning id \gset del_b_del_

select public._test_assert(
  :'del_b_del_id' = :'del_b_id',
  'le DELETE B→B doit supprimer l''organisation jetable'
);

select public._test_assert(
  (select count(*) from public.memberships m where m.organization_id = :'del_b_id'::uuid) = 0,
  'la suppression d''une organisation doit purger ses appartenances (cascade)'
);

--    DELETE B→A REFUSÉ : bob tente de supprimer Org A.
delete from public.organizations o
 where o.id = :'org_a_id'::uuid;

--    Preuve côté propriétaire (alice) : Org A existe toujours.
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001', false);

select public._test_assert(
  (select count(*) from public.organizations o where o.id = :'org_a_id'::uuid) = 1,
  'DELETE B→A doit être REFUSÉ : Org A doit exister'
);

-- =============================================================================
-- 10. Isolation sur le rôle ANONYME : la base entière est invisible
-- =============================================================================
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);

select public._test_assert(
  (select count(*) from public.organizations) = 0,
  'anon ne doit voir aucune organisation'
);

select public._test_assert(
  (select count(*) from public.invitations) = 0,
  'anon ne doit voir aucune invitation'
);

reset role;

-- =============================================================================
-- 11. Vérifications structurelles (RLS activé, seed des catalogues)
-- =============================================================================
select public._test_assert(
  (select count(*) from pg_tables t
    where t.schemaname = 'public'
      and t.tablename in (
        'profiles', 'organizations', 'memberships', 'invitations',
        'roles', 'permissions', 'role_permissions'
      )
      and t.rowsecurity) = 7,
  'RLS doit être activé sur les 7 tables de fondation'
);

select public._test_assert(
  (select count(*) from public.roles) >= 3,
  'les 3 rôles de base doivent être seedés'
);

select public._test_assert(
  (select count(*) from public.permissions) >= 7,
  'les 7 permissions de base doivent être seedées'
);

-- =============================================================================
-- 12. Succès
-- =============================================================================
\echo 'ISOLATION TESTS PASSED'