"use server"

import { requireUser } from '@/lib/auth/session'
import { requirePermission } from '@/lib/rbac'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { Group, Person, AttendanceRecord, AttendanceStatus } from './types'
import {
  listGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  getOrgRegistraSettings,
  updateOrgRegistraSettings,
  exportGroupsCsv as repoExportGroupsCsv,
} from './repositories/groups'
import {
  listPersons,
  createPerson,
  updatePerson,
  deletePerson,
  exportPersonsCsv as repoExportPersonsCsv,
} from './repositories/persons'
import {
  markAttendance,
  bulkMarkAttendance,
  getAttendanceStatuses,
  exportAttendanceCsv as repoExportAttendanceCsv,
} from './repositories/attendance'
import { getVocab, defaultVocab, type VocabConfig } from './vocab'
import type { OrgType } from './vocab'
import { computeNextMatricule } from './utils'
import { evaluateLimit, getPlanLimit } from '@/lib/billing'
import type { LimitEvaluation, PlanSummary } from '@/lib/billing'

const emptyGroup = (): Group => ({
  id: '',
  organization_id: '',
  name: '',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
})

const emptyPerson = (): Person => ({
  id: '',
  group_id: '',
  first_name: '',
  last_name: '',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
})

const emptyAttendanceRecord = (): AttendanceRecord => ({
  id: '',
  organization_id: '',
  group_id: '',
  person_id: '',
  record_date: new Date().toISOString().split('T')[0],
  status: 'unmarked',
  marked_by: null,
  marked_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
})

/** GROUPES ****************************************************************/

/**
 * Liste TOUS les groupes des établissements accessibles à l'utilisateur (RLS).
 * Aucune organisation n'est choisie implicitement : le client voit l'ensemble
 * de ses groupes, chaque établissement restant isolé par RLS.
 */
export async function listUserGroups(): Promise<{ groups: Array<Group & { orgName?: string }>; error?: string }> {
  await requireUser()
  const supabase = await createSupabaseServerClient()
  if (!supabase) return { groups: [], error: 'Supabase non configuré' }

  const { data, error } = await supabase
    .from('groups')
    .select('id, organization_id, name, description, created_at, updated_at, organizations (name)')
    .order('name', { ascending: true })

  if (error) return { groups: [], error: error.message }

  const groups = (data ?? []).map((row) => {
    const org = row.organizations as unknown
    const orgName = Array.isArray(org)
      ? ((org[0] as { name?: string } | undefined)?.name ?? '')
      : ((org as { name?: string } | null)?.name ?? '')
    return {
      id: row.id,
      organization_id: row.organization_id,
      name: row.name,
      description: row.description ?? undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
      orgName,
    } as Group & { orgName?: string }
  })

  return { groups, error: undefined }
}

/** Groupes d'un établissement donné (permission `groups.read` sur cet établissement). */
export async function listOrganizationGroups(
  orgId: string
): Promise<{ groups: Group[]; error?: string }> {
  await requireUser()
  if (!orgId) return { groups: [], error: 'Établissement requis' }
  try {
    await requirePermission(orgId, 'groups.read')
  } catch (err) {
    return { groups: [], error: permissionMessage(err) }
  }
  const groups = await listGroups(orgId)
  return { groups, error: undefined }
}

/** Crée un groupe dans l'établissement explicitement fourni (`groups.write`). */
export async function createGroupAction(
  orgId: string,
  name: string,
  description?: string
): Promise<{ group: Group; error?: string }> {
  await requireUser()
  if (!orgId) return { group: emptyGroup(), error: 'Établissement requis' }

  try {
    await requirePermission(orgId, 'groups.write')
  } catch (err) {
    return { group: emptyGroup(), error: permissionMessage(err) }
  }

  const { group, error } = await createGroup(orgId, name, description)
  if (error) return { group: emptyGroup(), error }
  return { group, error: undefined }
}

/** Modifie un groupe (l'établissement est résolu depuis le groupe). */
export async function updateGroupAction(
  groupId: string,
  name: string,
  description?: string
): Promise<{ success: boolean; error?: string }> {
  await requireUser()
  const orgId = await resolveGroupOrgId(groupId)
  if (!orgId) return { success: false, error: 'Groupe introuvable' }

  try {
    await requirePermission(orgId, 'groups.write')
  } catch (err) {
    return { success: false, error: permissionMessage(err) }
  }

  const { success, error } = await updateGroup(groupId, name, description)
  if (!success) return { success: false, error }
  return { success: true, error: undefined }
}

/** Supprime un groupe (cascade : personnes + attendance records). */
export async function deleteGroupAction(groupId: string): Promise<{ success: boolean; error?: string }> {
  await requireUser()
  const orgId = await resolveGroupOrgId(groupId)
  if (!orgId) return { success: false, error: 'Groupe introuvable' }

  try {
    await requirePermission(orgId, 'groups.write')
  } catch (err) {
    return { success: false, error: permissionMessage(err) }
  }

  const { success, error } = await deleteGroup(groupId)
  if (!success) return { success: false, error }
  return { success: true, error: undefined }
}

/** PERSONNES **************************************************************/

