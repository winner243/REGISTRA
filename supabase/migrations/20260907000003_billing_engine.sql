-- Migration 20260907000003 — Billing Engine : plans, abonnements, droits, limites, usage
-- ---------------------------------------------------------------------------
-- Rôle : doter le Starter d'un moteur de facturation GÉNÉRIQUE et agnostique
-- de tout fournisseur de paiement :
--
--   Plan → Subscription → Entitlement → Limit → Usage
--
-- Aucun fournisseur réel (Stripe, PayPal, Mobile Money…) n'est connecté dans
-- cette phase : le moteur expose uniquement l'architecture que le futur
-- branchement (Webhook → Vérification → Idempotence → Billing Engine →
-- Subscription → Etitlements) viendra piloter.
--
-- Architecture :
--   * Catalogues génériques (lecture publique, écriture par migration) :
--     `plans`, `features`, `plan_features` (entitlements),
--     `plan_limits` (limites par plan). Chaque futur SaaS remplace les
--     EXEMPLES seedés par ses propres plans/features/limites via migration.
--   * Tables par organisation (RLS stricte, `billing.read`) :
--     `subscriptions`, `usage`, `usage_events`. Le client ne peut JAMAIS les
--     écrire : seules les fonctions `security definer` peuvent le faire.
--   * Moteur d'évaluation côté base (`security definer`, `search_path = ''`) :
--     `can_use_feature`, `get_plan_limit`, `get_usage`,
--     `can_consume_usage`, `consume_usage`, `plan_limits_status`.
--
-- Principes de sécurité :
--   * le frontend n'est jamais source de vérité : un utilisateur ne peut ni
--     changer son plan, ni son abonnement, ni ses entitlements/limites, ni
--     falsifier son usage (aucune policy d'écriture, aucun ACL d'écriture) ;
--   * `billing.read` est porté par les rôles `owner` et `admin` (jamais
--     `member`) ; `billing.manage` est réservé au backend futur (pas de
--     chemin d'exécution côté client) ;
--   * toute fonction exposée vérifie d'abord l'appartenance à l'organisation
--     (`is_member`, basé sur `auth.uid()`) : une organisation ne peut jamais
--     lire ni modifier le billing d'une autre ;
--   * `consume_usage` verrouille la ligne d'abonnement courante
--     (`FOR UPDATE`) : les consommations concurrentes d'une même organisation
--     sont sérialisées, la limite ne peut pas être contournée par la course.
--
-- Comportement défini (source de vérité DU MOTEUR) :
--   * organisation SANS abonnement courant → plan = NULL, AUCUNE feature
--     activée (`can_use_feature` false), aucune limite, `consume_usage`
--     refuse avec `no_active_subscription` ;
--   * abonnement expiré (`current_period_end` passé), `canceled` ou
--     `past_due` → considéré NON courant (même traitement) ;
--   * `trialing` et `active` → courant tant que la période inclut `now()` ;
--   * limite dont la `limit_key` n'existe pas dans le plan → consommation
--     SANS plafond (enregistrée mais non bornée), documenté ;
--   * `usage = limite` : une quantité supplémentaire POSITIVE est refusée
--     (`usage_limit_exceeded`) — le compteur reste au plafond.
-- ---------------------------------------------------------------------------

-- 1. Extensions du catalogue de permissions (multi-tenancy existant).
--    `billing.read` : Lire abonnement / limites / usage de l'organisation.
--    `billing.manage` : Modifier l'abonnement — réservé au backend (webhook
--    de paiement futur), AUCUN chemin d'exécution côté client.
insert into public.permissions (name, description) values
  ('billing.read',   'Lire l''abonnement, les limites et l''usage de l''organisation.'),
  ('billing.manage', 'Gérer l''abonnement (réservé au backend serveur, jamais au client).')
on conflict (name) do nothing;

insert into public.role_permissions (role, permission) values
  ('owner', 'billing.read'),
  ('owner', 'billing.manage'),
  ('admin', 'billing.read')
