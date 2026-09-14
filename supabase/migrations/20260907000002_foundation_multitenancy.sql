-- Migration 20260907000002 — Fondation : multi-tenancy générique
-- ---------------------------------------------------------------------------
-- Rôle : doter le Starter d'un modèle d'organisations multi-tenant GÉNÉRIQUE,
-- isolé au niveau base (RLS), prêt à être étendu par les futurs SaaS.
-- Aucune donnée métier ici : les tables suivantes sont des briques
-- réutilisables (toute table métier future devra être rattachée à une
-- organisation et passer par la même matrice RLS).
-- ---------------------------------------------------------------------------
-- Architecture : User → Organization → Membership → Role → Permission
-- ---------------------------------------------------------------------------
-- Principes de sécurité :
--   * le frontend PEUT choisir une organisation active, mais la décision
--     d'autorisation est TOUJOURS prise par la base (RLS) ;
--   * une permission = (organisation, permission), résolue via
--     `public.has_permission(org, 'domain.action')` (security definer,
--     `search_path = ''`) ;
--   * `service_role` reste le SEUL contournement administratif légitime ;
--   * aucun `FOR ALL USING (true)` hors catalogues publics documentés
--     (`roles`, `permissions`, `role_permissions`) ;
--   * les invitations ne stockent JAMAIS le token en clair : seul un hash
--     SHA-256 est persisté, le token brut est retourné une seule fois.
-- ---------------------------------------------------------------------------
-- Décisions d'intégrité :
--   * `organizations.created_by` : simple colonne d'audit, `on delete set null`
--     → une organisation SURVIT à la suppression du compte de son créateur ;
--   * `memberships.user_id` / `invitations.invited_by` : `on delete cascade`
--     / `set null` → le modèle de vie suit l'utilisateur Auth (cohérent avec
--     `profiles`) ;
--   * pas de `deleted_at` (soft delete non appliqué, voir
--     `documentation/database.md`) ;
--   * pas de colonne `updated_by` : aucune duplication d'information justifiée.
-- ---------------------------------------------------------------------------

-- 1. Catalogues de rôles et permissions
--    Données génériques, lisibles par tous (catalogue), jamais modifiables
--    par le client. Chaque SaaS peut les étendre via migration dédiée.
create table public.roles (
  name         text primary key,
  description  text
);

comment on table public.roles is
  'Catalogue générique des rôles d''une organisation (owner, admin, member).';
comment on column public.roles.name is 'Nom unique du rôle (identifiant naturel).';
comment on column public.roles.description is 'Description libre du rôle.';

create table public.permissions (
  name         text primary key,
  description  text
);

comment on table public.permissions is
  'Catalogue générique des permissions. Conventions : `<domain>.<action>`.';
comment on column public.permissions.name is
  'Nom unique de la permission (ex. organization.read, members.invite).';
comment on column public.permissions.description is 'Description libre de la permission.';

--    Mapping rôle → permission. Seul ce catalogue décide des droits ;
--    éviter `if user.role = ''admin''` partout dans l''application.
create table public.role_permissions (
  role        text not null references public.roles (name) on delete cascade,
  permission  text not null references public.permissions (name) on delete cascade,
  primary key (role, permission)
);

comment on table public.role_permissions is
  'Mapping générique rôle → permissions. Porte la matrice des droits.';

--    Seed des catalogues (idempotent).
insert into public.roles (name, description) values
  ('owner',  'Propriétaire : droits complets sur l''organisation.'),
  ('admin',  'Administrateur : gestion des membres, pas de suppression de l''organisation.'),
  ('member', 'Membre : accès en lecture à l''organisation.')
on conflict (name) do nothing;

insert into public.permissions (name, description) values
  ('organization.read',   'Lire l''organisation.'),
  ('organization.update', 'Modifier l''organisation (nom…).'),
  ('organization.delete', 'Supprimer l''organisation.'),
  ('members.read',        'Voir les membres et invitations.'),
  ('members.invite',      'Créer / révoquer des invitations.'),
  ('members.update',      'Changer le rôle d''un membre.'),
  ('members.remove',      'Retirer un membre de l''organisation.')
on conflict (name) do nothing;

insert into public.role_permissions (role, permission) values
  ('owner',  'organization.read'),
  ('owner',  'organization.update'),
  ('owner',  'organization.delete'),
  ('owner',  'members.read'),
  ('owner',  'members.invite'),
  ('owner',  'members.update'),
  ('owner',  'members.remove'),
  ('admin',  'organization.read'),
  ('admin',  'organization.update'),
  ('admin',  'members.read'),
  ('admin',  'members.invite'),
  ('admin',  'members.update'),
  ('admin',  'members.remove'),
  ('member', 'organization.read'),
  ('member', 'members.read')
on conflict (role, permission) do nothing;