export async function listUserGroupPersons(groupId: string): Promise<{ persons: Person[]; error?: string }> {
  await requireUser()
  const orgId = await resolveGroupOrgId(groupId)
  if (!orgId) return { persons: [], error: 'Groupe introuvable' }

  try {
    await requirePermission(orgId, 'persons.read')
  } catch (err) {
    return { persons: [], error: permissionMessage(err) }
  }

  const persons = await listPersons(groupId)
  return { persons, error: undefined }
}

/** Crée une personne dans un groupe (établissement résolu depuis le groupe). */
export async function createPersonAction(
  groupId: string,
  firstName: string,
  lastName: string,
  studentId?: string
): Promise<{ person: Person; error?: string }> {
  await requireUser()
  const orgId = await resolveGroupOrgId(groupId)
  if (!orgId) return { person: emptyPerson(), error: 'Groupe introuvable' }

  try {
    await requirePermission(orgId, 'persons.write')
  } catch (err) {
    return { person: emptyPerson(), error: permissionMessage(err) }
  }

  const { person, error } = await createPerson(groupId, firstName, lastName, studentId)
  if (error) return { person: emptyPerson(), error }
  return { person, error: undefined }
}

/** Modifie une personne (établissement résolu depuis la personne). */
export async function updatePersonAction(
  personId: string,
  firstName?: string,
  lastName?: string,
  studentId?: string
): Promise<{ success: boolean; error?: string }> {
  await requireUser()
  const orgId = await resolvePersonOrgId(personId)
  if (!orgId) return { success: false, error: 'Personne introuvable' }

  try {
    await requirePermission(orgId, 'persons.write')
  } catch (err) {
    return { success: false, error: permissionMessage(err) }
  }

  const { success, error } = await updatePerson(personId, firstName, lastName, studentId)
  if (!success) return { success: false, error }
  return { success: true, error: undefined }
}

/** Supprime une personne (cascade : enregistrements présence). */
export async function deletePersonAction(personId: string): Promise<{ success: boolean; error?: string }> {
  await requireUser()
  const orgId = await resolvePersonOrgId(personId)
  if (!orgId) return { success: false, error: 'Personne introuvable' }

  try {
    await requirePermission(orgId, 'persons.write')
  } catch (err) {
    return { success: false, error: permissionMessage(err) }
  }

  const { success, error } = await deletePerson(personId)
  if (!success) return { success: false, error }
  return { success: true, error: undefined }
}

/** PRÉSENCE ***************************************************************/

/** Récupère le statut de présence de chaque personne d'un groupe pour une date. */
export async function getGroupAttendance(
  groupId: string,
  recordDate: string
): Promise<{
  persons: Array<{ id: string; first_name: string; last_name: string; student_id?: string; currentStatus: string; nextStatus: string }>
  summary: { present: number; late: number; absent: number; unmarked: number; total: number }
  nextForEach: Record<string, string>
  error?: string
}> {
  await requireUser()
  const orgId = await resolveGroupOrgId(groupId)
  if (!orgId) {
    return {
      persons: [],
      summary: { present: 0, late: 0, absent: 0, unmarked: 0, total: 0 },
      nextForEach: {},
      error: 'Groupe introuvable',
    }
  }

  try {
    await requirePermission(orgId, 'attendance.read')
  } catch (err) {
    return {
      persons: [],
      summary: { present: 0, late: 0, absent: 0, unmarked: 0, total: 0 },
      nextForEach: {},
      error: permissionMessage(err),
    }
  }

  const { persons, summary, nextForEach } = await getAttendanceStatuses(groupId, recordDate)

  return {
    persons: persons.map((p) => ({
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      student_id: p.student_id,
      currentStatus: (p as unknown as { currentStatus?: string }).currentStatus ?? 'unmarked',
      nextStatus: (p as unknown as { nextStatus?: string }).nextStatus ?? 'present',
    })),
    summary,
    nextForEach: Object.fromEntries(Object.entries(nextForEach).map(([k, v]) => [k, String(v)])),
    error: undefined,
  }
}

/** Marque la présence pour une personne. */
export async function markAttendanceAction(
  groupId: string,
  recordDate: string,
  personId: string,
  status: string
): Promise<{ record: AttendanceRecord; error?: string }> {
  await requireUser()
  const orgId = await resolveGroupOrgId(groupId)
  if (!orgId) return { record: emptyAttendanceRecord(), error: 'Groupe introuvable' }

  try {
    await requirePermission(orgId, 'attendance.write')
  } catch (err) {
    return { record: emptyAttendanceRecord(), error: permissionMessage(err) }
  }

  const validStatuses: AttendanceStatus[] = ['unmarked', 'present', 'late', 'absent']
  const normalizedStatus = validStatuses.includes(status as AttendanceStatus) ? (status as AttendanceStatus) : 'unmarked'

  const { record, error } = await markAttendance(groupId, recordDate, personId, normalizedStatus)
  if (error) return { record, error }
  return { record, error: undefined }
}

