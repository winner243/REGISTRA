/**
 * Repository Groups — Data Access Layer Registra.
 * Appels RPC SQL (source de vérité) + fallback typé.
 * Toutes les fonctions vérifient l'appartenance organisationnelle via has_permission
 * côté RPC (security definer), le repository n'effectue pas de double vérification RLS.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { toCsvCell } from '@/lib/export/csv'
import type {
  Group,
  OrganizationRegistraSettings,
} from '../types'

/** Récupère les groupes d'une organisation (via RPC ou direct + RLS). */
export async function listGroups(orgId: string): Promise<Group[]> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('groups')
    .select('id, name, description, created_at, updated_at')
    .eq('organization_id', orgId)
    .order('name', { ascending: true })

  if (error) return []
  return (data ?? []) as Group[]
}

/** Crée un groupe via RPC security definer. */
export async function createGroup(
  orgId: string,
  name: string,
  description?: string
): Promise<{ group: Group; error?: string }> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return { group: {} as Group, error: 'Supabase non configuré' }

  try {
    const { data, error } = await supabase.rpc('create_group', {
      p_organization_id: orgId,
      p_name: name,
      p_description: description,
    })

    if (error) return { group: {} as Group, error: error.message }

    return { group: data as Group, error: undefined }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inattendue'
    return { group: {} as Group, error: message }
  }
}

/** Modifie un groupe via RPC. */
export async function updateGroup(
  groupId: string,
  name: string,
  description?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return { success: false, error: 'Supabase non configuré' }

  try {
    const { data, error } = await supabase.rpc('update_group', {
      p_group_id: groupId,
      p_name: name,
      p_description: description,
    })

    if (error) return { success: false, error: error.message }
    return { success: true, error: undefined }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inattendue'
    return { success: false, error: message }
  }
}

/** Supprime un groupe via RPC (cascade : personnes + attendance records). */
export async function deleteGroup(groupId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return { success: false, error: 'Supabase non configuré' }

  try {
    const { data, error } = await supabase.rpc('delete_group', {
      p_group_id: groupId,
    })

    if (error) return { success: false, error: error.message }
    return { success: true, error: undefined }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inattendue'
    return { success: false, error: message }
  }
}

/** Récupère la config Registra d'une organisation. */
export async function getOrgRegistraSettings(orgId: string): Promise<
  OrganizationRegistraSettings | null
> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('organization_registra_settings')
    .select('*')
    .eq('organization_id', orgId)
    .maybeSingle()

  if (error) return null
  return data as OrganizationRegistraSettings | null
}

/** Met à jour la config Registra d'une organisation. */
export async function updateOrgRegistraSettings(
  orgId: string,
  settings: Partial<OrganizationRegistraSettings>
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return { success: false, error: 'Supabase non configuré' }

  try {
    const { data, error } = await supabase
      .from('organization_registra_settings')
      .upsert(
        {
          organization_id: orgId,
          ...settings,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id' }
      )

    if (error) return { success: false, error: error.message }
    return { success: true, error: undefined }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inattendue'
    return { success: false, error: message }
  }
}

/** Exporte les groupes au format CSV (colonnes : id, name, description, org_type via settings). */
export async function exportGroupsCsv(orgId: string): Promise<string> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return ''

  const { data, error } = await supabase
    .from('groups')
    .select('id, name, description')
    .eq('organization_id', orgId)
    .order('name', { ascending: true })

  if (error || !data?.length) return ''

  const header = ['id', 'name', 'description']
  const lines = [header.map((h) => toCsvCell(h)).join(',')]
  for (const row of data) {
    lines.push(
      [row.id, row.name ?? '', row.description ?? ''].map((value) => toCsvCell(value)).join(','),
    )
  }

  const bom = '\uFEFF'
  return bom + lines.join('\u000d\u000a')
}
