"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"

import {
  addGroupMember,
  exportGroupAttendanceCsv,
  exportGroupMembersCsv,
  getAttendanceSheet,
  removeGroupMember,
  renameGroupMember,
  setAttendanceStatus,
  setBulkAttendance,
  suggestGroupMatricule,
} from "@/lib/registra/actions"
import {
  memberDisplayName,
  splitFullName,
  statusLabel,
  statusColor,
  type AttendanceStatus,
} from "@/lib/registra/utils"
import type { Person, VocabConfig } from "@/lib/registra/types"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingState } from "@/components/states/loading-state"

type Sheet = {
  members: Person[]
  dates: string[]
  statuses: Record<string, Record<string, AttendanceStatus>>
}

type Feedback = { type: "success" | "error"; text: string } | null

const CYCLE: AttendanceStatus[] = ["unmarked", "present", "late", "absent"]
const CELL_COLORS: Record<string, string> = {
  present: "bg-green-100 text-green-700",
  late: "bg-amber-100 text-amber-700",
  absent: "bg-red-100 text-red-700",
  unmarked: "text-muted-foreground",
}

function nextInCycle(status: AttendanceStatus): AttendanceStatus {
  const idx = CYCLE.indexOf(status)
  return CYCLE[(idx + 1) % CYCLE.length]
}

function formatShortDate(iso: string): string {
  const [, m, d] = iso.split("-")
  return `${d}/${m}`
}