/** Marque la présence pour plusieurs personnes (bulk). */
export async function bulkMarkAttendanceAction(
  groupId: string,
  recordDate: string,
  statusMap: Record<string, string>
): Promise<{ result: { created: number; updated: number; errors: string[] }; error?: string }> {
  await requireUser()
  const orgId = await resolveGroupOrgId(groupId)
  if (!orgId) return { result: { created: 0, updated: 0, errors: ['Groupe introuvable'] }, error: 'Groupe introuvable' }

  try {
    await requirePermission(orgId, 'attendance.write')
  } catch (err) {
    const message = permissionMessage(err)
    return { result: { created: 0, updated: 0, errors: [message] }, error: message }
  }

  return bulkMarkAttendance(groupId, recordDate, statusMap)
}

/** Exporte le registre de présence en CSV. */
export async function exportAttendanceCsvAction(
  groupId: string,
  fromDate?: string,
  toDate?: string
): Promise<{ csv: string; error?: string }> {
  await requireUser()
  const orgId = await resolveGroupOrgId(groupId)
  if (!orgId) return { csv: '', error: 'Groupe introuvable' }

  try {
    await requirePermission(orgId, 'export.read')
  } catch (err) {
    return { csv: '', error: permissionMessage(err) }
  }

  const csv = await repoExportAttendanceCsv(groupId, fromDate, toDate)
  return { csv, error: undefined }
}

/** PARAMÈTRES ORGANISATION ************************************************/

/** Récupère la configuration vocabulaire d'un établissement donné. */
export async function getOrgVocab(
  orgId: string,
  orgType?: string,
  customSettings?: {
    vocab_group_label?: string
    vocab_group_label_plural?: string
    vocab_person_label?: string
    vocab_person_label_plural?: string
    vocab_presence_label?: string
    vocab_attendance_label?: string
  }
): Promise<{ vocab: VocabConfig; error?: string }> {
  await requireUser()
  if (!orgId) return { vocab: defaultVocab, error: 'Établissement requis' }

  const settings = await getOrgRegistraSettings(orgId)
  const vocabFromSettings = settings
    ? {
        vocab_group_label: settings.vocab_group_label,
        vocab_group_label_plural: settings.vocab_group_label_plural,
        vocab_person_label: settings.vocab_person_label,
        vocab_person_label_plural: settings.vocab_person_label_plural,
        vocab_presence_label: settings.vocab_presence_label,
        vocab_attendance_label: settings.vocab_attendance_label,
      }
    : {}
  const vocab = getVocab((orgType as OrgType | undefined) ?? 'other', vocabFromSettings)

  return { vocab, error: undefined }
}

/** Met à jour la configuration vocabulaire d'un établissement (organization.update). */
export async function updateOrgVocab(
  orgId: string,
  vocab_group_label?: string,
  vocab_group_label_plural?: string,
  vocab_person_label?: string,
  vocab_person_label_plural?: string,
  vocab_presence_label?: string,
  vocab_attendance_label?: string
): Promise<{ success: boolean; error?: string }> {
  await requireUser()
  if (!orgId) return { success: false, error: 'Établissement requis' }

  try {
    await requirePermission(orgId, 'organization.update')
  } catch (err) {
    return { success: false, error: permissionMessage(err) }
  }

  const settings = await updateOrgRegistraSettings(orgId, {
    vocab_group_label,
    vocab_group_label_plural,
    vocab_person_label,
    vocab_person_label_plural,
    vocab_presence_label,
    vocab_attendance_label,
  })

  if (!settings.success) return { success: false, error: settings.error }
  return { success: true, error: undefined }
}

/** EXPORTS CSV **************************************************************/

/** Exporte les groupes d'un établissement donné en CSV (export.read). */
export async function exportGroupsCsv(orgId: string): Promise<{ csv: string; error?: string }> {
  await requireUser()
  if (!orgId) return { csv: '', error: 'Établissement requis' }

  try {
    await requirePermission(orgId, 'export.read')
  } catch (err) {
    return { csv: '', error: permissionMessage(err) }
  }

  const csv = await repoExportGroupsCsv(orgId)
  return { csv, error: undefined }
}

/** Exporte les personnes d'un groupe en CSV (établissement résolu depuis le groupe). */
export async function exportPersonsCsv(groupId: string): Promise<{ csv: string; error?: string }> {
  await requireUser()
  const orgId = await resolveGroupOrgId(groupId)
  if (!orgId) return { csv: '', error: 'Groupe introuvable' }

  try {
    await requirePermission(orgId, 'export.read')
  } catch (err) {
    return { csv: '', error: permissionMessage(err) }
  }

  const csv = await repoExportPersonsCsv(groupId)
  return { csv, error: undefined }
}

/** STATISTIQUES *************************************************************/

function getPeriodBounds(period: 'today' | 'week' | 'month' | 'year' | 'all') {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).getTime()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()

  let fromDate: number | undefined
  let toDate: number | undefined

  switch (period) {
    case 'today':
      fromDate = startOfToday
      toDate = startOfToday + 86400000
      break
    case 'week':
      fromDate = startOfWeek
      toDate = startOfToday + 86400000
      break
    case 'month':
      fromDate = startOfMonth
      toDate = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime()
      break
    case 'year':
      fromDate = new Date(now.getFullYear(), 0, 1).getTime()
      toDate = new Date(now.getFullYear() + 1, 0, 1).getTime()
      break
    case 'all':
    default:
      fromDate = undefined
      toDate = undefined
  }

  return { fromDate, toDate }
}

