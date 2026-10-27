/**
 * Utilitaires Registra : cycle présence, libellés, helpers divers.
 * Ces fonctions sont pures (pas de dépendance base), testables unitairement.
 */

import { type AttendanceStatus, type VocabConfig, type AttendanceRecord, type Person, type AttendancePeriod } from './types'

/** Re-export types for convenience */
export type { AttendanceStatus, VocabConfig, AttendancePeriod }

/** Cycle présence : — → P → M → A → — */
export const ATTENDANCE_CYCLE: AttendanceStatus[] = ['unmarked', 'present', 'late', 'absent'];

/** Retourne le statut suivant dans le cycle. */
export function nextStatus(current: AttendanceStatus): AttendanceStatus {
  const idx = ATTENDANCE_CYCLE.indexOf(current);
  return ATTENDANCE_CYCLE[(idx + 1) % ATTENDANCE_CYCLE.length];
}

/** Label affiché pour un statut (frontend) : '—' / 'P' / 'R' / 'A'. */
export function statusLabel(status: AttendanceStatus, vocab?: VocabConfig): string {
  // Mapping backend universel, indépendamment du vocabulaire.
  // 'late' = retard (prototype : R). Le code base reste 'late'.
  const map: Record<AttendanceStatus, string> = {
    unmarked: '—',
    present: 'P',
    late: 'R',
    absent: 'A',
  };
  return map[status];
}

/** Couleur CSS pour un statut (frontend). */
export function statusColor(status: AttendanceStatus): string {
  const map: Record<AttendanceStatus, string> = {
    unmarked: 'text-muted-foreground',
    present: 'text-green-600',
    late: 'text-amber-600',
    absent: 'text-red-600',
  };
  return map[status];
}

/** Texte long pour un statut (ex. pour tooltips). */
export function statusFullText(status: AttendanceStatus): string {
  const map: Record<AttendanceStatus, string> = {
    unmarked: 'Non renseigné',
    present: 'Présent',
    late: 'Retard',
    absent: 'Absent',
  };
  return map[status];
}

/** Vérifie si le statut est "non renseigné" (== 'unmarked'). */
export function isUnmarked(status: AttendanceStatus): boolean {
  return status === 'unmarked';
}

/** Compte le nombre de présents / absents / etc. dans un tableau. */
export function countByStatus(
  records: AttendanceRecord[],
): {
  present: number;
  late: number;
  absent: number;
  unmarked: number;
  total: number;
} {
  const counts = {
    present: 0,
    late: 0,
    absent: 0,
    unmarked: 0,
    total: records.length,
  };

  for (const record of records) {
    switch (record.status) {
      case 'present':
        counts.present++;
        break;
      case 'late':
        counts.late++;
        break;
      case 'absent':
        counts.absent++;
        break;
      case 'unmarked':
        counts.unmarked++;
        break;
    }
  }

  return counts;
}

/** Filtre un tableau d'enregistrements par statut. */
export function filterByStatus(
  records: AttendanceRecord[],
  status: AttendanceStatus,
): AttendanceRecord[] {
  return records.filter((r) => r.status === status);
}

/** Vérifie si un enregistrement a déjà été marqué (status ≠ unmarked). */
export function isMarked(record: AttendanceRecord): boolean {
  return record.status !== 'unmarked';
}

/** Retourne le temps écoulé depuis le marquage (en minutes), ou null. */
export function markedDurationMinutes(record: AttendanceRecord, now?: Date): number | null {
  if (!record.marked_at) return null;
  const date = now ?? new Date();
  const diffMs = date.getTime() - new Date(record.marked_at).getTime();
  return Math.round(diffMs / 60000)
}

/** Préfixe des matricules auto-générés (prototype : « #0001 »). */
export const MATRICULE_PREFIX = '#';
/** Formate une séquence en matricule (#0001). */
export function formatMatricule(seq: number): string {
  return `${MATRICULE_PREFIX}${String(seq).padStart(4, '0')}`;
}

/**
 * Calcule le prochain matricule disponible pour un groupe à partir des
 * matricules déjà utilisés. Ne réutilise jamais un matricule existant :
 * renvoie le plus petit numéro libre (0 → n).
 */
export function computeNextMatricule(used: Array<string | null | undefined>): string {
  const taken = new Set(used.filter((v): v is string => typeof v === 'string' && v.length > 0));
  let seq = 1;
  while (taken.has(formatMatricule(seq))) {
    seq++;
  }
  return formatMatricule(seq);
}

/**
 * Sépare un « nom complet » (modèle de saisie du prototype) en prénom + nom.
 * Un seul mot → prénom = nom = ce mot (affichage dédupliqué via memberDisplayName).
 */
export function splitFullName(full: string): { firstName: string; lastName: string } {
  const value = String(full ?? '').trim().replace(/\s+/g, ' ');
  if (!value) return { firstName: '', lastName: '' };
  const parts = value.split(' ');
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

/** Nom d'affichage d'un membre (évite la duplication pour un nom d'un seul mot). */
export function memberDisplayName(person: { first_name: string; last_name: string }): string {
  if (!person.first_name) return person.last_name;
  if (!person.last_name) return person.first_name;
  if (person.first_name === person.last_name) return person.first_name;
  return `${person.first_name} ${person.last_name}`;
}

/** Compte les présences par statut pour un groupe et une date donnés.
 *  Utilise le cycle — → P → R → A → — pour déterminer le prochain statut.
 */
export function getGroupAttendance(
  groupId: string,
  recordDate: string,
  persons: Person[],
  records: AttendanceRecord[]
) {
  // Construire la map des enregistrements existants
  const recordMap = new Map<string, AttendanceRecord>()
  for (const r of records) {
    recordMap.set(r.person_id, r)
  }

  // Calculer le statut de chaque personne
  const enrichedPersons = persons.map((person) => {
    const record = recordMap.get(person.id) ?? {
      id: '',
      organization_id: '',
      group_id: groupId,
      person_id: person.id,
      record_date: recordDate,
      status: 'unmarked',
      marked_by: null,
      marked_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as AttendanceRecord

    const next = nextStatus(record.status as AttendanceStatus)
    return {
      ...person,
      currentStatus: record.status,
      nextStatus: next,
    }
  })

  // Calculer le résumé
  const summary = countByStatus(records)

  // Construire nextForEach
  const nextForEach: Record<string, string> = {}
  for (const person of enrichedPersons) {
    nextForEach[person.id] = statusLabel(person.nextStatus as AttendanceStatus)
  }

  return {
    persons: enrichedPersons as Person[],
    records,
    summary,
    nextForEach,
  }
}