export function GroupWorkspace({ groupId, vocab }: { groupId: string; vocab: VocabConfig }) {
  const [sheet, setSheet] = useState<Sheet>({ members: [], dates: [], statuses: {} })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [days, setDays] = useState<number | "all">("all")

  const [fullName, setFullName] = useState("")
  const [matricule, setMatricule] = useState("")
  const [suggested, setSuggested] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")

  const today = new Date().toISOString().split("T")[0]

  const load = useCallback(
    async (window_: number | "all") => {
      const resp = await getAttendanceSheet(groupId, window_)
      if (resp.error) {
        setFeedback({ type: "error", text: resp.error })
        setSheet({ members: [], dates: [], statuses: {} })
      } else {
        setSheet({ members: resp.members, dates: resp.dates, statuses: resp.statuses })
      }
      setLoading(false)
    },
    [groupId],
  )

  useEffect(() => {
    let active = true
    ;(async () => {
      await load(days)
      if (!active) return
      const { code } = await suggestGroupMatricule(groupId)
      if (active) setSuggested(code)
    })()
    return () => {
      active = false
    }
  }, [groupId, days, load])

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const { firstName, lastName } = splitFullName(fullName)
    if (!firstName || !lastName) {
      setFeedback({ type: "error", text: "Le nom complet est requis." })
      return
    }
    setBusy(true)
    const resp = await addGroupMember(groupId, firstName, lastName, matricule.trim() || undefined)
    setBusy(false)
    if (!resp.success) {
      setFeedback({ type: "error", text: resp.error ?? "Ajout impossible." })
      return
    }
    setFullName("")
    setMatricule("")
    setFeedback({ type: "success", text: "Membre ajouté." })
    await load(days)
    const { code } = await suggestGroupMatricule(groupId)
    setSuggested(code)
  }

  async function handleRename(personId: string) {
    const { firstName, lastName } = splitFullName(editName)
    if (!firstName || !lastName) {
      setFeedback({ type: "error", text: "Le nom complet est requis." })
      return
    }
    setBusy(true)
    const resp = await renameGroupMember(personId, firstName, lastName)
    setBusy(false)
    if (!resp.success) {
      setFeedback({ type: "error", text: resp.error ?? "Modification impossible." })
      return
    }
    setEditingId(null)
    setFeedback({ type: "success", text: "Membre modifié." })
    await load(days)
  }

  async function handleDelete(person: Person) {
    if (!window.confirm(`Supprimer « ${memberDisplayName(person)} » et ses présences ?`)) return
    setBusy(true)
    const resp = await removeGroupMember(person.id)
    setBusy(false)
    if (!resp.success) {
      setFeedback({ type: "error", text: resp.error ?? "Suppression impossible." })
      return
    }
    setFeedback({ type: "success", text: "Membre supprimé." })
    await load(days)
  }

  async function handleCell(personId: string, date: string) {
    const current = sheet.statuses[personId]?.[date] ?? "unmarked"
    const next = nextInCycle(current)
    setSheet((prev) => ({
      ...prev,
      statuses: {
        ...prev.statuses,
        [personId]: { ...(prev.statuses[personId] ?? {}), [date]: next },
      },
    }))
    const resp = await setAttendanceStatus(groupId, date, personId, next)
    if (!resp.success) {
      setFeedback({ type: "error", text: resp.error ?? "Enregistrement impossible." })
      await load(days)
    }
  }

  async function handleBulk(status: AttendanceStatus) {
    const label =
      status === "present" ? "Présents" : status === "absent" ? "Absents" : "Non renseignés"
    if (!window.confirm(`Marquer tous les ${vocab.personLabelPlural.toLowerCase()} comme ${label} aujourd'hui ?`)) {
      return
    }
    setBusy(true)
    const map: Record<string, string> = {}
    for (const m of sheet.members) map[m.id] = status
    const resp = await setBulkAttendance(groupId, today, map)
    setBusy(false)
    if (resp.error) {
      setFeedback({ type: "error", text: resp.error })
      return
    }
    setFeedback({
      type: resp.errors.length ? "error" : "success",
      text: resp.errors.length
        ? `${resp.updated} mis à jour, ${resp.errors.length} erreur(s).`
        : `${resp.updated} ${vocab.personLabelPlural.toLowerCase()} mis à jour.`,
    })
    await load(days)
  }

  function saveCsv(csv: string, filename: string) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleExportMembers() {
    setBusy(true)
    try {
      const resp = await exportGroupMembersCsv(groupId)
      if (resp.error) {
        setFeedback({ type: "error", text: resp.error })
        return
      }
      if (!resp.csv) {
        setFeedback({ type: "error", text: "Aucune donnée à exporter." })
        return
      }
      saveCsv(resp.csv, "membres-registra.csv")
      setFeedback({ type: "success", text: "Export des membres généré." })
    } catch (err) {
      setFeedback({ type: "error", text: err instanceof Error ? err.message : "Export impossible." })
    } finally {
      setBusy(false)
    }
  }

  async function handleExportAttendance() {
    setBusy(true)
    try {
      const resp = await exportGroupAttendanceCsv(groupId)
      if (resp.error) {
        setFeedback({ type: "error", text: resp.error })
        return
      }
      if (!resp.csv) {
        setFeedback({ type: "error", text: "Aucune présence à exporter." })
        return
      }
      saveCsv(resp.csv, "presences-registra.csv")
      setFeedback({ type: "success", text: "Export des présences généré." })
    } catch (err) {
      setFeedback({ type: "error", text: err instanceof Error ? err.message : "Export impossible." })
    } finally {
      setBusy(false)
    }
  }

  function handlePrint() {
    const head = sheet.dates
      .map((d) => `<th>${d === today ? "Aujourd'hui" : formatShortDate(d)}</th>`)
      .join("")
    const body = sheet.members
      .map((m) => {
        const cells = sheet.dates
          .map((d) => {
            const s = sheet.statuses[m.id]?.[d] ?? "unmarked"
            return `<td class="s-${s}">${statusLabel(s)}</td>`
          })
          .join("")
        return `<tr><td class="name">${escapeHtml(m.student_id ?? "")} — ${escapeHtml(
          memberDisplayName(m),
        )}</td>${cells}</tr>`
      })
      .join("")
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(vocab.attendanceLabel)}</title>
      <style>
        @page { size: A4 landscape; margin: 1.2cm; }
        body { font-family: Arial, sans-serif; color: #0f172a; }
        h1 { font-size: 18px; margin: 0 0 4px; }
        p { color: #475569; font-size: 12px; margin: 0 0 8px; }
        table { border-collapse: collapse; width: 100%; font-size: 11px; }
        th, td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: center; }
        th { background: #0f766e; color: #fff; }
        td.name { text-align: left; white-space: nowrap; font-weight: 600; }
        .s-present { background: #dcfce7; }
        .s-late { background: #fef3c7; }
        .s-absent { background: #fee2e2; }
      </style></head><body>
      <h1>${escapeHtml(vocab.attendanceLabel)}</h1>
      <p>${escapeHtml(vocab.personLabelPlural)} : ${sheet.members.length} · généré le ${new Date().toLocaleDateString("fr-FR")}</p>
      <table><thead><tr><th>${escapeHtml(vocab.personLabel)}</th>${head}</tr></thead><tbody>${body}</tbody></table>
      </body></html>`

    const iframe = document.createElement("iframe")
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0"
    document.body.appendChild(iframe)
    const doc = iframe.contentWindow?.document
    if (!doc) return
    doc.open()
    doc.write(html)
    doc.close()
    setTimeout(() => {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
      setTimeout(() => document.body.removeChild(iframe), 1000)
    }, 250)
  }

  if (loading) {
    return <LoadingState message="Chargement du groupe…" />
  }

  return (
    <div className="flex flex-col gap-6">
      {feedback && (
        <Alert variant={feedback.type === "error" ? "destructive" : "default"} className="py-2.5">
          <AlertDescription>{feedback.text}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {vocab.personLabelPlural} ({sheet.members.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {sheet.members.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun {vocab.personLabel.toLowerCase()} pour le moment. Ajoutez le premier ci-dessous.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {sheet.members.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  {editingId === m.id ? (
                    <div className="flex flex-1 flex-wrap items-end gap-2">
                      <Input
                        aria-label="Nom complet"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="max-w-[16rem]"
                      />
                      <Button size="sm" onClick={() => handleRename(m.id)} disabled={busy}>
                        Enregistrer
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        Annuler
                      </Button>
                    </div>
                  ) : (
                    <>
                      <span className="flex min-w-0 items-center gap-2">
                        {m.student_id ? (
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                            {m.student_id}
                          </span>
                        ) : null}
                        <span className="truncate font-medium">{memberDisplayName(m)}</span>
                      </span>
                      <span className="flex shrink-0 gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingId(m.id)
                            setEditName(memberDisplayName(m))
                          }}
                        >
                          Renommer
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDelete(m)} disabled={busy}>
                          Supprimer
                        </Button>
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleAdd} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="member-name">Nom complet</Label>
              <Input
                id="member-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ex. Jean Dupont"
                maxLength={160}
                disabled={busy}
                required
              />
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-40">
              <Label htmlFor="member-code">Matricule (auto)</Label>
              <Input
                id="member-code"
                value={matricule}
                onChange={(e) => setMatricule(e.target.value)}
                placeholder={suggested}
                maxLength={40}
                disabled={busy}
              />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? "…" : "Ajouter"}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">
            Un matricule unique (#0001, #0002…) est attribué automatiquement pour distinguer les homonymes.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>{vocab.attendanceLabel}</CardTitle>
          <div className="flex gap-1">
            {([7, 30, "all"] as const).map((opt) => (
              <Button
                key={String(opt)}
                size="sm"
                variant={days === opt ? "default" : "outline"}
                onClick={() => setDays(opt)}
              >
                {opt === "all" ? "Tout" : `${opt} j`}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {sheet.members.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ajoutez au moins un {vocab.personLabel.toLowerCase()} pour ouvrir la feuille.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Cliquez sur une cellule pour cycler <strong>·</strong> → <strong>P</strong> Présent →{" "}
                <strong>R</strong> Retard → <strong>A</strong> Absent. La colonne surlignée est
                aujourd&apos;hui.
              </p>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 border border-border bg-muted px-2 py-1 text-left">
                        {vocab.personLabel}
                      </th>
                      {sheet.dates.map((d) => (
                        <th
                          key={d}
                          className={`border border-border px-2 py-1 text-xs ${
                            d === today ? "bg-primary text-primary-foreground" : "bg-muted"
                          }`}
                        >
                          {d === today ? "Aujourd'hui" : formatShortDate(d)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.members.map((m) => (
                      <tr key={m.id}>
                        <td className="sticky left-0 z-10 border border-border bg-background px-2 py-1 text-left">
                          <span className="flex flex-col">
                            <span className="font-medium">{memberDisplayName(m)}</span>
                            {m.student_id ? (
                              <span className="font-mono text-[0.7rem] text-muted-foreground">
                                {m.student_id}
                              </span>
                            ) : null}
                          </span>
                        </td>
                        {sheet.dates.map((d) => {
                          const s = sheet.statuses[m.id]?.[d] ?? "unmarked"
                          return (
                            <td
                              key={d}
                              className={`border border-border p-0 text-center ${
                                d === today ? "bg-primary/5" : ""
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => handleCell(m.id, d)}
                                aria-label={`${memberDisplayName(m)} — ${d} — ${statusLabel(s)}`}
                                className={`h-8 w-full text-xs font-bold ${CELL_COLORS[s] ?? ""} ${statusColor(
                                  s as AttendanceStatus,
                                )}`}
                              >
                                {statusLabel(s)}
                              </button>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 p-2">
                <span className="text-xs font-semibold text-muted-foreground">Aujourd&apos;hui :</span>
                <Button size="sm" variant="outline" onClick={() => handleBulk("present")} disabled={busy}>
                  Tout Présent
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleBulk("absent")} disabled={busy}>
                  Tout Absent
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleBulk("unmarked")} disabled={busy}>
                  Effacer
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={handlePrint}>
                  Imprimer / PDF
                </Button>
                <Button variant="outline" onClick={handleExportAttendance} disabled={busy}>
                  Exporter les présences (CSV)
                </Button>
                <Button variant="outline" onClick={handleExportMembers} disabled={busy}>
                  Exporter les membres (CSV)
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function escapeHtml(value: string): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  )
}
