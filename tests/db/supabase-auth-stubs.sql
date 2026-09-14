-- Stubs Supabase pour validation des migrations sur une base vierge
-- ---------------------------------------------------------------------------
-- Uniquement pour les environnements de TEST / validation (CI, conteneur local).
-- Reproduit le strict minimum de l'infrastructure Supabase dont dépendent les
-- migrations : rôles RLS, schéma `extensions`, schéma `auth` fonctionnel.
--
-- ⚠️ NE JAMAIS exécuter en production ni sur un vrai projet Supabase :
--    ces objets y existent déjà et sont gérés par la plateforme.
-- ---------------------------------------------------------------------------

-- 1. Rôles utilisés par les policies RLS des migrations
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$$;

-- 2. Schéma `extensions` (convention Supabase pour les extensions)
create schema if not exists extensions;

-- 3. Schéma et objets `auth` réduits au strict nécessaire pour les FK/triggers
create schema if not exists auth;

--    `auth.uid()` : retourne l'UID du JWT courant, `null` hors connexion.
--    Approximation suffisante pour valider le DDL des policies.
create or replace function auth.uid() returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

--    `auth.users` : colonnes minimales référencées par la fondation.
create table if not exists auth.users (
  id         uuid primary key,
  email      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. Droits (ACL) : reproduit les privilèges accordés par la plateforme
--    Supabase, pour que les policies RLS soient exercées (et non court-
--    circuitées par un simple manque de privilège).
grant usage on schema public, auth, extensions to anon, authenticated;

grant execute on function auth.uid() to anon, authenticated;

--    Sur Supabase, toute table créée par une migration est automatiquement
--    lisible/modifiable par `anon` et `authenticated` (les policies RLS font
--    ensuite le filtrage). Reproduit ce comportement pour les objets créés
--    PAR LA SUITE (après application de ce fichier).
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to anon, authenticated;