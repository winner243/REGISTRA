-- Migration 20260907000001 — Fondation : table générique `profiles`
-- ---------------------------------------------------------------------------
-- Rôle : identité utilisateur enrichie, liée à Supabase Auth. C'est la SEULE
-- table créée par le Starter : elle est générique et ne porte aucune donnée
-- métier (immo, location, CRM, analytics… restent à définir par chaque SaaS).
-- ---------------------------------------------------------------------------
-- Décisions d'intégrité :
--   * `profiles.id` = PK et FK vers `auth.users.id` (loi d'identité avec Auth) ;
--   * `full_name`, `avatar_url` : optionnels, renseignés volontairement ;
--   * `created_at` / `updated_at` : timestamps gérés par le serveur (jamais par
--     le client), `updated_at` maintenu par le trigger générique ;
--   * pas de colonne `email` : la source de vérité est `auth.users.email`
--     (évite duplication et dérive) ;
--   * pas de colonne `deleted_at` : le soft delete n'est pas appliqué sur la
--     fondation (voir `documentation/database.md` → Soft delete).
-- ---------------------------------------------------------------------------

-- 1. Table
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Profil utilisateur générique (identité enrichie). Aucune donnée métier.';
comment on column public.profiles.id is
  'Référence l''utilisateur Supabase Auth (même UUID). Suppression en cascade.';
comment on column public.profiles.full_name is 'Nom affiché, renseigné volontairement.';
comment on column public.profiles.avatar_url is 'URL d''avatar (optionnel).';
comment on column public.profiles.created_at is 'Date de création (écrite par le serveur).';
comment on column public.profiles.updated_at is 'Dernière mise à jour (maintenue par trigger).';

-- 2. Timestamps maintenus par le serveur
create trigger handle_profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- 3. RLS — le profil est privé, propriété exclusive de son utilisateur.
--    Le rôle `service_role` (administratif) reste le seul contournement possible,
--    strictement réservé aux opérations serveur privilégiées.
alter table public.profiles enable row level security;

--    SELECT : un utilisateur ne lit que son propre profil.
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

--    UPDATE : un utilisateur ne modifie que son propre profil.
--    Le `with check` garantit qu'on ne peut pas réaffecter la ligne à un autre
--    utilisateur en cours de route.
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

--    INSERT : aucune policy. La création du profil est automatisée par le
--    trigger `on_auth_user_created` (fonction `security definer`), un client
--    ne doit pas pouvoir créer un profil arbitraire.
--    DELETE : aucune policy. La suppression de compte est gérée par l'application
--    d'authentification / l'administration (service_role), jamais par le client.

-- 4. Création automatique du profil à l'inscription (Supabase Auth).
--    `security definer` : s'exécute avec les droits du propriétaire (postgres),
--    nécessaire car le trigger est déclenché dans le contexte d'auth.
--    `search_path = ''` : durcissement, tous les objets sont qualifiés.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();