on conflict (role, permission) do nothing;

-- 2. Catalogues génériques (briques réutilisables, remplaçables par chaque SaaS).
--    Lecture publique comme `roles`/`permissions` ; écriture uniquement via
--    migration. Aucune donnée d'organisation ici.

-- 2.1 Plans — un plan est un ensemble de features + de limites, SANS prix :
--     le prix relève du fournisseur de paiement (phase dédiée), pas du moteur.
create table public.plans (
  code         text primary key,
  name         text not null check (length(btrim(name)) between 1 and 100),
  description  text,
  is_active    boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.plans is
  'Catalogue générique des plans. Un plan = un ensemble de features + de limites, sans prix.';
comment on column public.plans.code is
  'Identifiant naturel du plan (ex. free, pro, business).';
comment on column public.plans.is_active is
  'Un plan inactif ne peut pas être choisi pour un nouvel abonnement.';
comment on column public.plans.sort_order is 'Ordre d''affichage des plans.';

-- 2.2 Features — les briques de fonctionnalités qu'un SaaS peut activer.
create table public.features (
  code         text primary key,
  name         text not null check (length(btrim(name)) between 1 and 100),
  description  text
);

comment on table public.features is
  'Catalogue générique des features (convention `<domain>.<action>`, ex. feature.export).';

-- 2.3 Entitlements — mapping plan → features (ce qu'un plan AUTORISE).
create table public.plan_features (
  plan_code    text not null references public.plans (code) on delete cascade,
  feature_code text not null references public.features (code) on delete cascade,
  primary key (plan_code, feature_code)
);

comment on table public.plan_features is
  'Entitlements : liste des features activées par un plan (mapping unique).';

-- 2.4 Limites — mapping plan → valeurs de limites (convention `domain.key`).
create table public.plan_limits (
  plan_code    text not null references public.plans (code) on delete cascade,
  limit_key    text not null check (limit_key ~ '^[a-z0-9_]+(\.[a-z0-9_]+)+$'),
  limit_value  numeric not null check (limit_value >= 0),
  primary key (plan_code, limit_key)
);

comment on table public.plan_limits is
  'Limites d''un plan, par clé générique (ex. projects.max, exports.monthly).';

-- 2.5 Seed des catalogues — EXEMPLES à remplacer par chaque futur SaaS
--     (mêmes conventions que le seed des rôles/permissions : idempotent).
insert into public.plans (code, name, description, sort_order) values
  ('free',     'Free',     'Exemple : découverte. Aucune feature avancée.', 1),
  ('pro',      'Pro',      'Exemple : usage actif.',                       2),
  ('business', 'Business', 'Exemple : équipes en croissance.',             3)
on conflict (code) do nothing;

insert into public.features (code, name, description) values
  ('feature.analytics', 'Analytics avancés',    'Exemple : rapports et mesures avancés.'),
  ('feature.export',    'Export de données',    'Exemple : export CSV/JSON.'),
  ('feature.team',      'Collaboration',        'Exemple : membres et rôles d''équipe.'),
  ('feature.api',       'API publique',         'Exemple : accès API programmatique.')
on conflict (code) do nothing;

insert into public.plan_features (plan_code, feature_code) values
  ('free',     'feature.export'),
  ('pro',      'feature.analytics'),
  ('pro',      'feature.export'),
  ('pro',      'feature.team'),
  ('business', 'feature.analytics'),
  ('business', 'feature.export'),
  ('business', 'feature.team'),
  ('business', 'feature.api')
on conflict (plan_code, feature_code) do nothing;

insert into public.plan_limits (plan_code, limit_key, limit_value) values
  ('free',     'projects.max',        1),
  ('free',     'members.max',         3),
  ('free',     'exports.monthly',     5),
  ('free',     'storage.max',       100),
  ('pro',      'projects.max',       10),
  ('pro',      'members.max',        10),
  ('pro',      'exports.monthly',   100),
  ('pro',      'api.requests.monthly', 10000),
  ('pro',      'storage.max',      10000),
  ('business', 'projects.max',      100),
  ('business', 'members.max',        50),
  ('business', 'exports.monthly',  1000),
  ('business', 'api.requests.monthly', 500000),
  ('business', 'storage.max',     100000)
on conflict (plan_code, limit_key) do nothing;

-- 3. Tables de facturation par organisation (multi-tenant, RLS stricte).
--    Le client peut LIRE (avec `billing.read`) mais JAMAIS écrire.

-- 3.1 Abonnements — un abonnement COURANT unique par organisation
--     (index partiel WHERE status in ('trialing','active')).
create table public.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete cascade,
  plan_code            text not null references public.plans (code) on delete restrict,
  status               text not null default 'active' check (
                         status in ('trialing', 'active', 'past_due', 'canceled')
                       ),
  current_period_start timestamptz not null,
  current_period_end   timestamptz not null,
  cancel_at_period_end boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint subscriptions_period_check check (current_period_end > current_period_start)
);

comment on table public.subscriptions is
  'Abonnement d''une organisation à un plan. Cycle de vie piloté par le backend.';
comment on column public.subscriptions.status is
  'Cycle : trialing → active → past_due | canceled. `active` + `cancel_at_period_end` reste courant jusqu''à la fin de période.';
comment on column public.subscriptions.cancel_at_period_end is
  'Annulation planifiée en fin de période : l''accès reste valide jusqu''à `current_period_end`.';

create index subscriptions_organization_id_idx
  on public.subscriptions (organization_id);

create unique index subscriptions_one_current_per_org_uidx
  on public.subscriptions (organization_id)
  where status in ('trialing', 'active');

-- 3.2 Usage — compteurs agrégés par (organisation, clé, période).
--     Écrit UNIQUEMENT par `consume_usage` (security definer).
create table public.usage (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  usage_key        text not null check (usage_key ~ '^[a-z0-9_]+(\.[a-z0-9_]+)+$'),
  period_start     timestamptz not null,
  period_end       timestamptz not null,
  quantity         numeric not null default 0 check (quantity >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, usage_key, period_start, period_end)
);

comment on table public.usage is
  'Compteurs d''usage par période d''abonnement. Une seule ligne par (organisation, clé, période).';

create index usage_organization_id_idx
  on public.usage (organization_id);

-- 3.3 Journal d'événements d'usage — append-only (audit, jamais modifié).
create table public.usage_events (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  usage_key        text not null check (usage_key ~ '^[a-z0-9_]+(\.[a-z0-9_]+)+$'),
  period_start     timestamptz not null,
  period_end       timestamptz not null,
  amount           numeric not null check (amount > 0),
  actor_id         uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now()
);

comment on table public.usage_events is
  'Journal append-only des consommations d''usage (audit / litige de facturation).';

create index usage_events_organization_id_idx
  on public.usage_events (organization_id);

create index usage_events_org_key_idx
  on public.usage_events (organization_id, usage_key);

-- 4. Moteur d'évaluation (security definer, search_path = '').
--    L'unique source de vérité des droits : rien n'est décidé par le client.

-- 4.1 Appartenance : l'appelant est-il membre de l'organisation ?
create or replace function public.is_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
  )
