-- Migration 20260907000005 — Fondation : notifications (in-app + email + push)
-- ---------------------------------------------------------------------------
-- Rôle : doter le Starter d'un système de notifications GÉNÉRIQUE, isolé au
-- niveau base (RLS) et prêt à être utilisé par les futurs SaaS :
--   * `notification_templates`  → catalogue des types de notification (comme
--     les catalogues roles/permissions) : quels canaux chaque type autorise ;
--   * `notification_preferences`→ préférences PAR UTILISATEUR et par canal
--     (in_app / email / push) : c'est le canal `email` qui pilote l'envoi via
--     l'EmailService (file outbox) côté serveur ;
--   * `notifications`           → boîte de réception in-app (UNE ligne par
--     utilisateur destinataire), ownership stricte `recipient` ;
--   * canal `push` : RÉSERVÉ pour l'avenir — présent dans les catalogues et
--     préférences mais AUCUN envoi implémenté (jamais d'envoi silencieux).
-- Aucune donnée métier ici : un SaaS crée son type via migration ou utilise
-- le type générique `general` seedé ci-dessous.
-- ---------------------------------------------------------------------------
-- Principes de sécurité :
--   * la création de notifications est STRICTEMENT côté serveur (fonctions
--     `security definer` exécutables uniquement par `service_role`) — aucun
--     client ne peut inventer une notification ;
--   * l'utilisateur ne lit / n'efface QUE ses propres notifications
--     (`notifications.user_id = auth.uid()`) ; la lecture passe par RLS ;
--   * le marquage « lu » passe par une fonction `security definer` qui vérifie
--     l'ownership en base (aucun UPDATE client direct) ;
--   * `notification_preferences` : chacun ne modifie QUE ses préférences ;
--   * `notification_templates` : catalogue public en lecture seule (aucune
--     donnée d'organisation exposée).
-- ---------------------------------------------------------------------------
-- Décisions d'intégrité :
--   * canal supporté → enum text contraint (`in_app` | `email` | `push`) dans
--     les préférences, tableau de canaux borné pour les templates ;
--   * FK `notifications.type → notification_templates.name` (`on delete
--     restrict`) : impossible d'utiliser un type inconnu ou désactivé ;
--   * FK `notifications.user_id → auth.users.id` (`on delete cascade`) : la
--     notification meurt avec le compte (cohérent avec `profiles`) ;
--   * `organization_id` NULLABLE : une notification peut être globale
--     (plateforme) ou liée à une organisation (multi-tenant) ;
--   * `read_at` : NULL = non lu ; marqué uniquement via la fonction dédiée ;
--   * pas de `deleted_at` (soft delete non appliqué — voir
--     `documentation/database.md`).
-- ---------------------------------------------------------------------------

-- 1. Catalogue des types de notifications
create table public.notification_templates (
  name        text primary key,
  description text not null check (length(btrim(description)) between 1 and 300),
  channels    text[] not null default '{in_app}'::text[] check (
                array_length(channels, 1) between 1 and 3
                and channels <@ array['in_app', 'email', 'push']::text[]
              ),
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.notification_templates is
  'Catalogue générique des types de notifications (canaux autorisés par type).';
comment on column public.notification_templates.name is
  'Nom unique du type (identifiant naturel, ex. general).';
comment on column public.notification_templates.channels is
  'Canaux permis pour ce type : in_app, email, push (push = réservé pour le futur).';
comment on column public.notification_templates.enabled is
  'Désactivable : un type désactivé ne peut plus créer de notification.';

--    Seed idempotent : un type générique de démonstration.
insert into public.notification_templates (name, description, channels)
values (
  'general',
  'Notification générique (in-app + email). Point de départ pour tout SaaS.',
  array['in_app', 'email']
)
on conflict (name) do nothing;

-- 2. Préférences de notification par utilisateur et par canal
create table public.notification_preferences (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  channel    text not null check (channel in ('in_app', 'email', 'push')),
  enabled    boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, channel)
);

comment on table public.notification_preferences is
  'Préférences par utilisateur et par canal (in_app, email, push).';
comment on column public.notification_preferences.channel is
  'Canal concerné. Absence de ligne = préférence par défaut (activé).';
comment on column public.notification_preferences.enabled is
  'Le canal est-il autorisé pour cet utilisateur ?';

-- 3. Boîte de réception in-app (UNE ligne par destinataire)
create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  type            text not null references public.notification_templates (name) on delete restrict,
  title           text not null check (length(btrim(title)) between 1 and 200),
  body            text check (body is null or length(btrim(body)) between 1 and 2000),
  data            jsonb not null default '{}'::jsonb,
  read_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.notifications is
  'Boîte de réception in-app : une ligne par notification et par destinataire.';
comment on column public.notifications.user_id is
  'Destinataire (ownership stricte : chacun ne voit QUE ses lignes).';
comment on column public.notifications.organization_id is
  'Organisation liée (NULL = notification globale plateforme).';
comment on column public.notifications.type is
  'Type de notification (FK catalogue notification_templates).';
comment on column public.notifications.data is
  'Données contextuelles minimales et non sensibles (jamais de secret).';
comment on column public.notifications.read_at is
  'NULL = non lu. Marquage uniquement via mark_notifications_read().';

--    Sert l'inbox par utilisateur, du plus récent au plus ancien.
create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

-- 4. Timestamps maintenus par le serveur.
create trigger handle_notification_templates_updated_at
  before update on public.notification_templates
  for each row execute function public.handle_updated_at();

create trigger handle_notification_preferences_updated_at
  before update on public.notification_preferences
  for each row execute function public.handle_updated_at();

create trigger handle_notifications_updated_at
  before update on public.notifications
  for each row execute function public.handle_updated_at();

-- 5. Création d'une notification (serveur uniquement).
--    Valide le type en base (existant + activé + canal in_app autorisé),
--    puis insère la ligne du destinataire.
create or replace function public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_organization_id uuid,
  p_data jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1
    from public.notification_templates t
    where t.name = p_type
      and t.enabled
      and 'in_app' = any (t.channels)
  ) then
    -- Même erreur pour un type inconnu ou désactivé : aucune fuite d'info.
    raise exception 'unknown_template' using errcode = '42501';
  end if;

  insert into public.notifications (
    user_id, organization_id, type, title, body, data
  )
  values (
    p_user_id,
    p_organization_id,
    p_type,
    p_title,
    p_body,
    coalesce(p_data, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.create_notification(uuid, text, text, text, uuid, jsonb) is
  'Crée une notification in-app pour un utilisateur (service_role uniquement). Retourne l''id.';

-- 6. Notification de TOUS les membres d'une organisation (multi-tenant).
create or replace function public.notify_organization_members(
  p_organization_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_data jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not exists (
    select 1
    from public.notification_templates t
    where t.name = p_type
      and t.enabled
      and 'in_app' = any (t.channels)
  ) then
    raise exception 'unknown_template' using errcode = '42501';
  end if;

  insert into public.notifications (user_id, organization_id, type, title, body, data)
  select m.user_id, p_organization_id, p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb)
  from public.memberships m
  where m.organization_id = p_organization_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.notify_organization_members(uuid, text, text, text, jsonb) is
  'Crée une notification in-app pour chaque membre d''une organisation (service_role uniquement). Retourne le nombre de lignes créées.';

-- 7. Marquage « lu » — ownership vérifiée en base (jamais de confiance client).
create or replace function public.mark_notifications_read(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    return 0;
  end if;

  update public.notifications
     set read_at = coalesce(read_at, now())
   where id = any (p_ids)
     and user_id = (select auth.uid())
     and read_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.mark_notifications_read(uuid[]) is
  'Marque comme lues les notifications de l''utilisateur courant parmi les ids fournis (les autres sont ignorées).';

-- 8. RLS — activation sur les trois tables.
alter table public.notification_templates    enable row level security;
alter table public.notification_preferences  enable row level security;
alter table public.notifications             enable row level security;

-- 8.1 Templates : catalogue public en lecture (comme roles/permissions).
create policy "notification_templates_select_public"
  on public.notification_templates
  for select
  to authenticated, anon
  using (true);

-- 8.2 Préférences : chacun ne lit/écrit QUE ses propres préférences.
create policy "notification_preferences_select_own"
  on public.notification_preferences
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "notification_preferences_insert_own"
  on public.notification_preferences
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "notification_preferences_update_own"
  on public.notification_preferences
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 8.3 Notifications : l'utilisateur ne voit que SES lignes.
--     Pas de policy INSERT (création serveur uniquement) ni UPDATE
--     (marquage via mark_notifications_read). DELETE = suppression de son
--     propre historique (dismiss).
create policy "notifications_select_own"
  on public.notifications
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "notifications_delete_own"
  on public.notifications
  for delete
  to authenticated
  using (user_id = auth.uid());

-- 9. Droits (ACL) : moindre privilège, alignés sur les policies.
--    Templates : lecture publique du catalogue.
grant select on public.notification_templates to anon, authenticated;
revoke insert, update, delete on public.notification_templates from anon, authenticated;

--    Préférences : l'utilisateur gère SES préférences (lecture/écriture own).
grant select, insert, update on public.notification_preferences to authenticated;
revoke delete on public.notification_preferences from authenticated;
revoke all on public.notification_preferences from anon;

--    Notifications : lecture/effacement de SES notifications (RLS own).
grant select, delete on public.notifications to authenticated;
revoke insert, update on public.notifications from authenticated;
revoke all on public.notifications from anon;

--    Fonctions : création réservée à `service_role` ; marquage « lu »
--    accessible aux clients authentifiés (ownership vérifiée en base).
revoke all on function public.create_notification(uuid, text, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_notification(uuid, text, text, text, uuid, jsonb) to service_role;

revoke all on function public.notify_organization_members(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.notify_organization_members(uuid, text, text, text, jsonb) to service_role;

revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;