-- 2. Organisations
--    Entité racine du multi-tenancy. Toute future table métier s'y rattache
--    par `organization_id` (FK) et interroge via la même matrice RLS.
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 100),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.organizations is
  'Organisation multi-tenant (racine du modèle). Aucune donnée métier.';
comment on column public.organizations.name is
  'Nom public de l''organisation (1 à 100 caractères, espaces ignorés aux bornes).';
comment on column public.organizations.created_by is
  'Créateur (audit). `set null` : l''organisation survit à la suppression du compte.';
comment on column public.organizations.created_at is 'Date de création (écrite par le serveur).';
comment on column public.organizations.updated_at is 'Dernière mise à jour (maintenue par trigger).';

-- 3. Appartenances (membres)
--    Un utilisateur peut appartenir à plusieurs organisations avec un rôle
--    par organisation.
create table public.memberships (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  role             text not null references public.roles (name) on delete restrict,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, user_id)
);

comment on table public.memberships is
  'Appartenance d''un utilisateur à une organisation, avec un rôle.';
comment on column public.memberships.role is 'Rôle de l''utilisateur dans cette organisation.';
comment on column public.memberships.user_id is
  'Utilisateur Auth joint. `on delete cascade` : l''appartenance meurt avec le compte (cohérent avec `profiles`).';

--    Sert la requête « mes organisations » (`WHERE user_id = auth.uid()`).
create index memberships_user_id_idx
  on public.memberships (user_id);

-- 4. Invitations
--    Un token n''est jamais stocké en clair : seul `token_hash` (SHA-256) est
--    persisté. Le token brut est retourné une seule fois par
--    `create_invitation()` et doit être transmis par email.
create table public.invitations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  email            text not null check (
                     email = lower(btrim(email))
                     and email ~ '^[^@[:space:]]+@[^@[:space:]]+$'
                   ),
  role             text not null references public.roles (name) on delete restrict,
  token_hash       text not null unique,
  invited_by       uuid references auth.users (id) on delete set null,
  status           text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  expires_at       timestamptz not null,
  accepted_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.invitations is
  'Invitation à rejoindre une organisation. Token jamais stocké en clair.';
comment on column public.invitations.email is
  'Email de l''invité, normalisé (minuscules, sans espaces aux bornes).';
comment on column public.invitations.token_hash is
  'SHA-256 du token d''invitation. Impossible de retrouver le token depuis ce hash.';
comment on column public.invitations.status is
  'Cycle : pending → accepted | revoked.';
comment on column public.invitations.expires_at is 'Date d''expiration (7 jours par défaut).';

--    Sert la liste des invitations d'une organisation
--    (`WHERE organization_id = ...`).
create index invitations_organization_id_idx
  on public.invitations (organization_id);

--    Une seule invitation PENDING par (organisation, email) : empêche les
--    doublons et le spam d'invitations.
create unique index invitations_organization_email_pending_uidx
  on public.invitations (organization_id, lower(email))
  where status = 'pending';

-- 5. Moteur d'autorisation
--    `has_permission(org, permission)` : l'unique source de vérité des droits.
--    - `security definer` (propriétaire postgres) : contourne RLS pour LIRE le
--      mapping (c'est CETTE fonction qui autorise, elle n'est jamais filtrée) ;
--    - `search_path = ''` : durcissement, tous les objets sont qualifiés.
create or replace function public.has_permission(
  p_organization_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.role_permissions rp on rp.role = m.role
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and rp.permission = p_permission
  )
$$;

comment on function public.has_permission(uuid, text) is
  'Autorise l''utilisateur courant sur (organisation, permission). Unique source de vérité RLS.';

-- 6. Création d'invitation (security definer : seul chemin légitime).
--    Vérifie `members.invite` en interne (jamais de confiance au client),
--    génère le token aléatoire + son hash, renvoie le token UNE SEULE fois.
create or replace function public.create_invitation(
  p_organization_id uuid,
  p_email text,
  p_role text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_token text;
  v_token_hash text;
begin
  if not public.has_permission(p_organization_id, 'members.invite') then
    -- Même erreur que pour une organisation inexistante : pas de fuite d'info.
    raise exception 'insufficient_permission' using errcode = '42501';
  end if;

  if not exists (select 1 from public.roles r where r.name = p_role) then
    raise exception 'unknown_role' using errcode = '42501';
  end if;

  -- L'owner ne s'invite jamais : il est créé par le trigger de création
  -- d'organisation et ne peut être transféré que via members.update par un
  -- owner. Empêche un admin de s'auto-promouvoir via une invitation.
  if p_role = 'owner' then
    raise exception 'ownership_via_invitation_forbidden' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.invitations i
    where i.organization_id = p_organization_id
      and i.email = v_email
      and i.status = 'pending'
  ) then
    raise exception 'invitation_already_pending' using errcode = '42501';
  end if;

  v_token      := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  insert into public.invitations (
    organization_id, email, role, token_hash, invited_by, expires_at
  )
  values (
    p_organization_id,
    v_email,
    p_role,
    v_token_hash,
    (select auth.uid()),
    now() + interval '7 days'
  );

  return v_token;
