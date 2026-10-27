/* Composant Statistiques Registra - Affiche les stats jour/semaine/mois */
"use client"

import { useEffect, useState } from 'react'
import { Target } from 'lucide-react'
import { getGroupStats } from '@/lib/registra/actions'
import type { AttendancePeriod } from '@/lib/registra/types'
import { StatCard } from '@/components/dashboard/StatCard'

export interface StatsRegistraProps {
  groupId?: string
  period?: AttendancePeriod
}

export function StatsRegistra({ groupId, period = 'month' }: StatsRegistraProps) {
  const [stats, setStats] = useState({
    present: 0,
    late: 0,
    absent: 0,
    unmarked: 0,
    total: 0,
    attendance_rate: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadStats = async () => {
      if (!groupId) {
        setLoading(false)
        return
      }
      const resp = await getGroupStats(groupId, period)
      if (resp?.attendance_rate !== undefined) {
        setStats({
          present: resp.present_count ?? 0,
          late: resp.late_count ?? 0,
          absent: resp.absent_count ?? 0,
          unmarked: resp.unmarked_count ?? 0,
          total: resp.total_records ?? 0,
          attendance_rate: Math.round(resp.attendance_rate),
        })
      }
      setLoading(false)
    }

    loadStats()
  }, [groupId, period])

  const { present, late, absent, unmarked, total, attendance_rate } = stats

  const label = period === 'today' ? 'Aujourd\'hui' : period === 'week' ? 'Cette semaine' : 'Mois'

  if (loading) {
    return (
      <StatCard
        label={label}
        value="—"
        icon={Target}
      />
    )
  }

  // Helper: ajouter le 's' si nécessaire (français)
  function addSSingulier(text: string, count: number): string {
    if (count === 1) return text
    return text.replace(/s$/, '') + (count !== 1 ? 's' : '')
  }

  return (
    <StatCard
      label={label}
      value={`${attendance_rate}%`}
      icon={Target}
      trend={`${present} présent${addSSingulier('', present)}, ${late} malade${addSSingulier('e', late)}, ${absent} absent${addSSingulier('', absent)}`}
      trendUp={attendance_rate >= 75}
    />
  )
}
