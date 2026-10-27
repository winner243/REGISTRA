/**
 * Types TypeScript alignés sur le schéma SQL Registra V1.
 * Doivent rester en parfaite synchronisation avec la migration 20260927000001.
 */

export type AttendanceStatus = 'unmarked' | 'present' | 'late' | 'absent'

/** Organisation — type d'organisation Registra */
export type OrgType =
  | 'school'
  | 'church'
  | 'training_center'
  | 'company'
  | 'association'
  | 'ngo'
  | 'sports_club'
  | 'other';

export type OrgTypeKey = OrgType;

/** Settings organisation Registra (en 1:1 avec organizations) */
export interface OrganizationRegistraSettings {
  organization_id: string;
  organization_type: OrgType;
  description?: string;
  vocab_group_label?: string;
  vocab_group_label_plural?: string;
  vocab_person_label?: string;
  vocab_person_label_plural?: string;
  vocab_presence_label?: string;
  vocab_attendance_label?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Organisation (table `public.organizations`).
 *
 * Colonnes réelles vérifiées en base : `id`, `name`, `created_by`,
 * `created_at`, `updated_at`. Il n'existe **aucune colonne `slug`** (PostgreSQL
 * 42703) : le champ est retiré plutôt que déclaré puis fictivement renseigné.
 */
export interface Organization {
  id: string;
  name: string;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Rôle (`public.roles`).
 *
 * La table porte uniquement `name` (clé primaire) et `description` : elle ne
 * possède ni `id`, ni `is_system`, ni colonnes de timestamp.
 */
export interface Role {
  name: string;
  description?: string | null;
}

/**
 * Permission (`public.permissions`).
 *
 * La table porte uniquement `name` (clé primaire) et `description` : elle ne
 * possède ni `id` ni `key`.
 */
export interface Permission {
  name: string;
  description?: string | null;
}

/** Association rôle-permission (`public.role_permissions` : role, permission). */
export interface RolePermission {
  role: string;
  permission: string;
}

/** Groupes */
export interface Group {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

/** Personnes */
export interface Person {
  id: string;
  group_id: string;
  first_name: string;
  last_name: string;
  student_id?: string; // matricule, unique par groupe
  created_at: string;
  updated_at: string;
}

/** Enregistrements de présence */
export interface AttendanceRecord {
  id: string;
  organization_id: string;
  group_id: string;
  person_id: string;
  record_date: string; // ISO date
  status: AttendanceStatus;
  marked_by?: string | null;
  marked_at?: string | null; // ISO timestamp
  created_at: string;
  updated_at: string;
}

/** Filtres et périodes */
export type AttendancePeriod = 'today' | 'week' | 'month' | 'year' | 'all';

export interface AttendanceFilters {
  period?: AttendancePeriod;
  limit?: number;
  offset?: number;
}

/** Résultat d'import */
export interface ImportReport {
  total: number;
  added: number;
  duplicates: number;
  errors: Array<{ row: number; field: string; message: string }>;
}

/** Résumé de stats */
export interface AttendanceStats {
  total_persons: number;
  present: number;
  late: number;
  absent: number;
  unmarked: number;
  total_sessions: number;
  attendance_rate: number; // 0-100
}

/** Filtres export */
export type ExportScope = 'group' | 'person';
export interface ExportFilter {
  scope: ExportScope;
  id: string; // groupId ou personId
  period?: AttendancePeriod;
}

/** VocabConfig retourné par getVocab() */
export interface VocabConfig {
  groupLabel: string;
  groupLabelPlural: string;
  personLabel: string;
  personLabelPlural: string;
  presenceLabel: string;
  attendanceLabel: string;
}

/** Options de la grille présence */
export interface AttendanceGridOptions {
  groupId: string;
  date: string; // ISO date string
  persons: Person[];
  existingRecords: AttendanceRecord[]; // records déjà en base pour cette date
}

/** Options du Wizard import */
export interface ImportWizardStep {
  step: 1 | 2 | 3; // 1: fichier, 2: preview, 3:rapport
  errors: string[];
  progress: number; // 0-100
}

/** Paramètres du Bulk Mark Attendance */
export interface BulkMarkAttendanceParams {
  groupId: string;
  date: string; // ISO date
  statusMap: Record<string, string>; // personId -> status ('unmarked'|'present'|'late'|'absent')
}

/** Résultat du Bulk Mark Attendance */
export interface BulkMarkAttendanceResult {
  created: number;
  updated: number;
  errors: string[];
}