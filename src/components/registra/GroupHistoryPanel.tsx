"use client"

import { useEffect, useState } from "react"

import { getGroupHistory, listGroupMembers } from "@/lib/registra/actions"
import { memberDisplayName } from "@/lib/registra/utils"
import type { Person } from "@/lib/registra/types"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { GroupSelector } from "@/components/registra/GroupSelector"

type HistoryRow = {
  date: string
  present: number
  late: number
  absent: number
  unmarked: number
  total: number
}

type Period = "today" | "week" | "month" | "year" | "all" | "custom"

const EMPTY_TOTALS = { present: 0, late: 0, absent: 0, unmarked: 0, days: 0 }

function isoToday(): string {
  return new Date().toISOString().split("T")[0]
}

function rangeFor(period: Period): { from?: string; to?: string } {
  const now = new Date()
  const iso = (d: Date) => d.toISOString().split("T")[0]
  switch (period) {
    case "today":
      return { from: isoToday(), to: isoToday() }
    case "week": {
      const d = new Date(now)
      const day = (d.getDay() + 6) % 7
      d.setDate(d.getDate() - day)
      return { from: iso(d), to: isoToday() }
    }
    case "month":
      return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoToday() }
    case "year":
      return { from: iso(new Date(now.getFullYear(), 0, 1)), to: isoToday() }
    default:
      return {}
  }
}

export function GroupHistoryPanel() {
  const [groupId, setGroupId] = useState<string | null>(null)
  const [members, setMembers] = useState<Person[]>([])
  const [personId, setPersonId] = useState<string>("all")
  const [period, setPeriod] = useState<Period>("month")
  const [from, setFrom] = useState<string>(rangeFor("month").from ?? "")
  const [to, setTo] = useState<string>(rangeFor("month").to ?? "")
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [totals, setTotals] = useState(EMPTY_TOTALS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Charge les membres quand un groupe est sélectionné.
  useEffect(() => {
    if (!groupId) return
    let cancelled = false
    ;(async () => {
      const resp = await listGroupMembers(groupId)
      if (!cancelled) setMembers(resp.persons)
    })()
    return () => {
      cancelled = true
    }
  }, [groupId])

  // Charge l'historique selon groupe / plage de dates / membre.
  useEffect(() => {
    if (!groupId) return
    let cancelled = false
    ;(async () => {
      const resp = await getGroupHistory(groupId, {
        from: from || undefined,
        to: to || undefined,
        personId: personId === "all" ? undefined : personId,
      })
      if (cancelled) return
      if (resp.error) {
        setError(resp.error)
        setRows([])
        setTotals(EMPTY_TOTALS)
      } else {
        setError(null)
        setRows(resp.rows)
        setTotals(resp.totals)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [groupId, from, to, personId])

  function applyPeriod(next: Period) {
    setLoading(true)
    setPeriod(next)
    if (next !== "custom") {
      const range = rangeFor(next)
      setFrom(range.from ?? "")
      setTo(range.to ?? "")
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <GroupSelector
          defaultValue={groupId ?? undefined}
          onSelect={(id) => {
            setLoading(true)
            setGroupId(id)
            setPersonId("all")
            if (!id) {
              setMembers([])
              setRows([])
              setTotals(EMPTY_TOTALS)
              setLoading(false)
            }
          }}
          title="Groupe"
        />
        <div className="flex flex-col gap-2">
          <Label htmlFor="history-member">Membre</Label>
          <Select
            value={personId}
            onValueChange={(value) => {
              if (!value) return
              setLoading(true)
              setPersonId(value)
            }}
            disabled={!groupId || members.length === 0}
          >
            <SelectTrigger id="history-member">
              <SelectValue placeholder="Tous les membres" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les membres</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.student_id ? `${m.student_id} — ` : ""}
                  {memberDisplayName(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Période</Label>
          <div className="flex flex-wrap gap-1">
            {(["today", "week", "month", "year", "all"] as const).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={period === p ? "default" : "outline"}
                onClick={() => applyPeriod(p)}
              >
                {{ today: "Aujourd'hui", week: "Semaine", month: "Mois", year: "Année", all: "Tout" }[p]}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="history-from">Du</Label>
          <Input
            id="history-from"
            type="date"
            value={from}
            onChange={(e) => {
              setLoading(true)
              setPeriod("custom")
              setFrom(e.target.value)
            }}
            disabled={!groupId}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="history-to">Au</Label>
          <Input
            id="history-to"
            type="date"
            value={to}
            onChange={(e) => {
              setLoading(true)
              setPeriod("custom")
              setTo(e.target.value)
            }}
            disabled={!groupId}
          />
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="py-2.5">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!groupId ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Sélectionnez un groupe pour consulter l&apos;historique.
        </p>
      ) : loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Aucune donnée pour cette période.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-border p-3 text-center">
              <div className="text-xl font-bold">{totals.days}</div>
              <div className="text-xs text-muted-foreground">Jours</div>
            </div>
            <div className="rounded-lg border border-border p-3 text-center">
              <div className="text-xl font-bold text-green-600">{totals.present}</div>
              <div className="text-xs text-muted-foreground">Présences</div>
            </div>
            <div className="rounded-lg border border-border p-3 text-center">
              <div className="text-xl font-bold text-amber-600">{totals.late}</div>
              <div className="text-xs text-muted-foreground">Retards</div>
            </div>
            <div className="rounded-lg border border-border p-3 text-center">
              <div className="text-xl font-bold text-red-600">{totals.absent}</div>
              <div className="text-xs text-muted-foreground">Absences</div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {["Date", "P", "R", "A", "—", "Total"].map((h) => (
                    <th key={h} className="border border-border bg-muted px-2 py-1 text-left text-xs">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.date}>
                    <td className="border border-border px-2 py-1 font-medium">{row.date}</td>
                    <td className="border border-border px-2 py-1">{row.present}</td>
                    <td className="border border-border px-2 py-1">{row.late}</td>
                    <td className="border border-border px-2 py-1">{row.absent}</td>
                    <td className="border border-border px-2 py-1">{row.unmarked}</td>
                    <td className="border border-border px-2 py-1">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
