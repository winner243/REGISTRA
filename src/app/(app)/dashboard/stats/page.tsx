/* Page Statistiques - Statistiques Registra complètes */
"use client"

import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { GroupSelector } from '@/components/registra/GroupSelector'
import { getGroupStats } from '@/lib/registra/actions'
import { AttendancePeriod } from '@/lib/registra/types'
import { useToast } from '@/components/ui/use-toast'

export default function StatsPage() {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [period, setPeriod] = useState<AttendancePeriod>('month')
  const [stats, setStats] = useState<{
    present: number
    late: number
    absent: number
    unmarked: number
    total: number
    attendance_rate: number
  } | null>(null)
  const { toast } = useToast()

  const loadStats = async (groupId: string, p: AttendancePeriod) => {
    const resp = await getGroupStats(groupId, p)
    if (resp?.attendance_rate !== undefined) {
      setStats({
        present: resp.present_count ?? 0,
        late: resp.late_count ?? 0,
        absent: resp.absent_count ?? 0,
        unmarked: resp.unmarked_count ?? 0,
        total: resp.total_records ?? 0,
        attendance_rate: Math.round(resp.attendance_rate),
      })
    } else {
      toast({ title: 'Erreur', description: resp.error || 'Impossible de charger les statistiques', variant: 'destructive' })
    }
  }

  const handleGroupSelect = async (groupId: string) => {
    setSelectedGroupId(groupId)
    if (groupId) {
      await loadStats(groupId, period)
    }
  }

  const handlePeriodChange = (val: string | null) => {
    if (!val) return
    const validPeriods: AttendancePeriod[] = ['today', 'week', 'month', 'year', 'all']
    const p = validPeriods.includes(val as AttendancePeriod) ? (val as AttendancePeriod) : 'month'
    setPeriod(p)
    if (selectedGroupId) {
      loadStats(selectedGroupId, p)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Statistiques</CardTitle>
      </CardHeader>

      <CardContent>
        {/* Sélecteur de groupe et période */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <GroupSelector
            defaultValue={selectedGroupId ?? undefined}
            onSelect={(groupId) => handleGroupSelect(groupId)}
          />

          <Select value={period} onValueChange={handlePeriodChange}>
            <SelectTrigger>
              <SelectValue placeholder="Période" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Aujourd&apos;hui</SelectItem>
              <SelectItem value="week">Cette semaine</SelectItem>
              <SelectItem value="month">Mois</SelectItem>
              <SelectItem value="year">Année</SelectItem>
              <SelectItem value="all">Toutes</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Statistiques */}
        {selectedGroupId && stats && (
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div>
              <span className="font-medium text-sm text-muted-foreground">Présents</span>
              <span className="ml-2">{stats.present}</span>
            </div>
            <div>
              <span className="font-medium text-sm text-muted-foreground">Retards</span>
              <span className="ml-2">{stats.late}</span>
            </div>
            <div>
              <span className="font-medium text-sm text-muted-foreground">Absents</span>
              <span className="ml-2">{stats.absent}</span>
            </div>
            <div>
              <span className="font-medium text-sm text-muted-foreground">Non renseignés</span>
              <span className="ml-2">{stats.unmarked}</span>
            </div>
            <div>
              <span className="font-medium text-sm text-muted-foreground">Taux présence</span>
              <span className="ml-2">{stats.attendance_rate}%</span>
            </div>
          </div>
        )}

        {/* Aucun données */}
        {!(selectedGroupId && stats) && (
          <div className="text-center py-8 text-muted-foreground">
            Sélectionnez un groupe et une période pour afficher les statistiques.
          </div>
        )}
      </CardContent>
    </Card>
  )
}

