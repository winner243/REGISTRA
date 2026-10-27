/**
 * Repository Persons — Data Access Layer Registra.
 * Gestion des personnes dans les groupes + student_id unicité.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { toCsvCell } from '@/lib/export/csv'
import type { Person } from '../types'
import { can, requirePermission } from '@/lib/rbac'
import { getCurrentUser } from '@/lib/auth/session'

/** Récupère les personnes d'un groupe. */
export async function listPersons(groupId: string): Promise<Person[]> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('persons')
    .select('id, group_id, first_name, last_name, student_id, created_at, updated_at')
    .eq('group_id', groupId)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })

  if (error) return []
  return (data ?? []) as Person[]
}

/** Crée une personne via RPC security definer (vérifie persons.write + unicité student_id). */
export async function createPerson(
  groupId: string,
  firstName: string,
  lastName: string,
  studentId?: string
): Promise<{ person: Person; error?: string }> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return { person: {} as Person, error: 'Supabase non configuré' }

  try {
    const { data, error } = await supabase.rpc('create_person', {
      p_group_id: groupId,
      p_first_name: firstName,
      p_last_name: lastName,
      p_student_id: studentId,
    })

    if (error) return { person: {} as Person, error: error.message }
    return { person: data as Person, error: undefined }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inattendue'
    return { person: {} as Person, error: message }
  }
}

/** Modifie une personne via RPC. */
export async function updatePerson(
  personId: string,
  firstName?: string,
  lastName?: string,
  studentId?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return { success: false, error: 'Supabase non configuré' }

  try {
    const { data, error } = await supabase.rpc('update_person', {
      p_person_id: personId,
      p_first_name: firstName,
      p_last_name: lastName,
      p_student_id: studentId,
    })

    if (error) return { success: false, error: error.message }
    return { success: true, error: undefined }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inattendue'
    return { success: false, error: message }
  }
}

/** Supprime une personne via RPC (cascade : enregistrements présence associés). */
export async function deletePerson(personId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return { success: false, error: 'Supabase non configuré' }

  try {
    const { data, error } = await supabase.rpc('delete_person', {
      p_person_id: personId,
    })

    if (error) return { success: false, error: error.message }
    return { success: true, error: undefined }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inattendue'
    return { success: false, error: message }
  }
}

/** Exporte les personnes au format CSV (colonnes : group, last_name, first_name, student_id). */
export async function exportPersonsCsv(groupId: string): Promise<string> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return ''

  const { data, error } = await supabase
    .from('persons')
    .select('group_id, first_name, last_name, student_id')
    .eq('group_id', groupId)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })

  if (error || !data?.length) return ''

  const header = ['group', 'last_name', 'first_name', 'student_id']
  const lines = [header.map((h) => toCsvCell(h)).join(',')]
  for (const row of data) {
    const groupName = (await getGroupName(row.group_id)) ?? ''
    lines.push(
      [groupName, row.last_name, row.first_name, row.student_id ?? '']
        .map((value) => toCsvCell(value))
        .join(','),
    )
  }

  const bom = '\uFEFF'
  return bom + lines.join('\u000d\u000a')
}

async function getGroupName(groupId: string): Promise<string> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return ''

  const { data, error } = await supabase
    .from('groups')
    .select('name')
    .eq('id', groupId)
    .maybeSingle()

  if (error || !data) return ''
  return data.name
}