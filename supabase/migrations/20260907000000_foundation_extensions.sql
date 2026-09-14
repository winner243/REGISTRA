-- Migration 20260907000000 — Fondation : extensions et helpers génériques
-- ---------------------------------------------------------------------------
-- Rôle : outillage minimal et générique, réutilisable par la table de fondation
-- (`profiles`) et par les futures tables métier des SaaS construits sur le
-- Starter. Idempotent : s'exécute sans erreur sur un environnement propre.
-- ---------------------------------------------------------------------------
-- Contenu :
--   1. Extension `pgcrypto`  → `gen_random_uuid()` (génération d'UUID côté base).
--   2. Trigger générique `public.handle_updated_at()` → maintient `updated_at`
--      sur toute table disposant d'une colonne `updated_at`.
-- ---------------------------------------------------------------------------

-- 1. Extension UUID (disponible nativement sur Supabase).
--    `gen_random_uuid()` est utilisé pour générer des identifiants côté base
--    quand aucune valeur n'est fournie par l'application.
create extension if not exists "pgcrypto" with schema extensions;

-- 2. Trigger générique de mise à jour de `updated_at`.
--    À brancher sur toute table qui possède une colonne `updated_at timestamptz`.
--    - `search_path = ''` : empêche toute résolution non qualifiée (durcissement).
--    - aucun accès réseau, aucune requête externe : simple écriture de colonne.
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.handle_updated_at() is
  'Trigger générique : met à jour `updated_at` avant une mise à jour de ligne.';