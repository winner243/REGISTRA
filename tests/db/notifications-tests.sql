-- Notifications tests — catalogue, création serveur, ownership, préférences, sécurité
-- ---------------------------------------------------------------------------
-- Exécuté par la CI (job `db-migrations`) APRÈS `tests/db/email-outbox-tests.sql`.
-- Les helpers (re)créés ici rendent le fichier autonome. Matrice testée :
--
--   Catalogue   : seed du type `general` (canaux in_app + email), lecture
--                 publique, type inconnu/désactivé REFUSÉ à la création
--   Création    : create_notification (service_role) insère l'inbox du
--                 destinataire ; notify_organization_members insère UNE ligne
--                 par membre de l'organisation
--   Ownership   : chacun ne voit QUE ses propres notifications (RLS) ; le
--                 marquage « lu » d'une ligne d'autrui est IGNORÉ ; la
--                 suppression d'une ligne d'autrui est vide
--   Préférences : l'utilisateur lit/crée/modifie SES préférences (upsert par
--                 canal), jamais celles d'un autre ; anon invisible
--   Sécurité    : aucune écriture client directe de notifications ;
--                 create_notification / notify_organization_members réservées
--                 à service_role ; anon ne voit jamais la boîte in-app
--
-- Fixtures : alice (…001) OWNER de Notif Alpha, bob (…002) OWNER de Notif
-- Beta, carol (…003) MEMBER de Notif Alpha.
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
    raise exception 'NOTIFICATIONS FAILED: %', p_message;
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
    raise exception 'NOTIFICATIONS FAILED: refus attendu, mais instruction réussie: %', p_sql;
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
    raise exception 'NOTIFICATIONS FAILED: SQLSTATE % attendu, % obtenu: %', p_sqlstate, sqlstate, p_sql;
  end;
  raise exception 'NOTIFICATIONS FAILED: échec (% ) attendu, mais instruction réussie: %', p_sqlstate, p_sql;
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
values ('Notif Alpha', '00000000-0000-0000-0000-000000000001')
returning id \gset notif_a_

select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000002', false);

insert into public.organizations (name, created_by)
values ('Notif Beta', '00000000-0000-0000-0000-000000000002')
returning id \gset notif_b_

reset role;

--    Carol devient MEMBER de Notif Alpha (fixture directe, écriture serveur).
insert into public.memberships (organization_id, user_id, role)
values (:'notif_a_id'::uuid, '00000000-0000-0000-0000-000000000003', 'member')
on conflict (organization_id, user_id) do nothing;

-- =============================================================================
-- 2. Catalogue des templates
-- =============================================================================
select public._test_assert(
  (select count(*) from public.notification_templates t
    where t.name = 'general' and t.enabled and 'in_app' = any (t.channels)
      and 'email' = any (t.channels)) = 1,
  'le seed doit fournir le type général (in_app + email)'
);

--    Lecture publique du catalogue (anon).
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select public._test_assert(
  (select count(*) from public.notification_templates) >= 1,
  'le catalogue des templates est lisible par anon (catalogue)'
);
reset role;

-- =============================================================================
-- 3. Création côté serveur (service_role)
-- =============================================================================
set role service_role;
select set_config('request.jwt.claim.sub', '', false);

select public.create_notification(
  '00000000-0000-0000-0000-000000000001',
  'general',
  'Bienvenue',
  'Contenu de la notification.',
  :'notif_a_id'::uuid,
  '{"ref":"n1"}'::jsonb
) as notif_a_n1 \gset

select public._test_assert(
  :'notif_a_n1' is not null,
  'create_notification doit retourner l''id de la notification'
);
select public._test_assert(
  (select count(*) from public.notifications n
    where n.id = :'notif_a_n1'::uuid
      and n.user_id = '00000000-0000-0000-0000-000000000001'
      and n.type = 'general'
      and n.organization_id = :'notif_a_id'::uuid
      and n.read_at is null) = 1,
  'create_notification doit insérer une ligne non lue pour le destinataire'
);

