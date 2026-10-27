/**
 * Test setup for Registra MVP V1.
 * Fournit lesglobals Vitest et les helpers nécessaires aux tests.
 */

import { describe, test, expect, vi } from 'vitest'
import { nextStatus, statusLabel, statusColor, isMarked, countByStatus, filterByStatus } from '@/lib/registra/utils'
import { type AttendanceStatus, type VocabConfig, type AttendanceRecord, type Person, type AttendancePeriod } from '@/lib/registra/types'

/** Re-export vitest globals for convenience */
export { describe, test, expect, vi }

/** Types et utils de test */
export type {
  AttendanceStatus,
  VocabConfig,
  AttendanceRecord,
  Person,
  AttendancePeriod
}

/** Utilities de cycle présence */
export { nextStatus, statusLabel, statusColor, isMarked, countByStatus, filterByStatus }

/** helpers de test */
export const ATTENDANCE_CYCLE: AttendanceStatus[] = ['unmarked', 'present', 'late', 'absent']