-- Migration 20261012000002 — Verrouillage ACL des tables billing
-- ---------------------------------------------------------------------------
-- Rôle : rendre effectif l'intention documentée de la migration billing
-- (« les écritures directes sont impossibles sans ACL d'écriture »).
--
-- Contenu : revocation INSERT/UPDATE/DELETE pour `anon` et `authenticated` sur
-- les 7 tables billing (plans, features, plan_features, plan_limits,
-- subscriptions, usage, usage_events).
--
-- Décision d'intégrité :
--   * Constat : la plateforme Supabase pré-accorde (default privileges) les
--     droits d'écriture sur les nouvelles tables publiques à `anon` /
--     `authenticated`. Seul le RLS bloquait alors les écritures — en SILENCE
--     (0 ligne affectée) pour UPDATE/DELETE, avec une erreur 42501 seulement
--     pour INSERT. Un client pouvait donc émettre des UPDATE/DELETE sans refus
--     explicite.
--   * Après ce correctif, toute écriture client sur ces tables lève
--     "permission denied for table" (SQLSTATE 42501) : refus explicite, exigé
--     par `tests/db/billing-tests.sql` (section "aucune écriture client").
--   * Les SELECT restent inchangés (catalogues publics lecture seule ;
--     subscriptions/usage/usage_events filtrés par `billing.read` via RLS).
--   * `service_role` n'est pas touché : les opérations serveur (worker,
--     futur webhook de paiement, Super Admin Panel lecture seule) conservent
--     leurs capacités.
--   * Les écritures de test/backend continuent de passer par `postgres` ou
--     `service_role`, jamais par `authenticated`.
-- ---------------------------------------------------------------------------

revoke insert, update, delete
  on public.plans, public.features, public.plan_features, public.plan_limits
  from anon, authenticated;

revoke insert, update, delete
  on public.subscriptions, public.usage, public.usage_events
  from anon, authenticated;