/**
 * Récupère l'historique d'attendance d'un groupe sur une période donnée.
 * Retourne les statistiques par date.
 */
export async function getAttendanceHistory(
  groupId: string,
  period: 'today' | 'week' | 'month' | 'year' | 'all'
): Promise<{ history: Array<{ record_date: string; present_count: number; late_count: number; absent_count: number; unmarked_count: number; total_records: number }>; error?: string }> {
  const user = await requireUser()
  if (!user) return { history: [], error: 'Non connecté' }

  const orgId = await resolveGroupOrgId(groupId)
  if (!orgId) return { history: [], error: 'Groupe introuvable' }

  try {
    await requirePermission(orgId, 'attendance.history')
  } catch (err) {
    return { history: [], error: permissionMessage(err) }
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) return { history: [], error: 'Supabase non configuré' }

  let query = supabase
    .from('attendance_records')
    .select(`record_date, status, persons!inner (id)`)
    .eq('group_id', groupId)

  const { fromDate, toDate } = getPeriodBounds(period)

  if (fromDate) query = query.gte('record_date', new Date(fromDate).toISOString().split('T')[0])
  if (toDate) query = query.lte('record_date', new Date(toDate).toISOString().split('T')[0])

  const { data, error } = await query.order('record_date', { ascending: false })

  if (error) return { history: [], error: error.message }

  const dateMap = new Map<string, { present: number; late: number; absent: number; unmarked: number; total: number }>()

  for (const row of data) {
    const date = row.record_date
    if (!dateMap.has(date)) {
      dateMap.set(date, { present: 0, late: 0, absent: 0, unmarked: 0, total: 0 })
    }
    const stats = dateMap.get(date)!
    stats.total++
    switch (row.status) {
      case 'present':
        stats.present++
        break
      case 'late':
        stats.late++
        break
      case 'absent':
        stats.absent++
        break
      case 'unmarked':
        stats.unmarked++
        break
    }
  }

  const history = Array.from(dateMap.entries()).map(([record_date, counts]) => ({
    record_date,
    present_count: counts.present,
    late_count: counts.late,
    absent_count: counts.absent,
    unmarked_count: counts.unmarked,
    total_records: counts.total,
  }))

  return { history, error: undefined }
}

/**
 * Récupère les statistiques d'une personne pour une période donnée.
 */
export async function getPersonStats(
  personId: string,
  period: 'today' | 'week' | 'month' | 'year' | 'all'
): Promise<{ present_count: number; late_count: number; absent_count: number; unmarked_count: number; total_sessions: number; attendance_rate: number; error?: string }> {
  await requireUser()
  const orgId = await resolvePersonOrgId(personId)
  if (!orgId) {
    return {
      present_count: 0,
      late_count: 0,
      absent_count: 0,
      unmarked_count: 0,
      total_sessions: 0,
      attendance_rate: 0,
      error: 'Personne introuvable',
    }
  }

  try {
    await requirePermission(orgId, 'stats.read')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Permission refusée'
    return {
      present_count: 0,
      late_count: 0,
      absent_count: 0,
      unmarked_count: 0,
      total_sessions: 0,
      attendance_rate: 0,
      error: message,
    }
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return {
      present_count: 0,
      late_count: 0,
      absent_count: 0,
      unmarked_count: 0,
      total_sessions: 0,
      attendance_rate: 0,
      error: 'Supabase non configuré',
    }
  }

  let query = supabase.from('attendance_records').select('status').eq('person_id', personId)

  const { fromDate, toDate } = getPeriodBounds(period)

  if (fromDate) query = query.gte('record_date', new Date(fromDate).toISOString().split('T')[0])
  if (toDate) query = query.lte('record_date', new Date(toDate).toISOString().split('T')[0])

  const { data, error } = await query.order('record_date', { ascending: false })

  if (error) {
    return {
      present_count: 0,
      late_count: 0,
      absent_count: 0,
      unmarked_count: 0,
      total_sessions: 0,
      attendance_rate: 0,
      error: error.message,
    }
  }

  let present = 0
  let late = 0
  let absent = 0
  let unmarked = 0
  let total = 0

  for (const row of data) {
    total++
    switch (row.status) {
      case 'present':
        present++
        break
      case 'late':
        late++
        break
      case 'absent':
        absent++
        break
      case 'unmarked':
        unmarked++
        break
    }
  }

  const considered = total - unmarked
  const rate = considered > 0 ? Math.round(((present + late) / considered) * 1000) / 10 : 0

  return {
    present_count: present,
    late_count: late,
    absent_count: absent,
    unmarked_count: unmarked,
    total_sessions: total,
    attendance_rate: rate,
    error: undefined,
  }
}

/**
 * Vérifie si une nouvelle organisation peut être créée dans le plan actuel.
 * Utilise le Billing Engine pour vérifier la limite organizations.max.
 */