end;
$$;

comment on function public.create_invitation(uuid, text, text) is
  'Crée une invitation si l''appelant a `members.invite`. Retourne le token brut (à transmettre par email), seul un hash est stocké.';

-- 7. Acceptation d'invitation.
--    Seul chemin légitime d'ajout d'un membre : l'email invité doit
--    correspondre à un compte `auth.users`. RLS ne peut pas exprimer cette
--    opération (insertion dans `memberships`), d'où la fonction.
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash    text := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_inv     public.invitations%rowtype;
  v_user_id uuid;
begin
  select * into v_inv
  from public.invitations i
  where i.token_hash = v_hash;

  if not found then
    raise exception 'invitation_invalid' using errcode = '42501';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'invitation_invalid' using errcode = '42501';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'invitation_expired' using errcode = '42501';
  end if;

  select u.id into v_user_id
  from auth.users u
  where lower(u.email) = lower(v_inv.email);

  if not found then
    raise exception 'account_required' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.memberships m
    where m.organization_id = v_inv.organization_id
      and m.user_id = v_user_id
  ) then
    raise exception 'already_member' using errcode = '42501';
  end if;

  update public.invitations i
     set status = 'accepted', accepted_at = now()
   where i.id = v_inv.id;

  insert into public.memberships (organization_id, user_id, role)
  values (v_inv.organization_id, v_user_id, v_inv.role);

  return v_inv.organization_id;
end;
$$;

comment on function public.accept_invitation(text) is
  'Accepte une invitation via son token : crée l''appartenance et marque l''invitation acceptée.';

-- 8. Révocation d'invitation (pending → revoked).
create or replace function public.revoke_invitation(p_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_status text;
begin
  select organization_id, status into v_org_id, v_status
  from public.invitations i
  where i.id = p_invitation_id;

  if not found then
    return false;
  end if;

  if not public.has_permission(v_org_id, 'members.invite') then
    raise exception 'insufficient_permission' using errcode = '42501';
  end if;

  if v_status = 'pending' then
    update public.invitations i
       set status = 'revoked'
     where i.id = p_invitation_id;
    return true;
  end if;

  return false;
end;
$$;

comment on function public.revoke_invitation(uuid) is
  'Révoque une invitation PENDING si l''appelant a `members.invite`.';

-- 9. Droits d'exécution sur les fonctions d'invitation.
--    `security definer` : on retire le droit d'exécution PUBLIC (souvent
--    accordé par défaut à Postgres) — seuls les clients authentifiés peuvent
--    les invoquer.
revoke all on function public.has_permission(uuid, text) from public;
grant execute on function public.has_permission(uuid, text) to authenticated;

revoke all on function public.create_invitation(uuid, text, text) from public;
grant execute on function public.create_invitation(uuid, text, text) to authenticated;

revoke all on function public.accept_invitation(text) from public;
grant execute on function public.accept_invitation(text) to authenticated;

revoke all on function public.revoke_invitation(uuid) from public;
grant execute on function public.revoke_invitation(uuid) to authenticated;

