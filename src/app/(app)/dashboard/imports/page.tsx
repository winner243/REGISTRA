/* Import / Export — sélection EXPLICITE de l'établissement (pas de choix implicite) */
"use client"

import { useEffect, useState } from "react"

import { listUserOrganizations } from "@/lib/orgs"
import {
  exportAttendanceCsvAction,
  exportGroupsCsv,
  exportPersonsCsv,
} from "@/lib/registra/actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { GroupSelector } from "@/components/registra/GroupSelector"
import { ImportWizard } from "@/components/registra/ImportWizard"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { ImportReport } from "@/lib/registra/types"

type Feedback = { type: "success" | "error"; text: string } | null

export default function ImportsPage() {
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string }>>([])
  const [organizationId, setOrganizationId] = useState<string>("")
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  useEffect(() => {
    const load = async () => {
      const orgs = await listUserOrganizations()
      setOrganizations(orgs.map(({ id, name }) => ({ id, name })))
    }
    load()
  }, [])

  function saveCsv(csv: string, filename: string) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function handleImportChange(report: ImportReport) {
    if (report.errors.length > 0) {
      setFeedback({ type: "error", text: `${report.errors.length} erreur(s) lors de l'import.` })
    } else if (report.added > 0) {
      setFeedback({ type: "success", text: `${report.added} élément(s) importé(s) sur ${report.total}.` })
    }
  }

  async function handleExportMembers() {
    if (!selectedGroupId) {
      setFeedback({ type: "error", text: "Sélectionnez un groupe." })
      return
    }
    setBusy(true)
    const resp = await exportPersonsCsv(selectedGroupId)
    setBusy(false)
    if (resp.error) return setFeedback({ type: "error", text: resp.error })
    if (!resp.csv) return setFeedback({ type: "error", text: "Aucune donnée à exporter." })
    saveCsv(resp.csv, "personnes-registra.csv")
    setFeedback({ type: "success", text: "Export des membres généré." })
  }

  async function handleExportAttendance() {
    if (!selectedGroupId) {
      setFeedback({ type: "error", text: "Sélectionnez un groupe." })
      return
    }
    setBusy(true)
    const resp = await exportAttendanceCsvAction(selectedGroupId)
    setBusy(false)
    if (resp.error) return setFeedback({ type: "error", text: resp.error })
    if (!resp.csv) return setFeedback({ type: "error", text: "Aucune présence à exporter." })
    saveCsv(resp.csv, "presences-registra.csv")
    setFeedback({ type: "success", text: "Export des présences généré." })
  }

  async function handleExportGroups() {
    if (!organizationId) {
      setFeedback({ type: "error", text: "Sélectionnez un établissement." })
      return
    }
    setBusy(true)
    const resp = await exportGroupsCsv(organizationId)
    setBusy(false)
    if (resp.error) return setFeedback({ type: "error", text: resp.error })
    if (!resp.csv) return setFeedback({ type: "error", text: "Aucun groupe à exporter." })
    saveCsv(resp.csv, "groupes-registra.csv")
    setFeedback({ type: "success", text: "Export des groupes généré." })
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
          <CardTitle>Établissement</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Label htmlFor="imports-org">Établissement concerné</Label>
          <Select value={organizationId} onValueChange={(value) => value && setOrganizationId(value)}>
            <SelectTrigger id="imports-org" className="max-w-sm">
              <SelectValue placeholder="Choisir un établissement" />
            </SelectTrigger>
            <SelectContent>
              {organizations.map((org) => (
                <SelectItem key={org.id} value={org.id}>
                  {org.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Requis pour l&apos;import et l&apos;export des groupes.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Importer</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div>
            <p className="mb-2 text-sm font-medium">Groupes (CSV : name, description)</p>
            <ImportWizard
              type="groups"
              organizationId={organizationId || undefined}
              onImport={handleImportChange}
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Membres (CSV : first_name, last_name, student_id, group_id)</p>
            <ImportWizard type="persons" onImport={handleImportChange} />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Présences (CSV : group_id, record_date, person_id, status)</p>
            <ImportWizard type="attendance" onImport={handleImportChange} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Exporter</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div>
            <Label>Groupe (membres / présences)</Label>
            <GroupSelector onSelect={(groupId) => setSelectedGroupId(groupId)} title="Groupe" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleExportMembers} disabled={busy}>
              Membres (CSV)
            </Button>
            <Button variant="outline" onClick={handleExportAttendance} disabled={busy}>
              Présences (CSV)
            </Button>
            <Button variant="outline" onClick={handleExportGroups} disabled={busy}>
              Groupes de l&apos;établissement (CSV)
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