export async function checkOrganizationLimit(
  currentCount: number,
  orgId?: string
): Promise<LimitEvaluation> {
  let limit: number | null = 3

  if (orgId) {
    const supabase = await createSupabaseServerClient()
    if (supabase) {
      const { data: subscription, error } = await supabase
        .from('subscriptions')
        .select('planCode')
        .eq('organization_id', orgId)
        .single()

      if (!error && subscription) {
        const { data: plans, error: plansError } = await supabase
          .from('plans')
          .select('code, limits')
          .eq('code', subscription.planCode)

        if (!plansError && plans && plans.length > 0) {
          const planRow = plans[0] as { code: string; limits: Record<string, number> }
          const plan: PlanSummary = {
            code: planRow.code,
            name: planRow.code,
            description: null,
            features: [],
            limits: planRow.limits,
          }
          limit = getPlanLimit(plan, 'organizations.max')
        }
      }
    }
  }

  return evaluateLimit({
    usage: currentCount,
    limit,
    requestedAmount: 1,
  })
}

/** Récupère les statistiques d'un groupe pour une période donnée. */
export async function getGroupStats(
  groupId: string,
  period: 'today' | 'week' | 'month' | 'year' | 'all' = 'month'
): Promise<{ present_count: number; late_count: number; absent_count: number; unmarked_count: number; total_records: number; attendance_rate: number; error?: string }> {
  await requireUser()
  const orgId = await resolveGroupOrgId(groupId)
  if (!orgId) {
    return {
      present_count: 0,
      late_count: 0,
      absent_count: 0,
      unmarked_count: 0,
      total_records: 0,
      attendance_rate: 0,
      error: 'Groupe introuvable',
    }
  }

  try {
    await requirePermission(orgId, 'stats.read')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Permission refusée'
    return {
      present_count: 0,
      late_count: 0,
      absent_count: 0,
      unmarked_count: 0,
      total_records: 0,
      attendance_rate: 0,
      error: message,
    }
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return {
      present_count: 0,
      late_count: 0,
      absent_count: 0,
      unmarked_count: 0,
      total_records: 0,
      attendance_rate: 0,
      error: 'Supabase non configuré',
    }
  }

  let query = supabase.from('attendance_records').select('status').eq('group_id', groupId)

  const { fromDate, toDate } = getPeriodBounds(period)

  if (fromDate) query = query.gte('record_date', new Date(fromDate).toISOString().split('T')[0])
  if (toDate) query = query.lte('record_date', new Date(toDate).toISOString().split('T')[0])

  const { data, error } = await query.order('record_date', { ascending: false })

  if (error) {
    return {
      present_count: 0,
      late_count: 0,
      absent_count: 0,
      unmarked_count: 0,
      total_records: 0,
      attendance_rate: 0,
      error: error.message,
    }
  }

  let present = 0
  let late = 0
  let absent = 0
  let unmarked = 0
  let total = 0

  for (const row of data) {
    total++
    switch (row.status) {
      case 'present':
        present++
        break
      case 'late':
        late++
        break
      case 'absent':
        absent++
        break
      case 'unmarked':
        unmarked++
        break
    }
  }

  const considered = total - unmarked
  const rate = considered > 0 ? Math.round(((present + late) / considered) * 1000) / 10 : 0

  return {
    present_count: present,
    late_count: late,
    absent_count: absent,
    unmarked_count: unmarked,
    total_records: total,
    attendance_rate: rate,
    error: undefined,
  }
}

export type { ImportReport } from './types'

/** ==========================================================================
 * GROUPE — page centrale (membres + feuille de présence + historique/export)
 * Actions « group-scoped » : elles résolvent l'organisation à partir de la
 * ressource ciblée puis appliquent la permission correspondante (has_permission
 * reste la seule source de vérité). Aucune règle de sécurité n'est modifiée.
 * ========================================================================== */

/** Résout l'organisation d'un groupe (lecture protégée par RLS). */
async function resolveGroupOrgId(groupId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return null
  const { data } = await supabase
    .from('groups')
    .select('organization_id')
    .eq('id', groupId)
    .maybeSingle()
  return (data?.organization_id as string | undefined) ?? null
}

/** Résout l'organisation d'une personne (via sa fiche, RLS). */
async function resolvePersonOrgId(personId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return null
  const { data } = await supabase
    .from('persons')
    .select('organization_id')
    .eq('id', personId)
    .maybeSingle()
  return (data?.organization_id as string | undefined) ?? null
}

function permissionMessage(err: unknown, fallback = 'Permission refusée'): string {
  return err instanceof Error ? err.message : fallback
}

/** Détail d'un groupe + organisation + vocabulaire (pour la page centrale). */
export async function getGroupDetail(groupId: string): Promise<
  | {
      group: Group
      orgId: string
      orgName: string
      orgType: OrgType
      vocab: VocabConfig
    }
  | { error: string }
