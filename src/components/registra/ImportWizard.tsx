/* Import Wizard - Assistant d'import CSV pour groupes/personnes/présence */
"use client"

import { useState } from 'react'
import type { AttendanceStatus } from '@/lib/registra/types'
import {
  createGroupAction,
  createPersonAction,
  markAttendanceAction,
} from '@/lib/registra/actions'
import { useToast } from '@/components/ui/use-toast'

export interface ImportReport {
  total: number
  added: number
  duplicates: number
  errors: Array<{ row: number; field: string; message: string }>
}

export interface ImportWizardProps {
  onImport: (report: ImportReport) => void
  type: 'groups' | 'persons' | 'attendance'
  /** Établissement cible (requis pour l'import de groupes — pas de choix implicite). */
  organizationId?: string
}

export function ImportWizard({ onImport, type, organizationId }: ImportWizardProps) {
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<string>('')
  const [report, setReport] = useState<ImportReport>({
    total: 0, added: 0, duplicates: 0, errors: []
  })
  const { toast } = useToast()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) {
      setFile(selected)
      setProgress(0)
      setStatus('')
      setReport({ total: 0, added: 0, duplicates: 0, errors: [] })
    }
  }

  const readCSV = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target?.result as string)
      reader.onerror = () => reject(new Error('Erreur lecture fichier'))
      reader.readAsText(file)
    })
  }

  interface CsvCell {
    [key: string]: string
  }

  const parseCSV = (csv: string, headers: string[]): CsvCell[] => {
    const results: CsvCell[] = []
    const dataRows = csv.trim().split('\n').slice(1)
    for (let i = 0; i < dataRows.length; i++) {
      const cells = dataRows[i].split(',')
      const row: CsvCell = {}
      for (let j = 0; j < headers.length; j++) {
        if (j < cells.length) {
          row[headers[j]] = cells[j].replace(/^"|"$/g, '').trim()
        } else {
          row[headers[j]] = ''
        }
      }
      results.push(row)
    }
    return results
  }

  const handleImport = async () => {
    if (!file) return
    setProgress(0)
    setStatus('Début du parsing du fichier...')
    setReport({ total: 0, added: 0, duplicates: 0, errors: [] })

    let finalReport = { total: 0, added: 0, duplicates: 0, errors: [] as Array<{ row: number; field: string; message: string }> }
    try {
      const csvText = await readCSV(file)
      if (type === 'groups') finalReport = await handleGroupsImport(csvText)
      else if (type === 'persons') finalReport = await handlePersonsImport(csvText)
      else if (type === 'attendance') finalReport = await handleAttendanceImport(csvText)
      onImport(finalReport)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de l\'import'
      setStatus('Erreur lors de l\'import')
      toast({ title: 'Erreur', description: message, variant: 'destructive' })
      finalReport.errors.push({ row: 0, field: 'general', message })
      onImport(finalReport)
    } finally {
      setFile(null)
      setProgress(100)
    }
  }

  const handleGroupsImport = async (csvText: string): Promise<ImportReport> => {
    const headers = ['name', 'description', 'organization_type']
    const rows = parseCSV(csvText, headers)
    const nextReport: ImportReport = { total: rows.length, added: 0, duplicates: 0, errors: [] }
    setReport(nextReport)

    if (!organizationId) {
      nextReport.errors.push({ row: 0, field: 'organization', message: 'Sélectionnez un établissement.' })
      setReport(nextReport)
      return nextReport
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      setProgress(((i + 1) / rows.length) * 100)
      setStatus(`Traitement ligne ${i + 1}/${rows.length}...`)
      try {
        const name = row.name?.trim()
        if (!name) {
          nextReport.errors.push({ row: i + 1, field: 'name', message: 'Nom requis' })
          continue
        }
        const result = await createGroupAction(organizationId, name, row.description?.trim())
        if (result.error) {
          nextReport.errors.push({ row: i + 1, field: 'group', message: result.error })
        } else {
          nextReport.added++
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erreur inattendue'
        nextReport.errors.push({ row: i + 1, field: 'group', message })
      }
    }

    setReport(nextReport)
    setStatus('Import de groupes terminé')
    return nextReport
  }

  const handlePersonsImport = async (csvText: string): Promise<ImportReport> => {
    const headers = ['first_name', 'last_name', 'student_id', 'group_id']
    const rows = parseCSV(csvText, headers)
    const nextReport: ImportReport = { total: rows.length, added: 0, duplicates: 0, errors: [] }
    setReport(nextReport)

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      setProgress(((i + 1) / rows.length) * 100)
      setStatus(`Traitement ligne ${i + 1}/${rows.length}...`)
      try {
        const firstName = row.first_name?.trim()
        const lastName = row.last_name?.trim()
        const studentId = row.student_id?.trim()
        const groupId = row.group_id?.trim()
        if (!firstName || !lastName || !studentId || !groupId) {
          nextReport.errors.push({ row: i + 1, field: 'fields', message: 'Tous les champs requis' })
          continue
        }
        const result = await createPersonAction(groupId, firstName, lastName, studentId)
        if (result.error) {
          if (result.error.toLowerCase().includes('existe') || result.error.toLowerCase().includes('unique')) {
            nextReport.duplicates++
          } else {
            nextReport.errors.push({ row: i + 1, field: 'creation', message: result.error })
          }
        } else {
          nextReport.added++
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erreur inattendue'
        nextReport.errors.push({ row: i + 1, field: 'general', message })
      }
    }

    setReport(nextReport)
    setStatus('Import de personnes terminé')
    return nextReport
  }

  const handleAttendanceImport = async (csvText: string): Promise<ImportReport> => {
    const headers = ['group_id', 'record_date', 'person_id', 'status']
    const rows = parseCSV(csvText, headers)
    const nextReport: ImportReport = { total: rows.length, added: 0, duplicates: 0, errors: [] }
    setReport(nextReport)

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      setProgress(((i + 1) / rows.length) * 100)
      setStatus(`Traitement ligne ${i + 1}/${rows.length}...`)
      try {
        const groupId = row.group_id?.trim()
        const recordDate = row.record_date?.trim()
        const personId = row.person_id?.trim()
        const status = row.status?.trim()
        if (!groupId || !recordDate || !personId || !status) {
          nextReport.errors.push({ row: i + 1, field: 'fields', message: 'Tous les champs requis (group_id, record_date, person_id, status)' })
          continue
        }
        const validStatuses = ['unmarked', 'present', 'late', 'absent']
        if (!validStatuses.includes(status)) {
          nextReport.errors.push({ row: i + 1, field: 'status', message: 'Statut invalide. Doit être l\'une des: unmarked, present, late, absent' })
          continue
        }
        const result = await markAttendanceAction(groupId, recordDate, personId, status as AttendanceStatus)
        if (result.error) {
          nextReport.errors.push({ row: i + 1, field: 'mark', message: result.error })
        } else {
          nextReport.added++
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erreur inattendue'
        nextReport.errors.push({ row: i + 1, field: 'general', message })
      }
    }

    setReport(nextReport)
    setStatus('Import de présence terminé')
    return nextReport
  }

  return (
    <div className="space-y-4">
      <input
        type="file"
        accept=".csv"
        onChange={handleFileChange}
        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
      />
      <button
        onClick={handleImport}
        disabled={!file || progress > 0 && progress < 100}
        className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {progress > 0 ? `Import en cours (${Math.round(progress)}%)` : 'Importer le fichier CSV'}
      </button>
      {status && <p className="text-sm text-muted-foreground">{status}</p>}
      {report.total > 0 && (
        <div className="mt-4 p-4 border rounded bg-card">
          <h3 className="font-medium mb-2">Rapport d&apos;import</h3>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>Total : {report.total}</div>
            <div>Ajoutés : {report.added}</div>
            <div>Doublons : {report.duplicates}</div>
          </div>
          {report.errors.length > 0 && (
            <div className="mt-2 text-xs text-red-600">
              <span className="font-semibold">Erreurs ({report.errors.length})</span>
              <ul className="mt-1 space-y-1">
                {report.errors.map((e) => (
                  <li key={`${e.row}-${e.field}`}>Ligne {e.row} ({e.field}) : {e.message}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
