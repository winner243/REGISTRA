-- Migration 20260907000004 — Résilience : file d'attente email (outbox)
-- ---------------------------------------------------------------------------
-- Rôle : rendre les emails du Starter fiables, idempotents et retryables,
-- sans queue externe (aucune dépendance broker). On écrit d'abord l'email
-- dans `email_outbox`, puis un worker l'envoie et lève le statut.
-- ---------------------------------------------------------------------------
-- Principes de sécurité :
--   * `email_outbox` est STRICTEMENT côté serveur : RLS activée, AUCUNE
--     policy → aucun accès client (anon/authenticated ne peuvent rien lire) ;
--   * toutes les opérations passent par des fonctions `security definer`
--     (`search_path = ''`) et ne sont exécutables QUE par `service_role` ;
--   * le `payload` ne contient que des données minimales et non sensibles
--     (pas de token, pas de secrets) ; le contenu du mail est porté par
--     `body_html` / `body_text` (lui-même accessible uniquement via
--     `service_role`).
-- ---------------------------------------------------------------------------
-- Décisions d'intégrité :
--   * `unique (type, reference_id)` → idempotence : ré-insérer le même email
--     (même invitation, même facture…) n'envoie JAMAIS de doublon ;
--   * statuts : queued → processing → sent | failed (transitions pilotées par
--     le worker) ;
--   * `attempts` + `next_attempt_at` → backoff du worker, plafonné hors SQL ;
--   * un email `failed` repasse `queued` dès que `next_attempt_at` est atteint
--     (le worker re-claim automatiquement, sans passer par un statut séparé) ;
--   * pas de `deleted_at` ici : la purge des lignes obsolètes (sent/failed)
--     est un choix d'exploitation documenté dans `docs/email.md`.
-- ---------------------------------------------------------------------------

-- 1. Table outbox
create table public.email_outbox (
  id               uuid primary key default gen_random_uuid(),
  type             text not null check (
                     length(btrim(type)) between 1 and 80
                   ),
  reference_id     text not null check (length(btrim(reference_id)) between 1 and 200),
  recipient        text not null check (
                     recipient = lower(btrim(recipient))
                     and recipient ~ '^[^@[:space:]]+@[^@[:space:]]+$'
                   ),
  subject          text not null check (length(btrim(subject)) between 1 and 200),
  body_html        text not null check (length(btrim(body_html)) >= 1),
  body_text        text,
  payload          jsonb not null default '{}'::jsonb,
  status           text not null default 'queued' check (status in ('queued', 'processing', 'sent', 'failed')),
  attempts         integer not null default 0 check (attempts >= 0),
  next_attempt_at  timestamptz not null default now(),
  last_error       text,
  sent_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (type, reference_id)
);

comment on table public.email_outbox is
  'File outbox des emails. Côté serveur uniquement (service_role), jamais lisible par le client.';
comment on column public.email_outbox.type is
  'Type de l''email (ex. invitation). Sert de clé d''idempotence avec reference_id.';
comment on column public.email_outbox.reference_id is
  'Référence métier unique (ex. id d''invitation). `unique(type, reference_id)` = pas de doublon.';
comment on column public.email_outbox.payload is
  'Données minimales non sensibles (jamais de token ni de secret).';
comment on column public.email_outbox.status is
  'Cycle : queued → processing → sent | failed.';
comment on column public.email_outbox.attempts is 'Nombre de tentatives d''envoi déjà effectuées.';
comment on column public.email_outbox.next_attempt_at is
  'Prochaine fenêtre d''envoi. Un email failed est re-réclamé automatiquement à cette date.';

--    Sert le claim du worker (`WHERE status ... AND next_attempt_at <= now()`).
create index email_outbox_due_idx
  on public.email_outbox (status, next_attempt_at);

-- 2. Timestamps maintenus par le serveur (fonction existante de la fondation).
create trigger handle_email_outbox_updated_at
  before update on public.email_outbox
  for each row execute function public.handle_updated_at();

-- 3. Mise en file (idempotente) : insère ou retourne l'id de la ligne.
--    Retourne NULL si (type, reference_id) existe déjà (aucun doublon),
--    l'id de la nouvelle ligne sinon (permet au worker de la marquer ensuite).
create or replace function public.queue_email(
  p_type text,
  p_reference_id text,
  p_recipient text,
  p_subject text,
  p_body_html text,
  p_body_text text,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_recipient));
  v_id    uuid;
begin
  insert into public.email_outbox (
    type, reference_id, recipient, subject, body_html, body_text, payload
  )
  values (
    p_type, p_reference_id, v_email, p_subject, p_body_html, p_body_text,
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (type, reference_id) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.queue_email(text, text, text, text, text, text, jsonb) is
  'Insère un email dans l''outbox. Retourne l''id de la ligne insérée, NULL si (type, reference_id) existe déjà (idempotence).';

-- 4. Réclame un lot de emails dus (queued ou failed dont la fenêtre est atteinte).
--    `for update skip locked` : plusieurs workers concurrents ne se volent
--    jamais la même ligne. `attempts + 1` : comptabilise la tentative.
create or replace function public.claim_email_batch(p_limit integer)
returns setof public.email_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
    update public.email_outbox e
       set status = 'processing',
           attempts = e.attempts + 1,
           updated_at = now()
     where e.id in (
       select o.id
       from public.email_outbox o
       where o.status in ('queued', 'failed')
         and o.next_attempt_at <= now()
       order by o.next_attempt_at asc
       limit p_limit
       for update skip locked
     )
    returning e.*;
end;
$$;

comment on function public.claim_email_batch(integer) is
  'Réclame jusqu''à p_limit emails dus (queued/failed), les passe en processing et les retourne.';

-- 5. Marquage des fins de traitement.
create or replace function public.mark_email_sent(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.email_outbox e
     set status = 'sent',
         sent_at = now(),
         last_error = null,
         updated_at = now()
   where e.id = p_id;

  return found;
end;
$$;

comment on function public.mark_email_sent(uuid) is
  'Marque un email comme envoyé (statut sent, sent_at).';

create or replace function public.mark_email_failed(
  p_id uuid,
  p_error text,
  p_next_attempt_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.email_outbox e
     set status = 'failed',
         last_error = left(p_error, 500),
         next_attempt_at = p_next_attempt_at,
         updated_at = now()
   where e.id = p_id;

  return found;
end;
$$;

comment on function public.mark_email_failed(uuid, text, timestamptz) is
  'Marque un email en échec et planifie sa prochaine tentative (next_attempt_at).';

-- 6. RLS : activée et SANS AUCUNE policy → illisible et inatteignable par le client.
alter table public.email_outbox enable row level security;

-- 7. Droits (ACL) : réservé à `service_role`, retiré à tous les autres.
revoke all on table public.email_outbox from anon, authenticated;
revoke all on table public.email_outbox from public;

revoke all on function public.queue_email(text, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.queue_email(text, text, text, text, text, text, jsonb) to service_role;

revoke all on function public.claim_email_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_email_batch(integer) to service_role;

revoke all on function public.mark_email_sent(uuid) from public, anon, authenticated;
grant execute on function public.mark_email_sent(uuid) to service_role;

revoke all on function public.mark_email_failed(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.mark_email_failed(uuid, text, timestamptz) to service_role;