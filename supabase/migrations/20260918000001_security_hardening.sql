-- Migration 20260918000001 — Security Hardening
-- ---------------------------------------------------------------------------
-- Corrections issues de l'audit de sécurité :
--   1. `plan_limits_status()` : vérifie `billing.read` au lieu de `is_member`
--      pour empêcher les membres non-admin de voir les données billing.
--   2. `cron_tasks` : restreint la lecture à `authenticated` (plus de `anon`).
-- ---------------------------------------------------------------------------

-- 1. Sécuriser plan_limits_status : billing.read requis (pas juste membership)
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

-- 2. Restreindre cron_tasks aux utilisateurs authentifiés (plus de anon)
--    Le payload peut contenir des informations sensibles à l'avenir.
--    ACL : révoque le SELECT pour anon (table-level).
revoke select on public.cron_tasks from anon;
--    RLS : remplace la policy pour n'autoriser que authenticated (defense in depth).
drop policy if exists "cron_tasks_select_public" on public.cron_tasks;
create policy "cron_tasks_select_authenticated"
  on public.cron_tasks
  for select
  to authenticated
  using (true);
