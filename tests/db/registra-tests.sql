-- Registra tests — RLS, permissions, isolation multi-tenant (tables Registra)
-- ---------------------------------------------------------------------------
-- STATUT : câblé dans .github/workflows/ci.yml (job db-migrations), APRÈS
-- isolation-tests.sql. Exécution locale possible sur base vierge :
--   1. tests/db/supabase-auth-stubs.sql   (stubs)
--   2. supabase/migrations/*.sql          (migrations)
--   3. tests/db/isolation-tests.sql       (fondation multi-tenant)
--   4. tests/db/registra-tests.sql        ← CE FICHIER
--   5. les autres suites (billing, email, ...)
--
-- Données 100 % fictives (UUID fixes, emails example.com) — aucune donnée réelle.
--
-- Matrice vérifiée (SELECT/INSERT/UPDATE/DELETE + RPC) :
--   dave (owner Org A)  → Org A : AUTORISÉ
--   erin (owner Org B)  → Org A : REFUSÉ
--   franck (member Org A) → écriture REFUSÉE, lecture AUTORISÉE
--
-- Section 7 : garde-fou de l'anomalie #6 (RPC de lecture security definer
-- SANS vérification has_permission). Les 3 RPC de lecture ont été corrigées
-- (attendance.history / stats.read) ; le test exige le comportement sécurisé
-- et échouerait en cas de régression future.
-- =============================================================================
-- 0. Helpers (idempotents — réutilisent le même contrat que isolation-tests.sql)
-- =============================================================================
create or replace function public._test_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if p_condition is not true then
    raise exception 'REGISTRA TEST FAILED: %', p_message;
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
    raise exception 'REGISTRA TEST FAILED: refus attendu, mais instruction réussie: %', p_sql;
  exception when insufficient_privilege then
    return;
  end;
end;
$$;

--    RPC de lecture cross-org : conforme SI refus explicite (42501), SI jsonb
--    avec clé "error", SI tableau vide / compteurs nuls. Une fuite = échec.
create or replace function public._test_expect_no_cross_org_data(p_sql text, p_message text)
returns void
language plpgsql
as $$
declare
  v jsonb;
begin
  begin
    execute p_sql into v;
  exception when insufficient_privilege then
    return;
  end;
  if v is null or (v ? 'error') then
    return;
  end if;
  if jsonb_typeof(v) = 'array' and jsonb_array_length(v) > 0 then
    raise exception 'REGISTRA TEST FAILED: %', p_message;
  end if;
  if coalesce((v->>'total_records')::int, 0)
   + coalesce((v->>'total_sessions')::int, 0) > 0 then
    raise exception 'REGISTRA TEST FAILED: %', p_message;
  end if;
end;
$$;

-- =============================================================================
-- 1. Catalogue de permissions (seeds Registra)
-- =============================================================================
select public._test_assert(
  exists (select 1 from public.permissions where name = 'groups.write'),
  'permission groups.write seedee');
select public._test_assert(
  exists (select 1 from public.permissions where name = 'attendance.write'),
  'permission attendance.write seedee');
select public._test_assert(
  exists (select 1 from public.role_permissions where role = 'member' and permission = 'groups.read'),
  'member possede groups.read (lecture seule)');
select public._test_assert(
  not exists (select 1 from public.role_permissions where role = 'member' and permission = 'groups.write'),
  'member ne possede PAS groups.write');

-- =============================================================================
-- 2. RLS actif sur les 4 tables Registra
-- =============================================================================
select public._test_assert(
  not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('organization_registra_settings','groups','persons','attendance_records')
      and c.relrowsecurity = false
  ),
  'RLS active sur tables Registra');

-- =============================================================================
-- 3. Fixtures (données fictives)
-- =============================================================================
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000004', 'dave@example.com'),
  ('00000000-0000-0000-0000-000000000005', 'erin@example.com'),
  ('00000000-0000-0000-0000-000000000006', 'franck@example.com')
on conflict (id) do nothing;

--    Org A créée par dave (RLS `organizations_insert_own` + trigger owner)
set role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000004', false);
insert into public.organizations (name, created_by)
values ('Registra Org A', '00000000-0000-0000-0000-000000000004')
returning id \gset rega_

--    Org B créée par erin
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000005', false);
insert into public.organizations (name, created_by)
values ('Registra Org B', '00000000-0000-0000-0000-000000000005')
returning id \gset regb_

--    franck = membre (role member) de l'Org A (insert serveur : memberships sans policy INSERT)
reset role;
insert into public.memberships (organization_id, user_id, role)
values (:'rega_id', '00000000-0000-0000-0000-000000000006', 'member')
on conflict do nothing;

-- =============================================================================
-- 4. DAVE (owner Org A) — cycle complet AUTORISÉ
-- =============================================================================
set role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000004', false);

select public.create_group(:'rega_id', 'Groupe Registra A', null) as id \gset grp_a_
select public._test_assert(:'grp_a_id' is not null, 'create_group owner A autorise');

select public.create_person(:'grp_a_id', 'Awa', 'Diallo', 'S-001') as id \gset per_a_
select public._test_assert(:'per_a_id' is not null, 'create_person owner A autorise');

select public._test_assert(
  public.mark_attendance(:'grp_a_id', current_date, :'per_a_id', 'present') is not null,
  'mark_attendance owner A autorise');
select public._test_assert(
  exists (select 1 from public.attendance_records
          where person_id = :'per_a_id' and status = 'present'),
  'enregistrement presence cree');

--    Settings 1:1 (owner a organization.update)
insert into public.organization_registra_settings (organization_id, organization_type)
values (:'rega_id', 'school');
select public._test_assert(
  exists (select 1 from public.organization_registra_settings
          where organization_id = :'rega_id'),
  'insert settings owner A autorise');

-- =============================================================================
-- 5. ERIN (owner Org B) → Org A : REFUSÉ partout
-- =============================================================================
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000005', false);

--    Lecture directe RLS : 0 ligne de l'Org A
select public._test_assert(
  (select count(*) from public.groups where id = :'grp_a_id') = 0,
  'RLS: erin ne voit pas les groupes de l Org A');
select public._test_assert(
  (select count(*) from public.persons where id = :'per_a_id') = 0,
  'RLS: erin ne voit pas les personnes de l Org A');
select public._test_assert(
  (select count(*) from public.attendance_records where person_id = :'per_a_id') = 0,
  'RLS: erin ne voit pas les presences de l Org A');
select public._test_assert(
  (select count(*) from public.organization_registra_settings
   where organization_id = :'rega_id') = 0,
  'RLS: erin ne voit pas les settings de l Org A');

--    Écriture directe RLS : 0 ligne affectée (preuve côté proprietaire)
update public.groups set name = 'PWN' where id = :'grp_a_id';
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000004', false);
select public._test_assert(
  (select name from public.groups where id = :'grp_a_id') = 'Groupe Registra A',
  'RLS: update cross-org n a rien modifie');

select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000005', false);
delete from public.attendance_records where person_id = :'per_a_id';
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000004', false);
select public._test_assert(
  exists (select 1 from public.attendance_records where person_id = :'per_a_id'),
  'RLS: delete cross-org n a rien supprime (historique immuable)');
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000005', false);

--    RPC d ecriture : refus explicite 42501
select public._test_expect_denied(
  format('select public.create_group(%L, %L, null)', :'rega_id', 'Intrus'));
select public._test_expect_denied(
  format('select public.create_person(%L, %L, %L, null)', :'grp_a_id', 'X', 'Y'));
select public._test_expect_denied(
  format('select public.mark_attendance(%L, current_date, %L, %L)',
         :'grp_a_id', :'per_a_id', 'absent'));

--    Settings : insertion cross-org refusée
select public._test_expect_denied(
  format('insert into public.organization_registra_settings (organization_id, organization_type)
          values (%L, %L)', :'rega_id', 'school'));

-- =============================================================================
-- 6. FRANCK (member Org A) — lecture seule effective
-- =============================================================================
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000006', false);

select public._test_assert(
  (select count(*) from public.groups where id = :'grp_a_id') = 1,
  'member: lecture groupes autorisee (voit le groupe de l Org A)');
select public._test_expect_denied(
  format('select public.create_group(%L, %L, null)', :'rega_id', 'MemberGroup'));
select public._test_expect_denied(
  format('select public.mark_attendance(%L, current_date, %L, %L)',
         :'grp_a_id', :'per_a_id', 'late'));

-- =============================================================================
-- 7. RPC DE LECTURE — contrôle positif + verrou anti-régression anomalie #6
--    get_group_stats / get_attendance_history / get_person_stats sont
--    security definer : elles doivent vérifier attendance.history ou stats.read
--    AVANT de retourner des données (fuite cross-org sinon).
-- =============================================================================
--    7.1 dave (owner Org A) : lecture légitime fonctionne (pas de régression)
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000004', false);
select public._test_assert(
  (select (public.get_group_stats(:'grp_a_id', 'all') ->> 'total_records')::int) = 1,
  'owner lit les stats de son groupe');
select public._test_assert(
  (select jsonb_array_length(public.get_attendance_history(:'grp_a_id', 'all'))) = 1,
  'owner lit l historique de son groupe');
select public._test_assert(
  (select (public.get_person_stats(:'per_a_id', 'all') ->> 'total_sessions')::int) = 1,
  'owner lit les stats de sa personne');

--    7.2 franck (member Org A) : stats.read appartient au rôle member
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000006', false);
select public._test_assert(
  (select (public.get_group_stats(:'grp_a_id', 'all') ->> 'total_records')::int) = 1,
  'member lit les stats (permission stats.read)');

--    7.3 erin (owner Org B) : REFUS sur les 3 RPC cross-org
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000005', false);
select public._test_expect_no_cross_org_data(
  format('select public.get_group_stats(%L, %L)', :'grp_a_id', 'all'),
  'FUITTE #6: get_group_stats expose les stats hors organisation');
select public._test_expect_no_cross_org_data(
  format('select public.get_attendance_history(%L, %L, 20, 0)', :'grp_a_id', 'all'),
  'FUITTE #6: get_attendance_history expose l historique hors organisation');
select public._test_expect_no_cross_org_data(
  format('select public.get_person_stats(%L, %L)', :'per_a_id', 'all'),
  'FUITTE #6: get_person_stats expose les stats hors organisation');

-- =============================================================================
-- 8. Récapitulatif
-- =============================================================================
reset role;
select 'REGISTRA TESTS: OK' as resultat;
