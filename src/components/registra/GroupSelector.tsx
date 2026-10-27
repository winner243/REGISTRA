/* Sélecteur de groupe - Affiche la liste des groupes avec sélection */
"use client"

import { useState, useEffect } from 'react'
import { listUserGroups } from '@/lib/registra/actions'

export interface GroupSelectorProps {
  /** Groupe pré-sélectionné (id) */
  defaultValue?: string
  /** Callback appelé quand le groupe change */
  onSelect: (groupId: string, groupName: string) => void
  /** Titre affiché au-dessus de la liste */
  title?: string
  /** Filtrer par type d'organisation ? */
  filterByOrg?: boolean
}

export function GroupSelector({
  defaultValue,
  onSelect,
  title = 'Groupe',
}: GroupSelectorProps) {
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    const loadGroups = async () => {
      const resp = await listUserGroups()
      if (resp.groups) {
        setGroups(resp.groups.map((g) => ({ id: g.id, name: g.name })))
        // Si defaultValue fourni et trouvé, le sélectionner
        if (defaultValue && resp.groups.some((g) => g.id === defaultValue)) {
          setSelectedId(defaultValue)
        }
      }
    }

    loadGroups()
  }, [defaultValue])

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    setSelectedId(val)
    if (onSelect) {
      const group = groups.find((g) => g.id === val)
      onSelect(val, group ? group.name : '')
    }
  }

  if (groups.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M3 4h18" />
          <path d="M12 8l4 4L12 16l-4-4z" />
        </svg>
        <span>Aucun groupe trouvé. Créez-en un depuis le tableau de bord.</span>
      </div>
    )
  }

  return (
    <div className="relative">
      <label htmlFor="group-selector" className="absolute left-0 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        {title}
      </label>

      <select
        id="group-selector"
        value={selectedId || ''}
        onChange={handleChange}
        className="block w-full rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        disabled={!groups.length}
      >
        <option value="">Aucun groupe</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>

      {/* Flèche déroulante */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  )
}