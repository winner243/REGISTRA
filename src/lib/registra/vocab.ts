/**
 * Vocabulaire dynamique Registra.
 * Presets définis par type d'organisation (code).
 * Configuration effective par organisation peut être persistée dans
 * organization_registra_settings (colonnes vocab_*_label, NULL → preset).
 *
 * Architecture : presets code → override par config base si personnalisé.
 * UI : <VocabLabel key="groupLabel" /> → lecture context, zéro requête DB.
 */

import { type VocabConfig } from './types';

export type { VocabConfig };

/** Prests par type d'organisation (tels que définis dans le cahier des charges). */
export const VOCAB_PRESETS: Record<string, VocabConfig> = {
  school: {
    groupLabel: 'Classe',
    groupLabelPlural: 'Classes',
    personLabel: 'Élève',
    personLabelPlural: 'Élèves',
    presenceLabel: 'Présence',
    attendanceLabel: 'Appel',
  },
  church: {
    groupLabel: 'Département',
    groupLabelPlural: 'Départements',
    personLabel: 'Membre',
    personLabelPlural: 'Membres',
    presenceLabel: 'Présence',
    attendanceLabel: 'Registre',
  },
  training_center: {
    groupLabel: 'Groupe',
    groupLabelPlural: 'Groupes',
    personLabel: 'Participant',
    personLabelPlural: 'Participants',
    presenceLabel: 'Présence',
    attendanceLabel: 'Émargement',
  },
  company: {
    groupLabel: 'Service',
    groupLabelPlural: 'Services',
    personLabel: 'Employé',
    personLabelPlural: 'Employés',
    presenceLabel: 'Présence',
    attendanceLabel: 'Pointage',
  },
  association: {
    groupLabel: 'Section',
    groupLabelPlural: 'Sections',
    personLabel: 'Adhérent',
    personLabelPlural: 'Adhérents',
    presenceLabel: 'Présence',
    attendanceLabel: 'Registre',
  },
  ngo: {
    groupLabel: 'Équipe',
    groupLabelPlural: 'Équipes',
    personLabel: 'Bénéficiaire',
    personLabelPlural: 'Bénéficiaires',
    presenceLabel: 'Présence',
    attendanceLabel: 'Registre',
  },
  sports_club: {
    groupLabel: 'Équipe',
    groupLabelPlural: 'Équipes',
    personLabel: 'Joueur',
    personLabelPlural: 'Joueurs',
    presenceLabel: 'Présence',
    attendanceLabel: 'Feuille de match',
  },
  other: {
    groupLabel: 'Groupe',
    groupLabelPlural: 'Groupes',
    personLabel: 'Personne',
    personLabelPlural: 'Personnes',
    presenceLabel: 'Présence',
    attendanceLabel: 'Registre',
  },
};

/**
 * Retourne le VocabConfig pour le type d'organisation donné.
 * Si des labels personnalisés sont définis en base (organization_registra_settings),
 * ils écrasent les presets code. Sinon, le preset (ou 'other') est utilisé.
 *
 * @param orgType Type d'organisation (ex. 'school', 'other')
 * @param customSettings Settings organisation en base (optionnel). Si fournis, les champs
 * non-NULL écrasent les presets.
 * @returns VocabConfig à afficher
 */
export function getVocab(orgType: OrgType, customSettings?: {
  vocab_group_label?: string;
  vocab_group_label_plural?: string;
  vocab_person_label?: string;
  vocab_person_label_plural?: string;
  vocab_presence_label?: string;
  vocab_attendance_label?: string;
}): VocabConfig {
  const base = VOCAB_PRESETS[orgType] ?? VOCAB_PRESETS.other;

  if (!customSettings) {
    return base;
  }

  return {
    groupLabel: customSettings.vocab_group_label ?? base.groupLabel,
    groupLabelPlural: customSettings.vocab_group_label_plural ?? base.groupLabelPlural,
    personLabel: customSettings.vocab_person_label ?? base.personLabel,
    personLabelPlural: customSettings.vocab_person_label_plural ?? base.personLabelPlural,
    presenceLabel: customSettings.vocab_presence_label ?? base.presenceLabel,
    attendanceLabel: customSettings.vocab_attendance_label ?? base.attendanceLabel,
  };
}

/** Type pour la fonction ci-dessus */
export type OrgType = 'school' | 'church' | 'training_center' | 'company' | 'association' | 'ngo' | 'sports_club' | 'other';

/**
 * Liste ordonnée des types d'organisation pour les formulaires (labels FR,
 * tels que définis dans VOCAB_PRESETS). Aucun type inventé.
 */
export const ORG_TYPES: Array<{ value: OrgType; label: string }> = [
  { value: 'school', label: 'École' },
  { value: 'church', label: 'Église' },
  { value: 'training_center', label: 'Centre de formation' },
  { value: 'company', label: 'Entreprise' },
  { value: 'association', label: 'Association' },
  { value: 'ngo', label: 'ONG' },
  { value: 'sports_club', label: 'Club sportif' },
  { value: 'other', label: 'Autre' },
];

/** Valeur par défaut utilisé dans les composants quand on ne connaît pas le type. */
export const defaultVocab: VocabConfig = VOCAB_PRESETS.other;