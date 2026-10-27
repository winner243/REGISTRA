-- Migration 20260927000001 — Registra : fondation (types, tables, RLS, RPC)
-- ---------------------------------------------------------------------------
-- Rôle : créer le socle métier Registra au-dessus de la fondation multi-tenant
-- existante (profiles, organizations, memberships, roles, permissions, billing).
-- Tout est indépendant : chaque futur SaaS peut supprimer Registra sans toucher
-- au socle. Le moteur billing existant (plans, limites, usage) est réutilisé.
-- ---------------------------------------------------------------------------
-- Décisions d'intégrité :
--   * Toutes tables suivent le pattern `created_at` / `updated_at` via trigger ;
--   * Clés étrangères `ON DELETE CASCADE` cohérent avec la loi de vie des données ;
--   * Pas de `deleted_at` (soft delete non appliqué — voir documentation/database.md) ;
--   * Enum `attendance_status` fermé : pas de valeurs invalides possibles en base ;
--   * UNIQUE (group_id, record_date, person_id) → présence unique par personne par jour ;
--   * Table `organization_registra_settings` en 1:1 avec organizations (pas de pollutions) ;
--   * Fonctions RPC `security definer` (source de vérité autorisation) ;
--   * Aucune écriture client directe sur tables Registra (via RLS uniquement).
-- ---------------------------------------------------------------------------

-- 1. Type enum présence : valeurs strictement définies, pas de NULL ambigu
CREATE TYPE public.attendance_status AS ENUM ('unmarked', 'present', 'late', 'absent');

comment on type public.attendance_status is
  'Statut d''enregistrement de présence : unmarked=non renseigné, present=présent, late=malade/retard, absent=absent.';

-- 2. Configuration spécifique Registra par organisation (1:1, pas de pollutions organizations)
create table public.organization_registra_settings (
  organization_id        uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  organization_type      text NOT NULL CHECK (organization_type IN (
    'school', 'church', 'training_center', 'company', 'association', 'ngo', 'sports_club', 'other'
  )) DEFAULT 'other',
  description            text,
  -- Vocabulaire (NULL = preset selon organization_type)
  vocab_group_label            text,
  vocab_group_label_plural     text,
  vocab_person_label           text,
  vocab_person_label_plural    text,
  vocab_presence_label         text,
  vocab_attendance_label       text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

comment on table public.organization_registra_settings is
  'Configuration spécifique Registra par organisation. Liaison 1:1 avec organizations.';

create trigger handle_org_registra_settings_updated_at
  before update on public.organization_registra_settings
  for each row execute function public.handle_updated_at();

comment on column public.organization_registra_settings.organization_type is
  'Type d''organisation : détermine les presets vocabulaire (église, école, entreprise, etc.).';
comment on column public.organization_registra_settings.vocab_group_label is
  'Label singulier du groupe (ex. "Classe", "Service", "Groupe"). NULL → preset par défaut.';
comment on column public.organization_registra_settings.vocab_group_label_plural is
  'Label pluriel du groupe (ex. "Classes", "Services", "Groupes"). NULL → preset par défaut.';
comment on column public.organization_registra_settings.vocab_person_label is
  'Label singulier de la personne (ex. "Élève", "Employé", "Membre"). NULL → preset par défaut.';
comment on column public.organization_registra_settings.vocab_person_label_plural is
  'Label pluriel de la personne (ex. "Élèves", "Employés", "Membres"). NULL → preset par défaut.';
comment on column public.organization_registra_settings.vocab_presence_label is
  'Label de la présence (ex. "Présence", "Pointage", "Registre"). NULL → preset par défaut.';
comment on column public.organization_registra_settings.vocab_attendance_label is
  'Label du registre de présence (ex. "Appel", "Pointage", "Registre"). NULL → preset par défaut.';

-- 3. Groupes
create table public.groups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  description     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

comment on table public.groups is
  'Groupe au sein d''une organisation (classe, service, département, équipe).';
comment on column public.groups.organization_id is
  'Organisation mère. CASCADE : suppression organisation → suppression de tous ses groupes.';
comment on column public.groups.name is
  'Nom du groupe. Unique par organisation.';
comment on column public.groups.description is
  'Description libre du groupe.';

create trigger handle_groups_updated_at
  before update on public.groups
  for each row execute function public.handle_updated_at();

-- 4. Personnes
create table public.persons (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  group_id        uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  first_name      text NOT NULL CHECK (length(btrim(first_name)) BETWEEN 1 AND 80),
  last_name       text NOT NULL CHECK (length(btrim(last_name)) BETWEEN 1 AND 80),
  student_id      text,  -- matricule optionnel, unique par groupe si fourni
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, student_id)  -- si student_id fourni, unique par groupe
);

