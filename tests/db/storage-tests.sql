-- Storage tests — buckets, séparation public/privé, chemins, métadonnées, sécurité (RLS)
-- ---------------------------------------------------------------------------
-- Exécuté par la CI (job `db-migrations`) APRÈS `tests/db/notifications-tests.sql`.
-- Les helpers (re)créés ici rendent le fichier autonome. Matrice testée :
--
--   Buckets        : `saas_public` (public) et `saas_private` (privé) existent
--   Chemins        : trigger `enforce_storage_file_path` — un chemin hors du
--                    dossier de l'organisation est REFUSÉ
--   Métadonnées    : colonnes d'intégrité (bucket contraint, checksum SHA-256
--                    hexadécimal, taille plafonnée)
--   Isolation      : alice / carol voient les fichiers de Store Alpha, bob
--                    uniquement ceux de Store Beta ; anon ne voit rien
--   Permissions    : owner/admin = storage.read|write|delete ; member =
--                    storage.read uniquement (has_permission)
--   Sécurité       : AUCUNE écriture client de métadonnées (insert/update/
--                    delete refusés) ; RLS activé sur storage.objects (aucun
--                    accès client direct) ; bucket privé non lisible
--
-- Fixtures : alice (…001) OWNER de Store Alpha, bob (…002) OWNER de Store
-- Beta, carol (…003) MEMBER de Store Alpha.
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
    raise exception 'STORAGE FAILED: %', p_message;
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
    raise exception 'STORAGE FAILED: refus attendu, mais instruction réussie: %', p_sql;
  exception when insufficient_privilege then
    return;
  end;
end;
$$;

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
    raise exception 'STORAGE FAILED: SQLSTATE % attendu, % obtenu: %', p_sqlstate, sqlstate, p_sql;
  end;
  raise exception 'STORAGE FAILED: échec (% ) attendu, mais instruction réussie: %', p_sqlstate, p_sql;
end;
$$;

-- =============================================================================
-- 1. Fixtures utilisateurs (Auth) + organisations
-- =============================================================================
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'alice@example.com'),
  ('00000000-0000-0000-0000-000000000002', 'bob@example.com'),
  ('00000000-0000-0000-0000-000000000003', 'carol@example.com')
on conflict (id) do nothing;

set role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001', false);

insert into public.organizations (name, created_by)
values ('Store Alpha', '00000000-0000-0000-0000-000000000001')
returning id \gset store_a_

select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000002', false);

insert into public.organizations (name, created_by)
values ('Store Beta', '00000000-0000-0000-0000-000000000002')
returning id \gset store_b_

reset role;

insert into public.memberships (organization_id, user_id, role)
values (:'store_a_id'::uuid, '00000000-0000-0000-0000-000000000003', 'member')
on conflict (organization_id, user_id) do nothing;

-- =============================================================================
-- 2. Buckets : séparation public / privé
-- =============================================================================
select public._test_assert(
  (select count(*) from storage.buckets b
    where b.id = 'saas_public' and b.name = 'saas_public' and b.public) = 1,
  'le bucket saas_public doit exister et être public'
);
select public._test_assert(
  (select count(*) from storage.buckets b
    where b.id = 'saas_private' and b.name = 'saas_private' and not b.public) = 1,
  'le bucket saas_private doit exister et être privé'
);

-- =============================================================================
-- 3. Métadonnées de fichiers (fixtures serveur) + intégrité des chemins
-- =============================================================================
insert into public.storage_files (
  organization_id, bucket, storage_path, name, mime_type, size_bytes, checksum_sha256, uploaded_by
) values (
  :'store_a_id'::uuid,
  'saas_private',
  'orgs/' || :'store_a_id'::uuid || '/rapport.pdf',
  'rapport.pdf',
  'application/pdf',
  2048,
  repeat('a', 64),
  '00000000-0000-0000-0000-000000000001'
);

insert into public.storage_files (
  organization_id, bucket, storage_path, name, mime_type, size_bytes, checksum_sha256, uploaded_by
) values (
  :'store_a_id'::uuid,
  'saas_public',
  'orgs/' || :'store_a_id'::uuid || '/banniere.png',
  'banniere.png',
  'image/png',
  5120,
  repeat('b', 64),
  '00000000-0000-0000-0000-000000000003'
);

--    Un chemin hors du dossier de l'organisation est REFUSÉ par le trigger.
select public._test_expect_sqlstate(
  format('insert into public.storage_files
            (organization_id, bucket, storage_path, name, mime_type, size_bytes, checksum_sha256)
          values (%L, %L, %L, %L, %L, %L, %L)',
    :'store_a_id'::uuid, 'saas_private',
    'orgs/' || :'store_b_id'::uuid || '/interlop.pdf',
    'interlop.pdf', 'application/pdf', 1024, repeat('c', 64)),
  '42501'
);

