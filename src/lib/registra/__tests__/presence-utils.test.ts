import { describe, test, expect } from '@/lib/registra/test-setup'
import { nextStatus, statusLabel, statusColor, isMarked, countByStatus, computeNextMatricule, formatMatricule, splitFullName, memberDisplayName, type AttendanceStatus } from '@/lib/registra/utils'
import type { AttendanceRecord } from '@/lib/registra/types'

function recordStub(status: AttendanceStatus): AttendanceRecord {
  return {
    id: 'test',
    organization_id: 'test',
    group_id: 'test',
    person_id: 'test',
    record_date: '2026-01-01',
    status,
    marked_by: null,
    marked_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

describe('Presence cycle utils', () => {
  // Test du cycle -→P→R→A→-
  test('unmarked → present → late → absent → unmarked', () => {
    expect(nextStatus('unmarked')).toBe('present')
    expect(nextStatus('present')).toBe('late')
    expect(nextStatus('late')).toBe('absent')
    expect(nextStatus('absent')).toBe('unmarked')
  })

  // Test statusLabel
  test('statusLabel renvoie les bons symboles', () => {
    expect(statusLabel('unmarked')).toBe('—')
    expect(statusLabel('present')).toBe('P')
    expect(statusLabel('late')).toBe('R')
    expect(statusLabel('absent')).toBe('A')
  })

  // Test statusColor
  test('statusColor renvoie les bonnes couleurs', () => {
    expect(statusColor('unmarked')).toBe('text-muted-foreground')
    expect(statusColor('present')).toBe('text-green-600')
    expect(statusColor('late')).toBe('text-amber-600')
    expect(statusColor('absent')).toBe('text-red-600')
  })

  // Test isMarked
  test('isMarked détecte les présences marquées', () => {
    expect(isMarked(recordStub('present'))).toBe(true)
    expect(isMarked(recordStub('late'))).toBe(true)
    expect(isMarked(recordStub('absent'))).toBe(true)
    expect(isMarked(recordStub('unmarked'))).toBe(false)
  })

  // Test countByStatus
  test('countByStatus compte correctement', () => {
    const records = [
      recordStub('present'),
      recordStub('present'),
      recordStub('late'),
      recordStub('absent'),
      recordStub('unmarked'),
    ]
    const counts = countByStatus(records)
    expect(counts.present).toBe(2)
    expect(counts.late).toBe(1)
    expect(counts.absent).toBe(1)
    expect(counts.unmarked).toBe(1)
    expect(counts.total).toBe(5)
  })
})

describe('Matricules auto-générés', () => {
  test('formatMatricule formate en #0001', () => {
    expect(formatMatricule(1)).toBe('#0001')
    expect(formatMatricule(12)).toBe('#0012')
  })

  test('computeNextMatricule renvoie #0001 quand rien n\'est utilisé', () => {
    expect(computeNextMatricule([])).toBe('#0001')
    expect(computeNextMatricule([null, undefined, ''])).toBe('#0001')
  })

  test('computeNextMatricule ne réutilise jamais un matricule existant', () => {
    expect(computeNextMatricule(['#0001', '#0002'])).toBe('#0003')
  })

  test('computeNextMatricule comble le premier trou sans écraser', () => {
    expect(computeNextMatricule(['#0001', '#0003'])).toBe('#0002')
  })

  test('computeNextMatricule ignore les codes non conformes au format', () => {
    expect(computeNextMatricule(['MAT-001', '#0001'])).toBe('#0002')
  })
})

describe('Nom complet (modèle de saisie prototype)', () => {
  test('splitFullName sépare prénom et nom', () => {
    expect(splitFullName('Jean Dupont')).toEqual({ firstName: 'Jean', lastName: 'Dupont' })
    expect(splitFullName('Jean Pierre Dupont')).toEqual({ firstName: 'Jean', lastName: 'Pierre Dupont' })
  })

  test('splitFullName gère un seul mot (prénom = nom)', () => {
    expect(splitFullName('Awa')).toEqual({ firstName: 'Awa', lastName: 'Awa' })
  })

  test('splitFullName normalise les espaces', () => {
    expect(splitFullName('  Awa   Diallo  ')).toEqual({ firstName: 'Awa', lastName: 'Diallo' })
  })

  test('memberDisplayName ne duplique pas un nom d\'un seul mot', () => {
    expect(memberDisplayName({ first_name: 'Jean', last_name: 'Dupont' })).toBe('Jean Dupont')
    expect(memberDisplayName({ first_name: 'Awa', last_name: 'Awa' })).toBe('Awa')
    expect(memberDisplayName({ first_name: 'Awa', last_name: 'Diallo' })).toBe('Awa Diallo')
  })
})