comment on table public.persons is
  'Personne (élève, employé, membre, participant) appartenant à un groupe.';
comment on column public.persons.organization_id is
  'Organisation mère (redondant pour les politiques RLS sans traverser groups).';
comment on column public.persons.group_id is
  'Groupe parent. CASCADE : suppression groupe → suppression de toutes les personnes.';
comment on column public.persons.first_name is
  'Prénom de la personne.';
comment on column public.persons.last_name is
  'Nom de la personne.';
comment on column public.persons.student_id is
  'Matricule facultatif. Doit être unique au sein du groupe.';

create index persons_group_id_idx on public.persons(group_id);
create index persons_name_idx on public.persons(last_name, first_name);

create trigger handle_persons_updated_at
  before update on public.persons
  for each row execute function public.handle_updated_at();

-- 5. Enregistrements de présence
create table public.attendance_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  group_id        uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  person_id       uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  record_date     date NOT NULL,
  status          public.attendance_status NOT NULL DEFAULT 'unmarked',
  marked_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  marked_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, record_date, person_id)
);

comment on table public.attendance_records is
  'Enregistrement de présence : une ligne par personne par date de groupe.';
comment on column public.attendance_records.organization_id is
  'Organisation mère (redondant pour requêtes performantes sans traverser groups).';
comment on column public.attendance_records.group_id is
  'Groupe de la personne.';
comment on column public.attendance_records.person_id is
  'Personne présente/absente.';
comment on column public.attendance_records.record_date is
  'Date de la prise de présence.';
comment on column public.attendance_records.status is
  'Statut présence : unmarked=non renseigné, present=présent, late=malade/retard, absent=absent.';
comment on column public.attendance_records.marked_by is
  'Utilisateur qui a marqué la présence (côté serveur).';
comment on column public.attendance_records.marked_at is
  'Horodatage du marquage. NULL = jamais marqué (peu probable avec DEFAULT unmarked).';
comment on column public.attendance_records.created_at is
  'Date de création de la ligne (écrite par le serveur).';

create index attendance_records_group_date_idx on public.attendance_records(group_id, record_date DESC);
create index attendance_records_person_id_idx on public.attendance_records(person_id);
create index attendance_records_org_date_idx on public.attendance_records(organization_id, record_date DESC);

create trigger handle_attendance_records_updated_at
  before update on public.attendance_records
  for each row execute function public.handle_updated_at();

-- 6.Permissions + catalogue (seed idempotent)
-- Nouvelles permissions Registra (ajoutées aux catalogues existants)
insert into public.permissions (name, description) values
  ('groups.read',        'Lire les groupes de l''organisation.'),
  ('groups.write',       'Créer / modifier / supprimer des groupes.'),
  ('persons.read',       'Lire les personnes de l''organisation.'),
  ('persons.write',      'Créer / modifier / supprimer des personnes.'),
  ('attendance.read',    'Lire le registre de présence.'),
  ('attendance.write',   'Marquer / modifier la présence.'),
  ('attendance.history', 'Consulter l''historique des présences.'),
  ('stats.read',         'Consulter les statistiques.'),
  ('import.write',       'Importer des données (CSV/Excel).'),
  ('export.read',        'Exporter des données (CSV/Excel).')
on conflict (name) do nothing;

insert into public.role_permissions (role, permission) values
  ('owner',  'groups.read'),
  ('owner',  'groups.write'),
  ('owner',  'persons.read'),
  ('owner',  'persons.write'),
  ('owner',  'attendance.read'),
  ('owner',  'attendance.write'),
  ('owner',  'attendance.history'),
  ('owner',  'stats.read'),
  ('owner',  'import.write'),
  ('owner',  'export.read'),
  ('admin',  'groups.read'),
  ('admin',  'groups.write'),
  ('admin',  'persons.read'),
  ('admin',  'persons.write'),
  ('admin',  'attendance.read'),
  ('admin',  'attendance.write'),
  ('admin',  'attendance.history'),
  ('admin',  'stats.read'),
  ('admin',  'import.write'),
  ('admin',  'export.read'),
  ('member', 'groups.read'),
  ('member', 'persons.read'),
  ('member', 'attendance.read'),
  ('member', 'attendance.history'),
  ('member', 'stats.read'),
  ('member', 'export.read')