--    Intégrité des colonnes : bucket contraint, checksum hexa, taille bornée.
select public._test_expect_sqlstate(
  format('insert into public.storage_files
            (organization_id, bucket, storage_path, name, mime_type, size_bytes, checksum_sha256)
          values (%L, %L, %L, %L, %L, %L, %L)',
    :'store_a_id'::uuid, 'saas_hacker',
    'orgs/' || :'store_a_id'::uuid || '/x.bin',
    'x.bin', 'application/octet-stream', 10, repeat('d', 64))
);

select public._test_expect_sqlstate(
  format('insert into public.storage_files
            (organization_id, bucket, storage_path, name, mime_type, size_bytes, checksum_sha256)
          values (%L, %L, %L, %L, %L, %L, %L)',
    :'store_a_id'::uuid, 'saas_private',
    'orgs/' || :'store_a_id'::uuid || '/x.bin',
    'x.bin', 'application/octet-stream', 10, 'zztop')
);

-- =============================================================================
-- 4. Isolation multi-tenant (RLS sur storage_files)
-- =============================================================================
set role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001', false);

select public._test_assert(
  (select count(*) from public.storage_files) =
    (select count(*) from public.storage_files f
      where f.organization_id = :'store_a_id'::uuid),
  'alice (owner de Alpha) doit voir les fichiers de SON organisation'
);
select public._test_assert(
  (select count(*) from public.storage_files f
    where f.organization_id = :'store_b_id'::uuid) = 0,
  'alice ne doit rien voir de Store Beta'
);

--    Carol, simple MEMBER de Alpha, lit aussi les fichiers de Alpha.
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000003', false);
select public._test_assert(
  (select count(*) from public.storage_files f
    where f.organization_id = :'store_a_id'::uuid) = 2,
  'carol (member de Alpha) doit voir les fichiers de Alpha'
);

--    Bob ne voit QUE les fichiers de Beta (aucune ligne pour l''instant).
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000002', false);
select public._test_assert(
  (select count(*) from public.storage_files) = 0,
  'bob ne doit voir aucun fichier (Beta n''en possède pas encore)'
);

reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select public._test_assert(
  (select count(*) from public.storage_files) = 0,
  'anon ne doit voir AUCUNE métadonnée de fichier'
);

-- =============================================================================
-- 5. Permissions : storage.read / write / delete par rôle
-- =============================================================================
set role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001', false);

select public._test_assert(
  public.has_permission(:'store_a_id'::uuid, 'storage.read'),
  'owner doit avoir storage.read'
);
select public._test_assert(
  public.has_permission(:'store_a_id'::uuid, 'storage.write'),
  'owner doit avoir storage.write'
);
select public._test_assert(
  public.has_permission(:'store_a_id'::uuid, 'storage.delete'),
  'owner doit avoir storage.delete'
);

select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000003', false);
select public._test_assert(
  public.has_permission(:'store_a_id'::uuid, 'storage.read'),
  'member doit avoir storage.read'
);
select public._test_assert(
  not public.has_permission(:'store_a_id'::uuid, 'storage.write'),
  'member ne doit PAS avoir storage.write'
);
select public._test_assert(
  not public.has_permission(:'store_a_id'::uuid, 'storage.delete'),
  'member ne doit PAS avoir storage.delete'
);

-- =============================================================================
-- 6. Sécurité — AUCUNE écriture client de métadonnées
-- =============================================================================
select public._test_expect_denied(
  format('insert into public.storage_files
            (organization_id, bucket, storage_path, name, mime_type, size_bytes, checksum_sha256)
          values (%L, %L, %L, %L, %L, %L, %L)',
    :'store_a_id'::uuid, 'saas_private',
    'orgs/' || :'store_a_id'::uuid || '/pirates.bin',
    'pirates.bin', 'application/octet-stream', 10, repeat('e', 64))
);
select public._test_expect_denied(
  format('update public.storage_files set name = %L where organization_id = %L',
    'pirates.bin', :'store_a_id'::uuid)
);
select public._test_expect_denied(
  format('delete from public.storage_files where organization_id = %L',
    :'store_a_id'::uuid)
);

reset role;

-- =============================================================================
-- 7. Vérifications structurelles
-- =============================================================================
select public._test_assert(
  (select count(*) from pg_tables t
    where t.schemaname = 'public'
      and t.tablename = 'storage_files'
      and t.relrowsecurity) = 1,
  'RLS doit être activé sur public.storage_files'
);
select public._test_assert(
  (select count(*) from pg_tables t
    where t.schemaname = 'storage'
      and t.tablename = 'objects'
      and t.relrowsecurity) = 1,
  'RLS doit être activé sur storage.objects (aucun accès client direct)'
);
select public._test_assert(
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'storage_files'
      and p.cmd in ('INSERT', 'UPDATE', 'DELETE')) = 0,
  'storage_files ne doit avoir AUCUNE policy d''écriture client'
);
select public._test_assert(
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'storage_files'
      and p.cmd = 'SELECT') = 1,
  'storage_files doit avoir exactement une policy de lecture (storage.read)'
);

-- =============================================================================
-- 8. Succès
-- =============================================================================
\echo 'STORAGE TESTS PASSED'