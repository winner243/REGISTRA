-- Migration 20261012000001 — Correctif : visibilité de l'organisation par son créateur
-- ---------------------------------------------------------------------------
-- Rôle : permettre `INSERT ... RETURNING` sur `public.organizations` à son
-- créateur légitime (parcours de création d'organisation).
--
-- Contenu : la policy SELECT `organizations_select_member` accepte désormais
-- `created_by = auth.uid()` en complément de `has_permission(id, 'organization.read')`.
--
-- Décision d'intégrité :
--   * Symptôme : `insert into organizations (...) returning id` échoue avec
--     "new row violates row-level security policy" alors que le WITH CHECK
--     `organizations_insert_own` passe. Cause : PostgreSQL évalue les policies
--     SELECT sur les lignes retournées AVANT l'exécution des triggers AFTER ;
--     le membership `owner` créé par `handle_organization_created` n'existe pas
--     encore, donc `has_permission(id, 'organization.read')` est faux au moment
--     du check.
--   * Le correctif est volontairement minimal : le créateur ne peut être que
--     lui-même (le WITH CHECK de `organizations_insert_own` impose
--     `created_by = auth.uid() and created_by is not null`), donc aucun
--     contournement de l'isolation multi-tenant n'est possible.
--   * La matrice d'isolation reste intacte : un utilisateur d'une autre
--     organisation n'est ni créateur, ni membre → lecture toujours refusée.
--   * Policy modifiée via `ALTER POLICY` (nom et périmètre conservés).
-- ---------------------------------------------------------------------------

alter policy "organizations_select_member"
  on public.organizations
  using (
    has_permission(id, 'organization.read')
    or created_by = auth.uid()
  );