$$;

comment on function public.is_member(uuid) is
  'Vérifie que l''utilisateur courant est membre de l''organisation (barrière commune de toutes les fonctions billing exposées).';

-- 4.2 Un abonnement est-il « courant » ? (trialing/active, période englobant now()).
create or replace function public.subscription_is_current(
  p_status text,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (
    p_status in ('trialing', 'active')
    and p_period_start is not null
    and p_period_end is not null
    and p_period_start <= now()
    and p_period_end > now()
  )
$$;

comment on function public.subscription_is_current(text, timestamptz, timestamptz) is
  'Définition du « courant » : trialing/active pendant la période. Expiré, canceled ou past_due = NON courant.';

-- 4.3 Abonnement courant d'une organisation (interne, non exposé au client).
create or replace function public.get_current_subscription(p_organization_id uuid)
returns setof public.subscriptions
language sql
stable
security definer
set search_path = ''
as $$
  select s.*
  from public.subscriptions s
  where s.organization_id = p_organization_id
    and public.subscription_is_current(
          s.status, s.current_period_start, s.current_period_end
        )
  order by s.created_at desc
  limit 1
$$;

comment on function public.get_current_subscription(uuid) is
  'Abonnement courant de l''organisation (usage interne du moteur).';

-- 4.4 Plan effectif d'une organisation (NULL si aucun abonnement courant).
create or replace function public.get_organization_plan(p_organization_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan_code text;
begin
  if not public.is_member(p_organization_id) then
    return null;
  end if;

  select s.plan_code into v_plan_code
  from public.get_current_subscription(p_organization_id) s;

  return v_plan_code;
end;
$$;

comment on function public.get_organization_plan(uuid) is
  'Plan effectif d''une organisation, déduit de son abonnement courant. NULL = aucun plan.';

-- 4.5 Le plan courant de l'organisation active-t-il cette feature ?
create or replace function public.can_use_feature(
  p_organization_id uuid,
  p_feature text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan_code text;
begin
  if not public.is_member(p_organization_id) then
    return false;
  end if;

  v_plan_code := public.get_organization_plan(p_organization_id);
  if v_plan_code is null then
    return false;
  end if;

  return exists (
    select 1
    from public.plan_features pf
    where pf.plan_code = v_plan_code
      and pf.feature_code = p_feature
  );
end;
$$;

comment on function public.can_use_feature(uuid, text) is
  'Entitlement : la feature est-elle activée par le plan courant de l''organisation ?';

-- 4.6 Limite d'une clé pour le plan courant (NULL si non définie → non bornée).
create or replace function public.get_plan_limit(
  p_organization_id uuid,
  p_limit_key text
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan_code text;
  v_limit numeric;
begin
  if not public.is_member(p_organization_id) then
    return null;
  end if;

  v_plan_code := public.get_organization_plan(p_organization_id);
  if v_plan_code is null then
    return null;
  end if;

  select pl.limit_value into v_limit
  from public.plan_limits pl
  where pl.plan_code = v_plan_code
    and pl.limit_key = p_limit_key;

  return v_limit;
end;
$$;

comment on function public.get_plan_limit(uuid, text) is
  'Valeur de limite d''une clé pour le plan courant (NULL = aucune limite définie).';

-- 4.7 Usage actuel d'une clé sur la période d'abonnement courante.
create or replace function public.get_usage(
  p_organization_id uuid,
  p_usage_key text
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_used numeric;
begin
  if not public.is_member(p_organization_id) then
    return null;
  end if;

  select s.current_period_start, s.current_period_end
  into v_period_start, v_period_end
  from public.get_current_subscription(p_organization_id) s;

  if not found then
    return 0;
  end if;

  select coalesce(sum(u.quantity), 0) into v_used
  from public.usage u
  where u.organization_id = p_organization_id
    and u.usage_key = p_usage_key
    and u.period_start = v_period_start
    and u.period_end = v_period_end;

  return v_used;
end;
$$;

comment on function public.get_usage(uuid, text) is
  'Usage agrégé d''une clé sur la période courante (0 si aucun abonnement courant).';

-- 4.8 Pré-vérification LECTURE SEULE : la consommation serait-elle acceptée ?
--     N'autorise jamais : `consume_usage` reste la porte d'autorité.
--     Sémantique alignée sur `consume_usage` :
--       - pas de membre               → false
--       - pas d'abonnement courant    → false
--       - aucune limite définie       → true (non borné)
--       - sinon usage + quantité ≤ limite.
create or replace function public.can_consume_usage(
  p_organization_id uuid,
  p_usage_key text,
  p_amount numeric
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan_code text;
  v_limit numeric;
  v_usage numeric;
begin
  if p_amount is null or p_amount < 0 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;

  if not public.is_member(p_organization_id) then
    return false;
  end if;

  v_plan_code := public.get_organization_plan(p_organization_id);
  if v_plan_code is null then
    return false;
  end if;

  select pl.limit_value into v_limit
  from public.plan_limits pl
  where pl.plan_code = v_plan_code
    and pl.limit_key = p_usage_key;

  if v_limit is null then
    return true;
  end if;

  v_usage := public.get_usage(p_organization_id, p_usage_key);
  return (v_usage + p_amount) <= v_limit;
end;
$$;

comment on function public.can_consume_usage(uuid, text, numeric) is
  'Vérification indicative alignée sur `consume_usage` (pas d''abonnement → false, limite non définie → true). Seul `consume_usage` décide réellement.';

-- 4.9 Consommation ATOMIQUE d'usage. Modifie `usage` + journalise dans
--     `usage_events`. Verrouille l'abonnement courant (FOR UPDATE) pour
--     sérialiser les consommations concurrentes d'une même organisation.
create or replace function public.consume_usage(
  p_organization_id uuid,
  p_usage_key text,
  p_amount numeric
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_code text;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_limit numeric;
  v_usage numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;

  if not public.is_member(p_organization_id) then
    raise exception 'insufficient_permission' using errcode = '42501';
  end if;

  -- Verrouille l'abonnement courant : les consommations concurrentes de la
  -- même organisation sont sérialisées sur cette ligne.
  select s.plan_code, s.current_period_start, s.current_period_end
  into v_plan_code, v_period_start, v_period_end
  from public.subscriptions s
  where s.organization_id = p_organization_id
    and public.subscription_is_current(
          s.status, s.current_period_start, s.current_period_end
        )
  order by s.created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'no_active_subscription' using errcode = 'P0001';
  end if;

  select pl.limit_value into v_limit
  from public.plan_limits pl
  where pl.plan_code = v_plan_code
    and pl.limit_key = p_usage_key;

  select coalesce(sum(u.quantity), 0) into v_usage
  from public.usage u
  where u.organization_id = p_organization_id
    and u.usage_key = p_usage_key
    and u.period_start = v_period_start
    and u.period_end = v_period_end;

  if v_limit is not null and (v_usage + p_amount) > v_limit then
    raise exception 'usage_limit_exceeded' using errcode = 'P0001';
  end if;

  insert into public.usage (organization_id, usage_key, period_start, period_end, quantity)
  values (p_organization_id, p_usage_key, v_period_start, v_period_end, p_amount)
  on conflict (organization_id, usage_key, period_start, period_end)
  do update set quantity = public.usage.quantity + excluded.quantity;

  insert into public.usage_events (
    organization_id, usage_key, period_start, period_end, amount, actor_id
  )
  values (
    p_organization_id, p_usage_key, v_period_start, v_period_end, p_amount,
    (select auth.uid())
  );

  return v_usage + p_amount;
end;
$$;

comment on function public.consume_usage(uuid, text, numeric) is
  'Enregistre une consommation d''usage après contrôle de la limite (atomique, sérialisée par abonnement). Retourne le nouveau total agrégé.';

-- 4.10 Vision complète limite/usage/restant pour le plan courant (dashboard).
create or replace function public.plan_limits_status(p_organization_id uuid)
returns table (limit_key text, limit_value numeric, used numeric, remaining numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan_code text;
begin
  if not public.is_member(p_organization_id) then
    return;
  end if;

  v_plan_code := public.get_organization_plan(p_organization_id);
  if v_plan_code is null then
    return;
  end if;

  return query
    select
      pl.limit_key,
      pl.limit_value,
      coalesce(u.used, 0) as used,
      greatest(pl.limit_value - coalesce(u.used, 0), 0) as remaining
    from public.plan_limits pl
    left join lateral (
      select sum(usage.quantity) as used
      from public.usage
      where usage.organization_id = p_organization_id
        and usage.usage_key = pl.limit_key
        and usage.period_start = s.current_period_start
        and usage.period_end = s.current_period_end
    ) u on true
    cross join public.get_current_subscription(p_organization_id) s
    where pl.plan_code = v_plan_code;
end;
$$;

comment on function public.plan_limits_status(uuid) is
  'État des limites du plan courant : limite, usage cumulé de la période et reste (dashboard).';

-- 5. Droits d'exécution des fonctions.
--    Les fonctions INTERNES (is_member, get_current_subscription,
--    subscription_is_current) ne sont pas exposées au client. Les fonctions
--    métier exposées sont réservées à `authenticated`.
revoke all on function public.is_member(uuid) from public;
revoke all on function public.get_current_subscription(uuid) from public;
revoke all on function public.subscription_is_current(text, timestamptz, timestamptz) from public;

revoke all on function public.get_organization_plan(uuid) from public;
grant execute on function public.get_organization_plan(uuid) to authenticated;

revoke all on function public.can_use_feature(uuid, text) from public;
grant execute on function public.can_use_feature(uuid, text) to authenticated;

revoke all on function public.get_plan_limit(uuid, text) from public;
grant execute on function public.get_plan_limit(uuid, text) to authenticated;

revoke all on function public.get_usage(uuid, text) from public;
grant execute on function public.get_usage(uuid, text) to authenticated;

revoke all on function public.can_consume_usage(uuid, text, numeric) from public;
grant execute on function public.can_consume_usage(uuid, text, numeric) to authenticated;

revoke all on function public.consume_usage(uuid, text, numeric) from public;
grant execute on function public.consume_usage(uuid, text, numeric) to authenticated;

revoke all on function public.plan_limits_status(uuid) from public;
grant execute on function public.plan_limits_status(uuid) to authenticated;

-- 6. RLS — activation et policies.
--    Catalogues : lecture publique (comme `roles`/`permissions`).
--    Tables d'organisation : SELECT via `billing.read`, AUCUNE écriture.
alter table public.plans        enable row level security;
alter table public.features     enable row level security;
alter table public.plan_features enable row level security;
alter table public.plan_limits  enable row level security;
alter table public.subscriptions enable row level security;
alter table public.usage        enable row level security;
alter table public.usage_events enable row level security;

create policy "plans_select_public"
  on public.plans
  for select
  to authenticated, anon
  using (true);

create policy "features_select_public"
  on public.features
  for select
  to authenticated, anon
  using (true);

create policy "plan_features_select_public"
  on public.plan_features
  for select
  to authenticated, anon
  using (true);

create policy "plan_limits_select_public"
  on public.plan_limits
  for select
  to authenticated, anon
  using (true);

create policy "subscriptions_select_billing"
  on public.subscriptions
  for select
  to authenticated
  using (public.has_permission(organization_id, 'billing.read'));

create policy "usage_select_billing"
  on public.usage
  for select
  to authenticated
  using (public.has_permission(organization_id, 'billing.read'));

create policy "usage_events_select_billing"
  on public.usage_events
  for select
  to authenticated
  using (public.has_permission(organization_id, 'billing.read'));

-- Aucune policy d'insertion/mise à jour/suppression sur subscriptions, usage
-- et usage_events : le client ne peut pas falsifier son abonnement ni son
-- usage. Les seules écritures passent par les fonctions security definer
-- (et, à terme, par le webhook de paiement côté backend).

-- 7. ACL tables — alignés sur les politiques.
--    Catalogues : lecture publique. Tables d'organisation : SELECT seulement
--    (les écritures directes sont impossibles sans ACL d'écriture).
grant select on public.plans, public.features,
  public.plan_features, public.plan_limits to anon, authenticated;

grant select on public.subscriptions, public.usage, public.usage_events
  to authenticated;

-- 8. Timestamps maintenus par le serveur.
create trigger handle_plans_updated_at
  before update on public.plans
  for each row execute function public.handle_updated_at();

create trigger handle_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.handle_updated_at();

create trigger handle_usage_updated_at
  before update on public.usage
  for each row execute function public.handle_updated_at();