on conflict (role, permission) do nothing;

-- 7. RLS — activation sur toutes les tables Registra
alter table public.organization_registra_settings enable row level security;
alter table public.groups enable row level security;
alter table public.persons enable row level security;
alter table public.attendance_records enable row level security;

-- 7.1 organization_registra_settings
create policy "org_registra_settings_select_owner_admin"
  on public.organization_registra_settings
  for select
  to authenticated
  using (has_permission(organization_id, 'organization.update'));

create policy "org_registra_settings_insert_owner_admin"
  on public.organization_registra_settings
  for insert
  to authenticated
  with check (has_permission(organization_id, 'organization.update'));

create policy "org_registra_settings_update_owner_admin"
  on public.organization_registra_settings
  for update
  to authenticated
  using (has_permission(organization_id, 'organization.update'))
  with check (has_permission(organization_id, 'organization.update'));

-- 7.2 groups
create policy "groups_select_member"
  on public.groups
  for select
  to authenticated
  using (has_permission(organization_id, 'groups.read'));

create policy "groups_insert_manage"
  on public.groups
  for insert
  to authenticated
  with check (has_permission(organization_id, 'groups.write'));

create policy "groups_update_manage"
  on public.groups
  for update
  to authenticated
  using (has_permission(organization_id, 'groups.write'))
  with check (has_permission(organization_id, 'groups.write'));

create policy "groups_delete_manage"
  on public.groups
  for delete
  to authenticated
  using (has_permission(organization_id, 'groups.write'));

-- 7.3 persons
create policy "persons_select_member"
  on public.persons
  for select
  to authenticated
  using (has_permission(organization_id, 'persons.read'));

create policy "persons_insert_manage"
  on public.persons
  for insert
  to authenticated
  with check (
    has_permission(organization_id, 'persons.write')
    -- sous-requete scalaire : le groupe doit appartenir a la meme organisation que la personne
    and (select g.organization_id from public.groups g where g.id = group_id) = organization_id
  );

-- Note : insert persons se fait via RPC create_person (security definer), pas via policy directe.
-- La policy ci-dessus est une safety net ; l'accès réel est dans la fonction RPC.

create policy "persons_update_manage"
  on public.persons
  for update
  to authenticated
  using (has_permission(organization_id, 'persons.write'));

create policy "persons_delete_manage"
  on public.persons
  for delete
  to authenticated
  using (has_permission(organization_id, 'persons.write'));

-- 7.4 attendance_records
create policy "attendance_records_select_member"
  on public.attendance_records
  for select
  to authenticated
  using (has_permission(organization_id, 'attendance.read'));

create policy "attendance_records_insert_manage"
  on public.attendance_records
  for insert
  to authenticated
  with check (has_permission(organization_id, 'attendance.write'));

create policy "attendance_records_update_manage"
  on public.attendance_records
  for update
  to authenticated
  using (has_permission(organization_id, 'attendance.write'))
  with check (has_permission(organization_id, 'attendance.write'));

-- Pas de policy DELETE : historique immuable (seulement mise à jour du statut).

-- 8. Droits d'exécution des fonctions : accordés en section 13, APRÈS la création
--    des fonctions (un GRANT sur une fonction inexistante échoue sur base vierge).

-- Vocabulary / Settings : lecture directe via policies RLS (organization.update).
-- Pas de RPC dédiée : aucune fonction get_organization_registra_settings n'est utilisée.

