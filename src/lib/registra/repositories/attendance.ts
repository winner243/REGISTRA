/**
 * Repository Attendance — Data Access Layer Registra.
 * Gestion des enregistrements de présence via RPC security definer.
 * Logique de cycle (unmarked → present → late → absent → unmarked)
 * et recherche d'enregistrements existants par groupe/date.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { toCsvCell } from '@/lib/export/csv'
import type { AttendanceStatus, AttendanceRecord, Person } from '../types'
import { listPersons } from './persons'
import { nextStatus, isMarked, countByStatus } from '../utils'

/** Récupère les enregistrements de présence pour un groupe et une date donnés. */
export async function listAttendanceRecords(
  groupId: string,
  recordDate: string
): Promise<AttendanceRecord[]> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('attendance_records')
    .select('id, organization_id, group_id, person_id, record_date, status, marked_by, marked_at, created_at, updated_at, persons!inner (first_name, last_name, student_id)')
    .eq('group_id', groupId)
    .eq('record_date', recordDate)
    .order('persons.last_name', { ascending: true })
    .order('persons.first_name', { ascending: true })

  if (error) return []
  return (data ?? []) as AttendanceRecord[]
}

/** Marque la présence d'une personne pour un groupe et une date donnés.
 *  Upsert : crée si inexistant, met à jour si existant.
 *  Retourne l'enregistrement résultant.
 */
export async function markAttendance(
  groupId: string,
  recordDate: string,
  personId: string,
  status: AttendanceStatus
): Promise<{ record: AttendanceRecord; error?: string }> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return { record: {} as AttendanceRecord, error: 'Supabase non configuré' }

  try {
    const { data, error } = await supabase.rpc('mark_attendance', {
      p_group_id: groupId,
      p_record_date: recordDate,
      p_person_id: personId,
      p_status: status,
    })

    if (error) return { record: {} as AttendanceRecord, error: error.message }
    return { record: data as AttendanceRecord, error: undefined }
  } catch (err) {
    const message = (err instanceof Error ? err.message : 'Erreur inattendue')
    return { record: {} as AttendanceRecord, error: message }
  }
}

/** Marque la présence pour plusieurs personnes d'un groupe à une date donnée.
 *  Le paramètre statusMap est un objet { personId_string: status_string, ... }.
 *  Retourne un résumé { created, updated, errors }.
 */
export async function bulkMarkAttendance(
  groupId: string,
  recordDate: string,
  statusMap: Record<string, string>
): Promise<{ result: { created: number; updated: number; errors: string[] } }> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return { result: { created: 0, updated: 0, errors: ['Supabase non configuré'] } }

  try {
    // Approche : itérer sur toutes les personnes du groupe et appeler mark_attendance
    // pour chacune. PostgreSQL ne permet pas de faire un bulk simple via RPC jsonb
    // aussi proprement pour le MVP.

    // D'abord, récupère toutes les personnes du groupe
    const persons = await listPersons(groupId)
    const result = { created: 0, updated: 0, errors: [] as string[] }

    for (const person of persons) {
      const pid = person.id
      let statusKey = statusMap[pid] ?? 'unmarked'
      // Validation rapide : le status doit être un enum valide
      if (!['unmarked', 'present', 'late', 'absent'].includes(statusKey as AttendanceStatus)) {
        statusKey = 'unmarked'
      }

      const { record, error } = await markAttendance(groupId, recordDate, pid, statusKey as AttendanceStatus)

      if (error) {
        result.errors.push(`${person.last_name} ${person.first_name}: ${error}`)
      } else if (isMarked(record)) {
        result.updated++
      } else {
        result.created++
      }
    }

    return { result }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inattendue'
    return { result: { created: 0, updated: 0, errors: [message] } }
  }
}

/** Retourne le statut actuel de chaque personne d'un groupe pour une date donnée,
 *  avec calcul du prochain statut dans le cycle. */
export async function getAttendanceStatuses(
  groupId: string,
  recordDate: string
): Promise<{
  persons: Person[]
  records: AttendanceRecord[]
  summary: { present: number; late: number; absent: number; unmarked: number; total: number }
  nextForEach: Record<string, AttendanceStatus> // personId -> next status
}> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return { persons: [], records: [], summary: { present: 0, late: 0, absent: 0, unmarked: 0, total: 0 }, nextForEach: {} }
  }

  // 1. Récupère les personnes du groupe
  const persons = await listPersons(groupId)

  // 2. Récupère les enregistrements existants pour cette date
  const records = await listAttendanceRecords(groupId, recordDate)

  // 3. Assemble map personId -> record
  const recordMap = new Map<string, AttendanceRecord>()
  for (const r of records) {
    recordMap.set(r.person_id, r)
  }

  // 4. Construire le résultat
  const summary = countByStatus(records)
  const nextForEach: Record<string, AttendanceStatus> = {}

  const enrichedPersons = persons.map((person) => {
    const record = recordMap.get(person.id) ?? { // Type minimal
      id: '',
      organization_id: '',
      group_id: groupId,
      person_id: person.id,
      record_date: recordDate,
      status: 'unmarked',
      marked_by: null,
      marked_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as AttendanceRecord

    const next = nextStatus(record.status as AttendanceStatus)
    nextForEach[person.id] = next

    return {
      ...person,
      // On ajoute le statut actuel et le prochain dans des champs étendus
      // (on ne modifie pas le type Person pour garder la compatibilité)
      currentStatus: record.status,
      nextStatus: next,
    }
  })

  return {
    persons: enrichedPersons as Person[],
    records,
    summary,
    nextForEach,
  }
}

/** Exporte l'historique d'attendance d'un groupe au format CSV. */
export async function exportAttendanceCsv(groupId: string, fromDate?: string, toDate?: string): Promise<string> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return ''

  let query = supabase.from('attendance_records')
    .select(`
      id,
      record_date,
      status,
      persons!inner (first_name, last_name, student_id),
      groups!inner (name)
    `)
    .eq('group_id', groupId)

  if (fromDate) query = query.gte('record_date', fromDate)
  if (toDate) query = query.lte('record_date', toDate)

  const { data, error } = await query.order('record_date', { ascending: false })

  if (error || !data?.length) return ''

  const header = ['date', 'group', 'last_name', 'first_name', 'student_id', 'status']
  const lines = [header.map((h) => toCsvCell(h)).join(',')]
  for (const row of data) {
    const group = (row.groups as { name?: string })?.name ?? ''
    const last = (row.persons as { last_name?: string })?.last_name ?? ''
    const first = (row.persons as { first_name?: string })?.first_name ?? ''
    const student = (row.persons as { student_id?: string })?.student_id ?? ''
    lines.push(
      [row.record_date, group, last, first, student, row.status]
        .map((value) => toCsvCell(value))
        .join(','),
    )
  }

  const bom = '\uFEFF'
  return bom + lines.join('\u000d\u000a')
}