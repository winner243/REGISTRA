/* Grille d'affichage présence - Tableau compact avec statut par personne */
"use client"

import { useEffect, useState } from 'react'
import { nextStatus, statusLabel, statusColor } from '@/lib/registra/utils'
import { getGroupAttendance } from '@/lib/registra/actions'
import type { AttendanceStatus } from '@/lib/registra/types'
import { VocabLabels } from '@/components/registra/VocabLabels'

interface GridPerson {
  id: string
  first_name: string
  last_name: string
  student_id?: string
  currentStatus: string
  nextStatus: string
}

export interface AttendanceGridProps {
  groupId: string
  recordDate: string
  onStatusChange?: (personId: string, newStatus: string) => void
}

export function AttendanceGrid({ groupId, recordDate, onStatusChange }: AttendanceGridProps) {
  const [attendance, setAttendance] = useState<{
    persons: GridPerson[]
    summary: { present: number; late: number; absent: number; unmarked: number; total: number }
    nextForEach: Record<string, string>
  }>({
    persons: [],
    summary: { present: 0, late: 0, absent: 0, unmarked: 0, total: 0 },
    nextForEach: {},
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const resp = await getGroupAttendance(groupId, recordDate)
      setAttendance({
        persons: resp.persons,
        summary: resp.summary,
        nextForEach: resp.nextForEach,
      })
      setLoading(false)
    }

    load()
  }, [groupId, recordDate])

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground">
        Chargement...
      </div>
    )
  }

  const { persons, summary } = attendance
  const { present, late, absent, unmarked, total } = summary

  function getStatusClass(status: AttendanceStatus): string {
    return statusColor(status)
  }

  return (
    <div className="space-y-4">
      {/* En-tête avec labels vocabulaire */}
      <VocabLabels orgType="school" />

      {/* Tableau de présence */}
      <div className="overflow-x-auto rounded-lg border border-border bg-card p-4">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left text-xs font-medium capitalize text-muted-foreground">Personne</th>
              <th className="text-left text-xs font-medium capitalize text-muted-foreground">Statut</th>
              <th className="text-left text-xs font-medium capitalize text-muted-foreground">Prochain</th>
            </tr>
          </thead>
          <tbody>
            {persons.map((person) => {
              const personId = person.id
              const currentStatus = (person.currentStatus ?? 'unmarked') as AttendanceStatus
              const nextStatusVal = (person.nextStatus ?? nextStatus(currentStatus)) as AttendanceStatus

              return (
                <tr key={personId} className="hover:bg-muted/50">
                  <td className="font-medium">
                    {person.last_name} {person.first_name}
                  </td>
                  <td>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${getStatusClass(currentStatus)} cursor-pointer`}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (onStatusChange) {
                          onStatusChange(personId, nextStatus(currentStatus))
                        }
                      }}
                      title="Cliquer pour modifier le statut"
                    >
                      {statusLabel(currentStatus)}
                    </span>
                  </td>
                  <td className="text-xs font-medium">
                    {statusLabel(nextStatusVal)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Résumé rapide */}
      <div className="flex gap-2">
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-green-50/50 text-green-600/80 cursor-pointer" onClick={(e) => e.stopPropagation()}>
          {present} P
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-amber-50/50 text-amber-600/80 cursor-pointer" onClick={(e) => e.stopPropagation()}>
          {late} M
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-red-50/50 text-red-600/80 cursor-pointer" onClick={(e) => e.stopPropagation()}>
          {absent} A
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground/80 cursor-pointer" onClick={(e) => e.stopPropagation()}>
          {unmarked} —
        </span>
        <span className="text-xs text-muted-foreground/60">sur {total}</span>
      </div>
    </div>
  )
}