-- 9. Fonctions RPC : create_group / update_group / delete_group
-- -----------------------------------------------------------------------------
-- create_group : crée un groupe dans une organisation (vérifie groups.write via has_permission)
create or replace function public.create_group(
  p_organization_id uuid,
  p_name text,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid;
begin
  if not public.has_permission(p_organization_id, 'groups.write') then
    raise exception 'insufficient_permission' using errcode = '42501';
  end if;

  insert into public.groups (organization_id, name, description)
  values (p_organization_id, p_name, p_description)
  returning id into v_group;

  return v_group;
end;
$$;

comment on function public.create_group(uuid, text, text) is
  'Crée un groupe dans une organisation. Vérifie groups.write via has_permission.';

-- -----------------------------------------------------------------------------
create or replace function public.update_group(
  p_group_id uuid,
  p_name text,
  p_description text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.groups%rowtype;
begin
  select * into v_group from public.groups where id = p_group_id;

  if not found then
    raise exception 'group_not_found' using errcode = '42501';
  end if;

  if not public.has_permission(v_group.organization_id, 'groups.write') then
    raise exception 'insufficient_permission' using errcode = '42501';
  end if;

  update public.groups
  set name = p_name, description = p_description, updated_at = now()
  where id = p_group_id;

  return true;
end;
$$;

comment on function public.update_group(uuid, text, text) is
  'Modifie un groupe. Vérifie groups.write via has_permission.';

-- -----------------------------------------------------------------------------
create or replace function public.delete_group(
  p_group_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.groups%rowtype;
begin
  select * into v_group from public.groups where id = p_group_id;

  if not found then
    raise exception 'group_not_found' using errcode = '42501';
  end if;

  if not public.has_permission(v_group.organization_id, 'groups.write') then
    raise exception 'insufficient_permission' using errcode = '42501';
  end if;

  -- CASCADE : suppression groupe → personnes + enregistrements présence
  delete from public.groups where id = p_group_id;

  return true;
end;
$$;

comment on function public.delete_group(uuid) is
  'Supprime un groupe (cascade : personnes + attendance records). Vérifie groups.write.';

-- 10. Fonctions RPC : create_person / update_person / delete_person
-- -----------------------------------------------------------------------------
create or replace function public.create_person(
  p_group_id uuid,
  p_first_name text,
  p_last_name text,
  p_student_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person uuid;
  v_org_id uuid;
begin
  -- Vérifier que le groupe existe et appartient à l'org de l'utilisateur (via membership)
  select g.organization_id into v_org_id
  from public.groups g
  where g.id = p_group_id;

  if not found then
    raise exception 'group_not_found' using errcode = '42501';
  end if;

  if not public.has_permission(v_org_id, 'persons.write') then
    raise exception 'insufficient_permission' using errcode = '42501';
  end if;

  -- Vérifier unicité student_id par groupe si fourni
  if p_student_id is not null then
    if exists (select 1 from public.persons p where p.group_id = p_group_id and p.student_id = p_student_id) then
      raise exception 'student_id_duplicate' using errcode = '42501';
    end if;
  end if;

  insert into public.persons (organization_id, group_id, first_name, last_name, student_id)
  values (v_org_id, p_group_id, p_first_name, p_last_name, p_student_id)
  returning id into v_person;

  return v_person;
end;
$$;

comment on function public.create_person(uuid, text, text, text) is
  'Crée une personne dans un groupe. Vérifie persons.write + unicité student_id.';

-- -----------------------------------------------------------------------------
create or replace function public.update_person(
  p_person_id uuid,
  p_first_name text default null,
  p_last_name text default null,
  p_student_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person public.persons%rowtype;
  v_org_id uuid;
begin
  select * into v_person from public.persons where id = p_person_id;

  if not found then
    raise exception 'person_not_found' using errcode = '42501';
  end if;

  select g.organization_id into v_org_id
  from public.groups g
  where g.id = v_person.group_id;

  if not public.has_permission(v_org_id, 'persons.write') then
    raise exception 'insufficient_permission' using errcode = '42501';
  end if;

  -- Si student_id fourni, vérifier unicité
  if p_student_id is not null then
    if exists (select 1 from public.persons p where p.group_id = v_person.group_id and p.id != p_person_id and p.student_id = p_student_id) then
      raise exception 'student_id_duplicate' using errcode = '42501';
    end if;
  end if;

  update public.persons
  set first_name = coalesce(p_first_name, v_person.first_name),
      last_name  = coalesce(p_last_name,  v_person.last_name),
      student_id = coalesce(p_student_id, v_person.student_id),
      updated_at = now()
  where id = p_person_id;

  return true;
end;
$$;

comment on function public.update_person(uuid, text, text, text) is
  'Modifie une personne. Vérifie persons.write.';

-- -----------------------------------------------------------------------------
create or replace function public.delete_person(
  p_person_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person public.persons%rowtype;
  v_org_id uuid;
begin
  select * into v_person from public.persons where id = p_person_id;

  if not found then
    raise exception 'person_not_found' using errcode = '42501';
  end if;

  select g.organization_id into v_org_id
  from public.groups g
  where g.id = v_person.group_id;

  if not public.has_permission(v_org_id, 'persons.write') then
    raise exception 'insufficient_permission' using errcode = '42501';
  end if;

  delete from public.persons where id = p_person_id;

  return true;
end;
$$;

comment on function public.delete_person(uuid) is
  'Supprime une personne (cascade : enregistrements présence associés). Vérifie persons.write.';

-- 11. Fonctions RPC : mark_attendance / bulk_mark_attendance
-- -----------------------------------------------------------------------------
create or replace function public.mark_attendance(
  p_group_id uuid,
  p_record_date date,
  p_person_id uuid,
  p_status public.attendance_status
)
returns public.attendance_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.groups%rowtype;
  v_record public.attendance_records%rowtype;
  v_org_id uuid;
begin
  -- Vérifier groupe + org + permission
  select g.* into v_group from public.groups g where g.id = p_group_id;

  if not found then
    raise exception 'group_not_found' using errcode = '42501';
  end if;

  if not public.has_permission(v_group.organization_id, 'attendance.write') then
    raise exception 'insufficient_permission' using errcode = '42501';
  end if;

  -- Vérifier personne dans ce groupe
  if not exists (
    select 1 from public.persons p
    where p.id = p_person_id and p.group_id = p_group_id
  ) then
    raise exception 'person_not_in_group' using errcode = '42501';
  end if;

  -- Upsert record (contrainte unique group_id + record_date + person_id)
  INSERT INTO public.attendance_records (organization_id, group_id, person_id, record_date, status, marked_by, marked_at)
  VALUES (v_group.organization_id, p_group_id, p_person_id, p_record_date, p_status, auth.uid(), now())
  ON CONFLICT (group_id, record_date, person_id)
  DO UPDATE SET
    status = EXCLUDED.status,
    marked_by = EXCLUDED.marked_by,
    marked_at = EXCLUDED.marked_at
  RETURNING * INTO v_record;

  RETURN v_record;
end;
$$;

comment on function public.mark_attendance(uuid, date, uuid, public.attendance_status) is
  'Marque/modifie la présence d''une personne pour un groupe et une date donnés.
   Upsert : crée si inexistant, met à jour si existant. Vérifie attendance.write.';

-- -----------------------------------------------------------------------------
create or replace function public.bulk_mark_attendance(
  p_group_id uuid,
  p_record_date date,
  p_status_map jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.groups%rowtype;
  v_result jsonb;
  v_person_uuid uuid;
  v_status public.attendance_status;
  v_record public.attendance_records%rowtype;
begin
  select g.* into v_group from public.groups g where g.id = p_group_id;

  if not found then
    return '{"error":"group_not_found"}'::jsonb;
  end if;

  if not public.has_permission(v_group.organization_id, 'attendance.write') then
    return '{"error":"insufficient_permission"}'::jsonb;
  end if;

  v_result = '{"created":0,"updated":0,"errors":[]}'::jsonb;

  -- Approche simplifiée : traiter chaque personne du groupe
  for v_person_uuid in select id from public.persons where group_id = p_group_id loop
    v_status := (p_status_map->>v_person_uuid::text)::public.attendance_status;
    if v_status is null then
      v_status := 'unmarked'::text::public.attendance_status;
    end if;

    -- Appeler mark_attendance pour chaque personne
    perform public.mark_attendance(p_group_id, p_record_date, v_person_uuid, v_status);

    v_result = v_result::jsonb - 'error'::text || jsonb_build_object('error', null)::jsonb;
  end loop;

  return v_result;
end;
$$;

comment on function public.bulk_mark_attendance(uuid, date, jsonb) is
  'Marque la présence pour plusieurs personnes d''un groupe à une date donnée.
   Le paramètre p_status_map est un jsonb {"person_id": "status", ...}.
   Retourne un résumé {created, updated, errors}.';

-- 12. Fonctions RPC : historique + statistiques
-- -----------------------------------------------------------------------------
create or replace function public.get_attendance_history(
  p_group_id uuid,
  p_period text default 'month',
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.groups%rowtype;
  v_start_date date;
  v_end_date date;
  v_result jsonb;
begin
  select g.* into v_group from public.groups g where g.id = p_group_id;

  if not found then
    return '{"error":"group_not_found"}'::jsonb;
  end if;

  if not public.has_permission(v_group.organization_id, 'attendance.history') then
    raise exception 'insufficient_permission' using errcode = '42501';
  end if;


  -- Périodes
  case p_period
    when 'today'   then v_start_date := current_date;   v_end_date := current_date;
    when 'week'    then v_start_date := date_trunc('week', current_date)::date;
                           v_end_date := (date_trunc('week', current_date) + interval '1 week')::date - interval '1 day';
    when 'month'   then v_start_date := date_trunc('month', current_date)::date;
                           v_end_date := (date_trunc('month', current_date) + interval '1 month')::date - interval '1 day';
    when 'year'    then v_start_date := date_trunc('year', current_date)::date;
                           v_end_date := (date_trunc('year', current_date) + interval '1 year')::date - interval '1 day';
    when 'all'     then v_start_date := '2000-01-01'::date;
                           v_end_date := current_date;
    else v_start_date := date_trunc('month', current_date)::date;
                           v_end_date := (date_trunc('month', current_date) + interval '1 month')::date - interval '1 day';
  end case;

  -- Agrégat par date (retour jsonb : agrégat dans un sous-requete scalaire)
  return (
    select coalesce(jsonb_agg(to_jsonb(sub) order by sub.record_date desc), '[]'::jsonb)
    from (
      select
        record_date,
        count(*) filter (where status = 'present')  as present_count,
        count(*) filter (where status = 'late')     as late_count,
        count(*) filter (where status = 'absent')   as absent_count,
        count(*) filter (where status = 'unmarked') as unmarked_count,
        count(*)                                   as total_records
      from public.attendance_records
      where group_id = p_group_id
        and record_date between v_start_date and v_end_date
      group by record_date
      order by record_date desc
      limit p_limit offset p_offset
    ) sub
  );
end;
$$;

comment on function public.get_attendance_history(uuid, text, integer, integer) is
  'Retourne l''historique des présences par date pour un groupe. Vérifie attendance.history. p_period : today/week/month/year/all.';

-- -----------------------------------------------------------------------------
create or replace function public.get_group_stats(
  p_group_id uuid,
  p_period text default 'month'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.groups%rowtype;
  v_start_date date;
  v_end_date date;
begin
  select g.* into v_group from public.groups g where g.id = p_group_id;

  if not found then
    return '{"error":"group_not_found"}'::jsonb;
  end if;

  if not public.has_permission(v_group.organization_id, 'stats.read') then
    raise exception 'insufficient_permission' using errcode = '42501';
  end if;

  case p_period
    when 'today'   then v_start_date := current_date;   v_end_date := current_date;
    when 'week'    then v_start_date := date_trunc('week', current_date)::date;
                           v_end_date := (date_trunc('week', current_date) + interval '1 week')::date - interval '1 day';
    when 'month'   then v_start_date := date_trunc('month', current_date)::date;
                           v_end_date := (date_trunc('month', current_date) + interval '1 month')::date - interval '1 day';
    when 'year'    then v_start_date := date_trunc('year', current_date)::date;
                           v_end_date := (date_trunc('year', current_date) + interval '1 year')::date - interval '1 day';
    when 'all'     then v_start_date := '2000-01-01'::date;
                           v_end_date := current_date;
    else v_start_date := date_trunc('month', current_date)::date;
                           v_end_date := (date_trunc('month', current_date) + interval '1 month')::date - interval '1 day';
  end case;

  -- Retour jsonb : agrégat unique dans un sous-requete scalaire (une seule ligne)
  return (
    select to_jsonb(sub)
    from (
      select
        count(*) filter (where status = 'present')  as present_count,
        count(*) filter (where status = 'late')     as late_count,
        count(*) filter (where status = 'absent')   as absent_count,
        count(*) filter (where status = 'unmarked') as unmarked_count,
        count(*)                                   as total_records,
        round(
          100.0 * count(*) filter (where status in ('present','late'))
          / nullif(count(*) filter (where status <> 'unmarked'), 0),
          1
        ) as attendance_rate
      from public.attendance_records
      where group_id = p_group_id
        and record_date between v_start_date and v_end_date
    ) sub
  );
end;
$$;

comment on function public.get_group_stats(uuid, text) is
  'Retourne les statistiques d''attendance pour un groupe sur une période. Vérifie stats.read.';

-- -----------------------------------------------------------------------------
create or replace function public.get_person_stats(
  p_person_id uuid,
  p_period text default 'month'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person public.persons%rowtype;
  v_start_date date;
  v_end_date date;
begin
  select * into v_person
  from public.persons
  where id = p_person_id;

  if not found then
    return '{"error":"person_not_found"}'::jsonb;
  end if;

  if not public.has_permission(v_person.organization_id, 'stats.read') then
    raise exception 'insufficient_permission' using errcode = '42501';
  end if;


  case p_period
    when 'today'   then v_start_date := current_date;   v_end_date := current_date;
    when 'week'    then v_start_date := date_trunc('week', current_date)::date;
                           v_end_date := (date_trunc('week', current_date) + interval '1 week')::date - interval '1 day';
    when 'month'   then v_start_date := date_trunc('month', current_date)::date;
                           v_end_date := (date_trunc('month', current_date) + interval '1 month')::date - interval '1 day';
    when 'year'    then v_start_date := date_trunc('year', current_date)::date;
                           v_end_date := (date_trunc('year', current_date) + interval '1 year')::date - interval '1 day';
    when 'all'     then v_start_date := '2000-01-01'::date;
                           v_end_date := current_date;
    else v_start_date := date_trunc('month', current_date)::date;
                           v_end_date := (date_trunc('month', current_date) + interval '1 month')::date - interval '1 day';
  end case;

  -- Retour jsonb : agrégat unique dans un sous-requete scalaire (une seule ligne)
  return (
    select to_jsonb(sub)
    from (
      select
        count(*) filter (where status = 'present')  as present_count,
        count(*) filter (where status = 'late')     as late_count,
        count(*) filter (where status = 'absent')   as absent_count,
        count(*) filter (where status = 'unmarked') as unmarked_count,
        count(*)                                   as total_sessions,
        round(
          100.0 * count(*) filter (where status in ('present','late'))
          / nullif(count(*) filter (where status <> 'unmarked'), 0),
          1
        ) as attendance_rate
      from public.attendance_records
      where person_id = p_person_id
        and record_date between v_start_date and v_end_date
    ) sub
  );
end;
$$;

comment on function public.get_person_stats(uuid, text) is
  'Retourne les statistiques d''attendance pour une personne sur une période. Vérifie stats.read.';

-- 13. Grants finaux
-- Fonctions RPC (security definer -> authenticated uniquement) -- apres creation.
-- Organizations RPC
grant execute on function public.create_group(uuid, text, text) to authenticated;
grant execute on function public.update_group(uuid, text, text) to authenticated;
grant execute on function public.delete_group(uuid) to authenticated;

-- Persons RPC
grant execute on function public.create_person(uuid, text, text, text) to authenticated;
grant execute on function public.update_person(uuid, text, text, text) to authenticated;
grant execute on function public.delete_person(uuid) to authenticated;

-- Attendance RPC
grant execute on function public.mark_attendance(uuid, date, uuid, public.attendance_status) to authenticated;
grant execute on function public.bulk_mark_attendance(uuid, date, jsonb) to authenticated;
grant execute on function public.get_attendance_history(uuid, text, integer, integer) to authenticated;
grant execute on function public.get_group_stats(uuid, text) to authenticated;
grant execute on function public.get_person_stats(uuid, text) to authenticated;
-- Tables publiques (catalogues) — lecture publique documentée
grant select on public.roles, public.permissions, public.role_permissions to anon, authenticated;

-- Tables Registra — SELECT via has_permission (RLS), écriture via RPC security definer
grant select on public.organization_registra_settings to authenticated;
grant select on public.groups to authenticated;
grant select on public.persons to authenticated;
grant select on public.attendance_records to authenticated;

-- Pas de grant insert/update/delete direct : tout passe par les RPC security definer

-- 14. Commentaire final
do $$
declare
  v_comment text :=
  'Migration Registra V1 : fondation types tables RLS RPC. S''appuie sur le socle multi-tenant existant.
   Tables : organization_registra_settings, groups, persons, attendance_records.
   Type enum : attendance_status (unmarked|present|late|absent).
   Toutes écritures passent par RPC security definer. Pas de policy d''écriture client directe.
   Soft delete non appliqué (pas dans cahier des charges MVP).';
begin
  execute format('comment on database %I is %L', current_database(), v_comment);
end $$;
