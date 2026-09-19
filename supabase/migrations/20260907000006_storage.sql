-- Migration 20260907000006 — Fondation : file storage générique (public/privé)
-- ---------------------------------------------------------------------------
-- Rôle : doter le Starter d'un stockage de fichiers sécurisé, multi-tenant et
-- générique, avec une séparation NETTE entre fichiers publics et privés :
--   * buckets dédiés : `saas_public` (lecture publique assumée) et
--     `saas_private` (jamais lisible directement par un client) ;
--   * `storage_files` : métadonnées d'ownership / autorisation côté public
--     (RLS par organisation), car `storage.objects` ne porte pas la sémantique
--     multi-tenant de l'application ;
--   * chemins d'objet rigides `orgs/<organization_id>/...` : un trigger en
--     base garantit que la ligne métadonnée correspond au dossier de
--     l'organisation — aucun chemin inter-org possible.
-- Aucune donnée métier ici : le Starter fournit la fondation (upload validé
-- côté serveur, accès privé par signed URL, suppression autorisée).
-- ---------------------------------------------------------------------------
-- Principes de sécurité :
--   * TOUT écrit vers Storage passe par le serveur (`service_role`) : aucune
--     policy d'écriture client sur `storage.objects` — validation taille /
--     type / droits faite en amont dans le code serveur ;
--   * `storage_files` : lecture seule via RLS (`storage.read`), aucune écriture
--     client (les écritures de métadonnées sont faites par `service_role`) ;
--   * bucket `saas_public` = SEUL emplacement de lecture publique, accessible
--     par URL publique ; bucket `saas_private` = accès UNIQUEMENT par signed
--     URL (durée courte) générée côté serveur après autorisation ;
--   * permissions `storage.read` / `storage.write` / `storage.delete`
--     intégrées au catalogue multi-tenant existant (owner/admin complets,
--     member en lecture) ;
--   * aucun `FOR ALL USING (true)` sur les données d'organisation.
-- ---------------------------------------------------------------------------
-- Décisions d'intégrité :
--   * `unique (bucket, storage_path)` : un chemin d'objet ne peut être
--     référencé qu'une fois (pas de doublon de métadonnées) ;
--   * `checksum_sha256` : empreinte SHA-256 hexadécimale (détection de
--     doublons/corruption côté serveur) ;
--   * `size_bytes` plafonné (`<= 5 GiB`) au niveau base ; la limite réelle
--     d'upload (par défaut plus petite) est pilotée côté serveur ;
--   * `uploaded_by` en audit (`on delete set null`) : la métadonnée survit à
--     la suppression du compte ;
--   * `organization_id` en `on delete cascade` : la suppression d'une
--     organisation purge ses métadonnées de fichiers (le nettoyage des
--     objets du bucket reste une opération d'exploitation documentée) ;
--   * pas de `deleted_at` (soft delete non appliqué — voir
--     `documentation/database.md`).
-- ---------------------------------------------------------------------------

-- 1. Permissions multi-tenant : le stockage s'intègre au RBAC existant.
insert into public.permissions (name, description) values
  ('storage.read',   'Lire les fichiers (métadonnées et accès) de l''organisation.'),
  ('storage.write',  'Uploader des fichiers dans l''organisation.'),
  ('storage.delete', 'Supprimer des fichiers de l''organisation.')
on conflict (name) do nothing;

insert into public.role_permissions (role, permission) values
  ('owner',  'storage.read'),
  ('owner',  'storage.write'),
  ('owner',  'storage.delete'),
  ('admin',  'storage.read'),
  ('admin',  'storage.write'),
  ('admin',  'storage.delete'),
  ('member', 'storage.read')
on conflict (role, permission) do nothing;

-- 2. Buckets : création idempotente, séparation public / privé (par design).
--    `saas_public` : LECTURE PUBLIQUE assumée (avatars, images partagées…).
--    `saas_private` : jamais de lecture directe — signed URLs uniquement.
insert into storage.buckets (id, name, public)
values
  ('saas_public',  'saas_public',  true),
  ('saas_private', 'saas_private', false)
on conflict (id) do nothing;

-- 3. Verrouillage RLS des objets Storage.
--    Aucune policy ajoutée ici → aucun accès client direct (ni upload ni
--    liste depuis le navigateur). Le serveur (`service_role`) reste le seul
--    chemin : upload validé, signed URL de lecture, suppression autorisée.
--    Sur un vrai projet Supabase, RLS est déjà activé : cette instruction est
--    un no-op de sécurité (idempotent).
alter table storage.objects enable row level security;

-- 4. Métadonnées de fichiers (ownership + autorisation applicative).
create table public.storage_files (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  bucket          text not null check (bucket in ('saas_public', 'saas_private')),
  storage_path    text not null check (length(btrim(storage_path)) between 1 and 500),
  name            text not null check (length(btrim(name)) between 1 and 255),
  mime_type       text not null check (length(btrim(mime_type)) between 1 and 120),
  size_bytes      bigint not null check (size_bytes > 0 and size_bytes <= 5368709120),
  checksum_sha256 char(64) not null check (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  uploaded_by     uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (bucket, storage_path)
);

comment on table public.storage_files is
  'Métadonnées des fichiers uploadés par le serveur (ownership + autorisation multi-tenant).';
comment on column public.storage_files.bucket is
  'Bucket de stockage : saas_public (lisible publiquement) ou saas_private (signed URLs).';
comment on column public.storage_files.storage_path is
  'Chemin de l''objet dans le bucket, format imposé `orgs/<organization_id>/...` (trigger).';
comment on column public.storage_files.name is
  'Nom d''origine du fichier (désinfecté côté serveur), à titre d''affichage.';
comment on column public.storage_files.mime_type is
  'Type MIME validé côté serveur (liste autorisée, jamais la seule en-tête client).';
comment on column public.storage_files.size_bytes is
  'Taille réelle du fichier vérifiée côté serveur.';
comment on column public.storage_files.checksum_sha256 is
  'Empreinte SHA-256 hexadécimale calculée côté serveur (intégrité / déduplication).';
comment on column public.storage_files.uploaded_by is
  'Auteur de l''upload (audit). `set null` : la métadonnée survit à la suppression du compte.';

--    Sert la liste des fichiers d'une organisation (`WHERE organization_id = ...`).
create index storage_files_organization_id_idx
  on public.storage_files (organization_id);

-- 5. Intégrité du chemin : chaque métadonnée doit pointer dans le dossier de
--    SA organisation. Un chemin inter-org est matériellement impossible.
create or replace function public.enforce_storage_file_path()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_prefix text := 'orgs/' || new.organization_id::text || '/';
begin
  if new.storage_path is null or left(new.storage_path, length(v_prefix)) <> v_prefix then
    raise exception 'storage_path_mismatch' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger handle_storage_files_path
  before insert or update on public.storage_files
  for each row execute function public.enforce_storage_file_path();

comment on function public.enforce_storage_file_path() is
  'Trigger : impose `storage_path LIKE ''orgs/<organization_id>/%''`.';

-- 6. Timestamps maintenus par le serveur.
create trigger handle_storage_files_updated_at
  before update on public.storage_files
  for each row execute function public.handle_updated_at();

-- 7. RLS sur les métadonnées.
alter table public.storage_files enable row level security;

--    Lecture : toute personne avec `storage.read` sur l'organisation ;
--    écriture (insert/update/delete) : AUCUNE policy — réservée au serveur
--    (`service_role`) après validation et vérification des droits.
create policy "storage_files_select_org"
  on public.storage_files
  for select
  to authenticated
  using (public.has_permission(organization_id, 'storage.read'));

-- 8. Droits (ACL) : la lecture seule est accordée aux clients ; les écritures
--    de métadonnées restent à `service_role` (contourne RLS, écritures
--    serveur pilotées par le code).
grant select on public.storage_files to authenticated;
revoke insert, update, delete on public.storage_files from anon, authenticated;