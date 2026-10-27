/* Labels vocabulaire organisationnel - Affiche les libellés selon le type d'organisation */
"use client"

import { getVocab, OrgType, defaultVocab, type VocabConfig } from '@/lib/registra/vocab'

export interface VocabLabelsProps {
  /** Type d'organisation ('school', 'church', 'training_center', etc.) */
  orgType?: OrgType
  /** Settings personnalisés en base (optionnel) */
  customSettings?: {
    vocab_group_label?: string
    vocab_group_label_plural?: string
    vocab_person_label?: string
    vocab_person_label_plural?: string
    vocab_presence_label?: string
    vocab_attendance_label?: string
  }
}

export function VocabLabels({ orgType, customSettings }: VocabLabelsProps) {
  const vocab = getVocab(orgType ?? 'other', customSettings)

  const t = (key: keyof VocabConfig) => vocab[key] ?? defaultVocab[key]

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="font-medium">{t('groupLabel')}&nbsp;:</span>
        <span>{t('groupLabelPlural')}</span>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="font-medium">{t('personLabel')}&nbsp;:</span>
        <span>{t('personLabelPlural')}</span>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="font-medium">{t('presenceLabel')}&nbsp;:</span>
        <span>•</span>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="font-medium">{t('attendanceLabel')}&nbsp;:</span>
        <span>•</span>
      </div>
    </div>
  )
}
