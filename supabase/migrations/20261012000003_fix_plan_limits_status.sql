-- Migration 20261012000003 — Correctif plan_limits_status (portée LATERAL)
-- ---------------------------------------------------------------------------
-- Rôle : corriger `public.plan_limits_status(uuid)` qui échoue systématiquement
-- avec "missing FROM-clause entry for table s" (SQLSTATE 42P01).
--
-- Contenu : `create or replace function` avec le même corps, sauf l'ordre du
-- FROM : `cross join public.get_current_subscription(...) s` est déplacé AVANT
-- le `left join lateral`, qui référence `s.current_period_start/end`.
--
-- Décision d'intégrité :
--   * En SQL, un `LATERAL` ne peut référencer que les éléments situés à sa
--     GAUCHE dans le FROM. La version précédente plaçait la source `s` après
--     la sous-requête latérale qui l'utilise → erreur à chaque appel dès qu'un
--     plan possède des limites.
--   * Le déplacement est purement syntaxique : mêmes colonnes, mêmes jointures,
--     mêmes résultats. Aucune sémantique métier changée.
--   * La vérification `billing.read` (introduite par la migration
--     20260918000001_security_hardening) est conservée à l'identique.
-- ---------------------------------------------------------------------------

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
  if not public.has_permission(p_organization_id, 'billing.read') then
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
    cross join public.get_current_subscription(p_organization_id) s
    left join lateral (
      select sum(usage.quantity) as used
      from public.usage
      where usage.organization_id = p_organization_id
        and usage.usage_key = pl.limit_key
        and usage.period_start = s.current_period_start
        and usage.period_end = s.current_period_end
    ) u on true
    where pl.plan_code = v_plan_code;
end;
$$;

comment on function public.plan_limits_status(uuid) is
  'Statut des limites du plan courant (billing.read requis). Corrige la portée LATERAL de get_current_subscription.';