-- 10. Trigger : appartenance OWNER automatique à la création d'une organisation.
--     `security definer` : s'exécute avec les droits du propriétaire (postgres)
--     car `memberships` n'a volontairement AUCUNE policy INSERT côté client.
create or replace function public.handle_organization_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.memberships (organization_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

create trigger handle_organizations_created
  after insert on public.organizations
  for each row execute function public.handle_organization_created();

comment on function public.handle_organization_created() is
  'Trigger : crée l''appartenance `owner` du créateur dès l''insertion d''une organisation.';

-- 11. Trigger : protéger le dernier OWNER d'une organisation.
--     Impossibilité de retirer / rétrograder la dernière appartenance `owner`.
--     `security invoker` : simple contrainte d'intégrité sur les écritures.
create or replace function public.prevent_last_owner_removal()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org_id      uuid;
  v_owner_count int;
begin
  if tg_op = 'DELETE' then
    v_org_id := old.organization_id;

    -- La suppression d'une ORGANISATION purge ses appartenances en cascade
    -- (la ligne parent est déjà supprimée quand ce trigger s'exécute sur les
    -- enfants) : on n'applique PAS la protection du dernier owner ici.
    if not exists (select 1 from public.organizations o where o.id = v_org_id) then
      return old;
    end if;

    if old.role = 'owner' then
      select count(*) into v_owner_count
      from public.memberships m
      where m.organization_id = v_org_id and m.role = 'owner';
      if v_owner_count <= 1 then
        raise exception 'cannot_remove_last_owner' using errcode = '42501';
      end if;
    end if;
    return old;
  end if;

  -- tg_op = UPDATE
  v_org_id := new.organization_id;
  if old.role = 'owner' and new.role <> 'owner' then
    select count(*) into v_owner_count
    from public.memberships m
    where m.organization_id = v_org_id and m.role = 'owner';
    if v_owner_count <= 1 then
      raise exception 'cannot_demote_last_owner' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger handle_memberships_before_role_change
  before delete or update of role on public.memberships
  for each row execute function public.prevent_last_owner_removal();

comment on function public.prevent_last_owner_removal() is
  'Trigger : interdit la suppression/rétrogradation du dernier owner d''une organisation.';

-- 12. RLS — activation sur toutes les tables de la fondation multi-tenant.
alter table public.organizations   enable row level security;
alter table public.memberships     enable row level security;
alter table public.invitations     enable row level security;
alter table public.roles           enable row level security;
alter table public.permissions     enable row level security;
alter table public.role_permissions enable row level security;

-- 12.1 Organisations
--      INSERT : on ne peut créer une organisation QUE pour soi-même. La
--              création de l'appartenance owner est gérée par le trigger.
--      SELECT : nécessite `organization.read`.
--      UPDATE : nécessite `organization.update`.
--      DELETE : nécessite `organization.delete`.
create policy "organizations_insert_own"
  on public.organizations
  for insert
  to authenticated
  with check (created_by = auth.uid() and created_by is not null);

create policy "organizations_select_member"
  on public.organizations
  for select
  to authenticated
  using (public.has_permission(id, 'organization.read'));

create policy "organizations_update_member"
  on public.organizations
  for update
  to authenticated
  using (public.has_permission(id, 'organization.update'))
  with check (public.has_permission(id, 'organization.update'));

create policy "organizations_delete_owner"
  on public.organizations
  for delete
  to authenticated
  using (public.has_permission(id, 'organization.delete'));

-- 12.2 Appartenances
--      SELECT : uniquement ses propres appartenances OU celles d'une
--               organisation pour laquelle on a `members.read`.
--      UPDATE : `members.update` (changer le rôle d'un membre).
--      DELETE : `members.remove` (retirer un membre).
--      INSERT : AUCUNE policy. L'ajout d'un membre passe obligatoirement par
--               l'acceptation d'une invitation (fonction `security definer`)
--               ou par le trigger de création d'organisation.
create policy "memberships_select_own_or_read"
  on public.memberships
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.has_permission(organization_id, 'members.read')
  );

create policy "memberships_update_manage"
  on public.memberships
  for update
  to authenticated
  using (public.has_permission(organization_id, 'members.update'))
  with check (public.has_permission(organization_id, 'members.update'));

create policy "memberships_delete_manage"
  on public.memberships
  for delete
  to authenticated
  using (public.has_permission(organization_id, 'members.remove'));

-- 12.3 Invitations
--      SELECT : `members.read` (liste des invitations de l'organisation).
--      INSERT : AUCUNE policy → `public.create_invitation()` (security definer).
--      UPDATE : AUCUNE policy → `public.revoke_invitation()` (security definer).
--      DELETE : `members.remove` (purge d'une invitation obsolète).
create policy "invitations_select_manage"
  on public.invitations
  for select
  to authenticated
  using (public.has_permission(organization_id, 'members.read'));

create policy "invitations_delete_manage"
  on public.invitations
  for delete
  to authenticated
  using (public.has_permission(organization_id, 'members.remove'));

-- 12.4 Catalogues publics (rôles, permissions, mapping).
--      Lecture seule pour tous ; écriture uniquement via migration (postgres).
create policy "roles_select_public"
  on public.roles
  for select
  to authenticated, anon
  using (true);

create policy "permissions_select_public"
  on public.permissions
  for select
  to authenticated, anon
  using (true);

create policy "role_permissions_select_public"
  on public.role_permissions
  for select
  to authenticated, anon
  using (true);

-- 13. Droits (ACL) tables — alignés sur les policies.
--     Les catalogues sont en lecture publique ; les tables multi-tenant se
--     limitent aux opérations autorisées par les policies.
grant select                          on public.roles, public.permissions, public.role_permissions to anon, authenticated;
grant select, insert, update, delete  on public.organizations to authenticated;
grant select, update, delete          on public.memberships   to authenticated;
grant select, delete                  on public.invitations   to authenticated;

-- 14. Timestamps maintenus par le serveur.
create trigger handle_organizations_updated_at
  before update on public.organizations
  for each row execute function public.handle_updated_at();

create trigger handle_memberships_updated_at
  before update on public.memberships
  for each row execute function public.handle_updated_at();

create trigger handle_invitations_updated_at
  before update on public.invitations
  for each row execute function public.handle_updated_at();