> {
  await requireUser()
  const supabase = await createSupabaseServerClient()
  if (!supabase) return { error: 'Supabase non configuré' }

  const { data: group, error } = await supabase
    .from('groups')
    .select('id, organization_id, name, description, created_at, updated_at')
    .eq('id', groupId)
    .maybeSingle()

  if (error || !group) return { error: 'Groupe introuvable' }

  const orgId = group.organization_id as string
  try {
    await requirePermission(orgId, 'groups.read')
  } catch (err) {
    return { error: permissionMessage(err) }
  }

  const settings = await getOrgRegistraSettings(orgId)
  const orgType = ((settings?.organization_type as OrgType | undefined) ?? 'other') as OrgType
  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .maybeSingle()

  return {
    group: {
      id: group.id,
      organization_id: orgId,
      name: group.name,
      description: group.description ?? undefined,
      created_at: group.created_at,
      updated_at: group.updated_at,
    },
    orgId,
    orgName: (org?.name as string) ?? '',
    orgType,
    vocab: getVocab(orgType, settings ?? undefined),
  }
}

/** Liste les membres d'un groupe (permission `persons.read`). */
export async function listGroupMembers(
  groupId: string,
): Promise<{ persons: Person[]; error?: string }> {
  await requireUser()
  const orgId = await resolveGroupOrgId(groupId)
  if (!orgId) return { persons: [], error: 'Groupe introuvable' }
  try {
    await requirePermission(orgId, 'persons.read')
  } catch (err) {
    return { persons: [], error: permissionMessage(err) }
  }
  const persons = await listPersons(groupId)
  return { persons }
}

/**
 * Ajoute un membre. Le matricule est généré côté application (défaut) et
 * vérifié contre la contrainte d'unicité par groupe (base). En cas de conflit,
 * un nouveau matricule est proposé : le matricule d'un autre membre n'est
 * jamais écrasé.
 */
export async function addGroupMember(
  groupId: string,
  firstName: string,
  lastName: string,
  matricule?: string,
): Promise<{ success: boolean; error?: string }> {
  await requireUser()
  const orgId = await resolveGroupOrgId(groupId)
  if (!orgId) return { success: false, error: 'Groupe introuvable' }
  try {
    await requirePermission(orgId, 'persons.write')
  } catch (err) {
    return { success: false, error: permissionMessage(err) }
  }

  const persons = await listPersons(groupId)
  const usedCodes = persons.map((p) => p.student_id)
  let code = matricule?.trim() || computeNextMatricule(usedCodes)

  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = await createPerson(groupId, firstName, lastName, code)
    if (!error) return { success: true }
    if (error.includes('student_id_duplicate')) {
      code = computeNextMatricule([...usedCodes, code])
      continue
    }
    return { success: false, error }
  }
  return { success: false, error: "Impossible d'attribuer un matricule unique." }
}

/** Renomme un membre et/ou change son matricule (permission `persons.write`). */
export async function renameGroupMember(
  personId: string,
  firstName?: string,
  lastName?: string,
  matricule?: string,
): Promise<{ success: boolean; error?: string }> {
  await requireUser()
  const orgId = await resolvePersonOrgId(personId)
  if (!orgId) return { success: false, error: 'Personne introuvable' }
  try {
    await requirePermission(orgId, 'persons.write')
  } catch (err) {
    return { success: false, error: permissionMessage(err) }
  }
  const { success, error } = await updatePerson(personId, firstName, lastName, matricule)
  if (!success) return { success: false, error }
  return { success: true }
}

/** Supprime un membre (permission `persons.write`). */
export async function removeGroupMember(
  personId: string,
): Promise<{ success: boolean; error?: string }> {
  await requireUser()
  const orgId = await resolvePersonOrgId(personId)
  if (!orgId) return { success: false, error: 'Personne introuvable' }
  try {
    await requirePermission(orgId, 'persons.write')
  } catch (err) {
    return { success: false, error: permissionMessage(err) }
  }
  const { success, error } = await deletePerson(personId)
  if (!success) return { success: false, error }
  return { success: true }
}

/** Propose le prochain matricule disponible pour un groupe. */
export async function suggestGroupMatricule(groupId: string): Promise<{ code: string }> {
  const persons = await listPersons(groupId)
  return { code: computeNextMatricule(persons.map((p) => p.student_id)) }
}

/**
 * Feuille de présence : membres × dates.
 * `days` = fenêtre (7, 30) ou 'all' pour toutes les dates enregistrées.
 */