--    Type inconnu / in_app non autorisé → refus (42501), aucune ligne créée.
select public._test_expect_sqlstate(
  'select public.create_notification(''00000000-0000-0000-0000-000000000001'', ''unknown'', ''t'', ''b'', null, ''{}''::jsonb)',
  '42501'
);

--    Brande une organisation : UNE ligne par membre (alice + carol).
select public.notify_organization_members(
  :'notif_a_id'::uuid,
  'general',
  'Nouveau membre',
  'Quelqu''un a rejoint l''équipe.',
  '{}'::jsonb
) as notif_org_count \gset

select public._test_assert(
  :'notif_org_count'::integer = 2,
  'notify_organization_members doit créer une ligne pour chaque membre (2)'
);
select public._test_assert(
  (select count(*) from public.notifications n
    where n.organization_id = :'notif_a_id'::uuid
      and n.title = 'Nouveau membre') = 2,
  'les deux membres de Notif Alpha doivent recevoir la notification'
);

reset role;

-- =============================================================================
-- 4. Ownership — chacun ne voit QUE ses propres notifications
-- =============================================================================
set role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001', false);

select public._test_assert(
  (select count(*) from public.notifications) =
    (select count(*) from public.notifications n where n.user_id = '00000000-0000-0000-0000-000000000001'),
  'alice ne doit voir QUE ses propres notifications'
);
select public._test_assert(
  (select count(*) from public.notifications n
    where n.user_id = '00000000-0000-0000-0000-000000000003') = 0,
  'alice ne doit JAMAIS voir les notifications de carol (même organisation)'
);
select public._test_assert(
  (select count(*) from public.notifications n
    where n.organization_id = :'notif_b_id'::uuid) = 0,
  'alice ne doit rien voir de Notif Beta'
);

--    Marquage « lu » : les ids de carol sont ignorés, ceux d'alice marqués.
select public.mark_notifications_read(
  array[
    (select n.id from public.notifications n
      where n.user_id = '00000000-0000-0000-0000-000000000003' limit 1),
    :'notif_a_n1'::uuid
  ]
) as notif_marked \gset

select public._test_assert(
  :'notif_marked'::integer = 1,
  'mark_notifications_read ne doit marquer QUE les notifications de l''appelant'
);
select public._test_assert(
  (select count(*) from public.notifications n
    where n.id = :'notif_a_n1'::uuid and n.read_at is not null) = 1,
  'la notification d''alice doit être marquée lue'
);

--    Suppression : alice efface sa ligne, les lignes de carol restent (RLS).
select (select count(*) from public.notifications) as notif_total \gset

delete from public.notifications n
 where n.id = (select n2.id from public.notifications n2
               where n2.user_id = '00000000-0000-0000-0000-000000000003' limit 1);

select public._test_assert(
  (select count(*) from public.notifications) = :'notif_total'::integer,
  'supprimer la notification de carol depuis alice doit affecter 0 ligne'
);

-- =============================================================================
-- 5. Préférences par utilisateur
-- =============================================================================
--    Alice crée puis met à jour SA préférence email.
insert into public.notification_preferences (user_id, channel, enabled)
values ('00000000-0000-0000-0000-000000000001', 'email', true)
on conflict (user_id, channel) do update set enabled = excluded.enabled;

update public.notification_preferences
   set enabled = false
 where user_id = '00000000-0000-0000-0000-000000000001'
   and channel = 'email';

select public._test_assert(
  (select count(*) from public.notification_preferences p
    where p.user_id = '00000000-0000-0000-0000-000000000001'
      and p.channel = 'email' and not p.enabled) = 1,
  'alice doit pouvoir créer puis mettre à jour sa préférence email'
);

--    Bob ne voit pas / ne modifie pas la préférence d'alice (RLS, filtré).
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000002', false);

select public._test_assert(
  (select count(*) from public.notification_preferences) =
    (select count(*) from public.notification_preferences p
      where p.user_id = '00000000-0000-0000-0000-000000000002'),
  'bob ne doit voir QUE ses propres préférences'
);