export async function getAttendanceSheet(
  groupId: string,
  days: number | 'all' = 'all',
): Promise<{
  members: Person[]
  dates: string[]
  statuses: Record<string, Record<string, AttendanceStatus>>
  error?: string
}> {
  await requireUser()
  const orgId = await resolveGroupOrgId(groupId)
  if (!orgId) return { members: [], dates: [], statuses: {}, error: 'Groupe introuvable' }
  try {
    await requirePermission(orgId, 'attendance.read')
  } catch (err) {
    return { members: [], dates: [], statuses: {}, error: permissionMessage(err) }
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) return { members: [], dates: [], statuses: {}, error: 'Supabase non configuré' }

  const members = await listPersons(groupId)

  let query = supabase
    .from('attendance_records')
    .select('person_id, record_date, status')
    .eq('group_id', groupId)
    .order('record_date', { ascending: true })

  if (typeof days === 'number') {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    query = query.gte('record_date', cutoff.toISOString().split('T')[0])
  }

  const { data, error } = await query
  if (error) return { members, dates: [], statuses: {}, error: error.message }

  const dateSet = new Set<string>()
  const statuses: Record<string, Record<string, AttendanceStatus>> = {}
  for (const row of (data ?? []) as Array<{ person_id: string; record_date: string; status: AttendanceStatus }>) {
    dateSet.add(row.record_date)
    statuses[row.person_id] = statuses[row.person_id] ?? {}
    statuses[row.person_id][row.record_date] = row.status
  }
  const today = new Date().toISOString().split('T')[0]
  dateSet.add(today)
  const dates = Array.from(dateSet).sort()

  return { members, dates, statuses, error: undefined }
}

/** Enregistre le statut d'une personne pour une date (permission `attendance.write`). */
export async function setAttendanceStatus(
  groupId: string,
  recordDate: string,
  personId: string,
  status: string,
): Promise<{ success: boolean; error?: string }> {
  await requireUser()
  const orgId = await resolveGroupOrgId(groupId)
  if (!orgId) return { success: false, error: 'Groupe introuvable' }
  try {
    await requirePermission(orgId, 'attendance.write')
  } catch (err) {
    return { success: false, error: permissionMessage(err) }
  }
  const valid: AttendanceStatus[] = ['unmarked', 'present', 'late', 'absent']
  const normalized = valid.includes(status as AttendanceStatus) ? (status as AttendanceStatus) : 'unmarked'
  const { error } = await markAttendance(groupId, recordDate, personId, normalized)
  if (error) return { success: false, error }
  return { success: true }
}

/** Enregistre le même statut pour tous les membres d'un groupe à une date. */
export async function setBulkAttendance(
  groupId: string,
  recordDate: string,
  statusMap: Record<string, string>,
): Promise<{ updated: number; errors: string[]; error?: string }> {
  await requireUser()
  const orgId = await resolveGroupOrgId(groupId)
  if (!orgId) return { updated: 0, errors: [], error: 'Groupe introuvable' }
  try {
    await requirePermission(orgId, 'attendance.write')
  } catch (err) {
    return { updated: 0, errors: [], error: permissionMessage(err) }
  }

  const members = await listPersons(groupId)
  const valid: AttendanceStatus[] = ['unmarked', 'present', 'late', 'absent']
  let updated = 0
  const errors: string[] = []

  for (const member of members) {
    const raw = statusMap[member.id] ?? 'unmarked'
    const status = valid.includes(raw as AttendanceStatus) ? (raw as AttendanceStatus) : 'unmarked'
    const { error } = await markAttendance(groupId, recordDate, member.id, status)
    if (error) errors.push(`${member.last_name} ${member.first_name}: ${error}`)
    else updated++
  }

  return { updated, errors }
}

/** Historique unifié d'un groupe : par date, éventuellement filtré par membre et plage de dates. */
export async function getGroupHistory(
  groupId: string,
  options: { from?: string; to?: string; personId?: string } = {},
): Promise<{
  rows: Array<{ date: string; present: number; late: number; absent: number; unmarked: number; total: number }>
  totals: { present: number; late: number; absent: number; unmarked: number; days: number }
  error?: string
}> {
  const emptyTotals = { present: 0, late: 0, absent: 0, unmarked: 0, days: 0 }
  await requireUser()
  const orgId = await resolveGroupOrgId(groupId)
  if (!orgId) return { rows: [], totals: emptyTotals, error: 'Groupe introuvable' }
  try {
    await requirePermission(orgId, 'attendance.history')
  } catch (err) {
    return { rows: [], totals: emptyTotals, error: permissionMessage(err) }
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) return { rows: [], totals: emptyTotals, error: 'Supabase non configuré' }

  let query = supabase
    .from('attendance_records')
    .select('record_date, status')
    .eq('group_id', groupId)
  if (options.personId) query = query.eq('person_id', options.personId)
  if (options.from) query = query.gte('record_date', options.from)
  if (options.to) query = query.lte('record_date', options.to)

  const { data, error } = await query.order('record_date', { ascending: false })
  if (error) return { rows: [], totals: emptyTotals, error: error.message }

  const map = new Map<string, { present: number; late: number; absent: number; unmarked: number; total: number }>()
  for (const row of (data ?? []) as Array<{ record_date: string; status: AttendanceStatus }>) {
    if (!map.has(row.record_date)) {
      map.set(row.record_date, { present: 0, late: 0, absent: 0, unmarked: 0, total: 0 })
    }
    const entry = map.get(row.record_date)!
    entry.total++
    if (row.status === 'present') entry.present++
    else if (row.status === 'late') entry.late++
    else if (row.status === 'absent') entry.absent++
    else entry.unmarked++
  }

  const rows = Array.from(map.entries())
    .map(([date, counts]) => ({ date, ...counts }))
    .sort((a, b) => b.date.localeCompare(a.date))

  const totals = rows.reduce(
    (acc, row) => ({
      present: acc.present + row.present,
      late: acc.late + row.late,
      absent: acc.absent + row.absent,
      unmarked: acc.unmarked + row.unmarked,
      days: acc.days + 1,
    }),
    { ...emptyTotals },
  )

  return { rows, totals }
}

/** Recherche globale (établissement, groupe, membre, matricule) — RLS appliquée. */
export async function globalSearch(query: string): Promise<{
  organizations: Array<{ id: string; name: string }>
  groups: Array<{ id: string; name: string; orgId: string; orgName: string }>
  members: Array<{ id: string; name: string; code: string | null; groupId: string; groupName: string; orgId: string }>
}> {
  const empty = { organizations: [], groups: [], members: [] }
  await requireUser()
  const raw = query.trim()
  if (raw.length < 2) return empty

  const supabase = await createSupabaseServerClient()
  if (!supabase) return empty

  const safe = raw.replace(/[%,()*]/g, '')
  if (safe.length < 2) return empty
  const pattern = `%${safe}%`

  const [orgsRes, groupsRes, personsRes] = await Promise.all([
    supabase.from('organizations').select('id, name').ilike('name', pattern).limit(5),
    supabase
      .from('groups')
      .select('id, name, organization_id, organizations (name)')
      .ilike('name', pattern)
      .limit(8),
    supabase
      .from('persons')
      .select('id, first_name, last_name, student_id, group_id, groups (name, organization_id)')
      .or(`first_name.ilike.${pattern},last_name.ilike.${pattern},student_id.ilike.${pattern}`)
      .limit(15),
  ])

  type OrgRef = { name: string } | { name: string }[] | null
  const orgName = (ref: OrgRef): string => {
    if (!ref) return ''
    return Array.isArray(ref) ? (ref[0]?.name ?? '') : ref.name
  }

  const organizations = (orgsRes.data ?? []).map((o) => ({ id: o.id as string, name: o.name as string }))

  const groups = (groupsRes.data ?? []).map((g) => ({
    id: g.id as string,
    name: g.name as string,
    orgId: g.organization_id as string,
    orgName: orgName(g.organizations as OrgRef),
  }))

  const members = (personsRes.data ?? []).map((p) => {
    const grp = p.groups as unknown
    const grpObj = Array.isArray(grp) ? grp[0] : (grp as { name?: string; organization_id?: string } | null)
    return {
      id: p.id as string,
      name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
      code: (p.student_id as string | null) ?? null,
      groupId: p.group_id as string,
      groupName: (grpObj?.name as string) ?? '',
      orgId: (grpObj?.organization_id as string) ?? '',
    }
  })

  return { organizations, groups, members }
}

/** Exporte les membres d'un groupe en CSV (permission `export.read`). */
export async function exportGroupMembersCsv(groupId: string): Promise<{ csv: string; error?: string }> {
  await requireUser()
  const orgId = await resolveGroupOrgId(groupId)
  if (!orgId) return { csv: '', error: 'Groupe introuvable' }
  try {
    await requirePermission(orgId, 'export.read')
  } catch (err) {
    return { csv: '', error: permissionMessage(err) }
  }
  const csv = await repoExportPersonsCsv(groupId)
  return { csv, error: undefined }
}

/** Exporte la feuille de présence d'un groupe en CSV (permission `export.read`). */
export async function exportGroupAttendanceCsv(
  groupId: string,
  fromDate?: string,
  toDate?: string,
): Promise<{ csv: string; error?: string }> {
  await requireUser()
  const orgId = await resolveGroupOrgId(groupId)
  if (!orgId) return { csv: '', error: 'Groupe introuvable' }
  try {
    await requirePermission(orgId, 'export.read')
  } catch (err) {
    return { csv: '', error: permissionMessage(err) }
  }
  const csv = await repoExportAttendanceCsv(groupId, fromDate, toDate)
  return { csv, error: undefined }
}

/**
 * Crée une organisation (établissement) avec son type, puis persiste le type
 * dans `organization_registra_settings` (vocabulaire appliqué par le preset).
 * S'appuie uniquement sur la policy `organizations_insert_own` + le trigger
 * owner ; l'écriture des settings utilise la policy `organization.update`
 * (le créateur est owner).
 */
export async function createRegistraOrganization(
  name: string,
  orgType: OrgType,
): Promise<{ id?: string; error?: string }> {
  const user = await requireUser()
  if (!user) return { error: 'Connectez-vous pour créer une organisation.' }

  const trimmed = name.trim()
  if (trimmed.length < 1 || trimmed.length > 100) {
    return { error: 'Le nom doit contenir entre 1 et 100 caractères.' }
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) return { error: "Supabase n'est pas configuré sur ce projet." }

  const { data, error } = await supabase
    .from('organizations')
    .insert({ name: trimmed, created_by: user.id })
    .select('id')
    .single()

  if (error || !data) {
    return { error: error?.message ?? "Création de l'organisation impossible." }
  }

  const orgId = data.id as string
  // Persiste le type (best-effort : l'organisation est déjà créée).
  await updateOrgRegistraSettings(orgId, { organization_type: orgType })

  return { id: orgId }
}