update public.notification_preferences
   set enabled = true
 where user_id = '00000000-0000-0000-0000-000000000001';

select public._test_assert(
  (select count(*) from public.notification_preferences p
    where p.user_id = '00000000-0000-0000-0000-000000000001'
      and p.channel = 'email' and not p.enabled) = 1,
  'bob ne doit PAS pouvoir modifier la préférence d''alice'
);

reset role;

-- =============================================================================
-- 6. Sécurité — aucune écriture client, fonctions réservées
-- =============================================================================
set role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001', false);

--    INSERT de notification direct par le client : refusé (aucune policy).
select public._test_expect_denied(
  format('insert into public.notifications (user_id, type, title)
          values (%L, %L, %L)',
    '00000000-0000-0000-0000-000000000001', 'general', 'hack')
);

--    UPDATE de notification par le client : refusé (aucune policy UPDATE).
select public._test_expect_denied(
  format('update public.notifications set title = %L where user_id = %L',
    'hack', '00000000-0000-0000-0000-000000000001')
);

--    Pas d'exécution de la création par un client authentifié.
select public._test_expect_denied(
  format('select public.create_notification(%L, %L, %L, %L, null, %L::jsonb)',
    '00000000-0000-0000-0000-000000000001', 'general', 't', 'b', '{}')
);
select public._test_expect_denied(
  format('select public.notify_organization_members(%L, %L, %L, %L, %L::jsonb)',
    '00000000-0000-0000-0000-000000000099', 'general', 't', 'b', '{}')
);

reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);

select public._test_assert(
  (select count(*) from public.notifications) = 0,
  'anon ne doit voir AUCUNE notification'
);
select public._test_assert(
  (select count(*) from public.notification_preferences) = 0,
  'anon ne doit voir AUCUNE préférence'
);
select public._test_expect_denied(
  'select public.mark_notifications_read(array[null]::uuid[])'
);

-- =============================================================================
-- 7. Vérifications structurelles
-- =============================================================================
reset role;

select public._test_assert(
  (select count(*) from pg_tables t
    where t.schemaname = 'public'
      and t.tablename in ('notification_templates', 'notification_preferences', 'notifications')
      and t.relrowsecurity) = 3,
  'RLS doit être activé sur les trois tables de notifications'
);

--    Aucune policy INSERT / UPDATE sur les notifications (écritures serveur).
select public._test_assert(
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'notifications'
      and p.cmd in ('INSERT', 'UPDATE')) = 0,
  'notifications ne doit avoir AUCUNE policy INSERT ni UPDATE'
);

--    Création réservée à service_role (jamais aux rôles clients).
select public._test_assert(
  not exists (
    select 1 from information_schema.role_routine_grants g
    where g.routine_schema = 'public'
      and g.privilege_type = 'EXECUTE'
      and g.grantee in ('PUBLIC', 'PUBLIC/authenticated', 'PUBLIC/anon')
      and g.routine_name in ('create_notification', 'notify_organization_members')
  ),
  'la création de notifications ne doit être exécutable ni par PUBLIC, ni par les rôles clients'
);
select public._test_assert(
  exists (
    select 1 from information_schema.role_routine_grants g
    where g.routine_schema = 'public'
      and g.privilege_type = 'EXECUTE'
      and g.grantee = 'service_role'
      and g.routine_name in ('create_notification', 'notify_organization_members')
  ),
  'service_role doit exécuter la création de notifications'
);
select public._test_assert(
  exists (
    select 1 from information_schema.role_routine_grants g
    where g.routine_schema = 'public'
      and g.privilege_type = 'EXECUTE'
      and g.grantee in ('authenticated', 'PUBLIC/authenticated')
      and g.routine_name = 'mark_notifications_read'
  ),
  'mark_notifications_read doit être exécutable par authenticated'
);

-- =============================================================================
-- 8. Succès
-- =============================================================================
\echo 'NOTIFICATIONS TESTS PASSED'