"use client"

/* Gestion des groupes PAR ÉTABLISSEMENT (aucune organisation choisie implicitement). */
import { useCallback, useEffect, useState, type FormEvent } from "react"
import Link from "next/link"

import {
  createGroupAction,
  deleteGroupAction,
  listOrganizationGroups,
} from "@/lib/registra/actions"
import type { Group } from "@/lib/registra/types"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingState } from "@/components/states/loading-state"

type Organization = { id: string; name: string }

export function GroupsManager({ organizations }: { organizations: Organization[] }) {
  const [groupsByOrg, setGroupsByOrg] = useState<Record<string, Group[]>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<Record<string, string>>({})
  const [names, setNames] = useState<Record<string, string>>({})

  const loadAll = useCallback(async () => {
    const entries = await Promise.all(
      organizations.map(async (org) => {
        const resp = await listOrganizationGroups(org.id)
        return [org.id, resp.groups] as const
      }),
    )
    const map: Record<string, Group[]> = {}
    for (const [orgId, groups] of entries) map[orgId] = groups
    setGroupsByOrg(map)
    setLoading(false)
  }, [organizations])

  useEffect(() => {
    let active = true
    ;(async () => {
      await loadAll()
      if (!active) return
    })()
    return () => {
      active = false
    }
  }, [loadAll])

  async function handleCreate(orgId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = (names[orgId] ?? "").trim()
    if (!name) {
      setMessages((m) => ({ ...m, [orgId]: "Nom du groupe requis." }))
      return
    }
    setBusy(true)
    const resp = await createGroupAction(orgId, name)
    setBusy(false)
    if (resp.error) {
      setMessages((m) => ({ ...m, [orgId]: resp.error as string }))
      return
    }
    setNames((n) => ({ ...n, [orgId]: "" }))
    setMessages((m) => ({ ...m, [orgId]: `Groupe « ${name} » créé.` }))
    await loadAll()
  }

  async function handleDelete(group: Group) {
    if (!window.confirm(`Supprimer le groupe « ${group.name} » et ses données ?`)) return
    setBusy(true)
    const resp = await deleteGroupAction(group.id)
    setBusy(false)
    if (resp.error) {
      setMessages((m) => ({ ...m, [group.organization_id]: resp.error as string }))
      return
    }
    await loadAll()
  }

  if (organizations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucun établissement. Créez-en un depuis le tableau de bord.
      </p>
    )
  }

  if (loading) {
    return <LoadingState message="Chargement des groupes…" />
  }

  return (
    <div className="flex flex-col gap-6">
      {organizations.map((org) => {
        const groups = groupsByOrg[org.id] ?? []
        return (
          <Card key={org.id}>
            <CardHeader>
              <CardTitle>
                {org.name}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  ({groups.length} groupe{groups.length > 1 ? "s" : ""})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {groups.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun groupe dans cet établissement.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {groups.map((group) => (
                    <li key={group.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="truncate font-medium">{group.name}</span>
                      <span className="flex shrink-0 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          nativeButton={false}
                          render={<Link href={`/dashboard/groups/${group.id}`} />}
                        >
                          Ouvrir
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(group)}
                          disabled={busy}
                        >
                          Supprimer
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <form
                onSubmit={(event) => handleCreate(org.id, event)}
                className="flex flex-col gap-2 sm:flex-row sm:items-end"
              >
                <Input
                  value={names[org.id] ?? ""}
                  onChange={(event) => setNames((n) => ({ ...n, [org.id]: event.target.value }))}
                  placeholder="Nom du nouveau groupe"
                  maxLength={100}
                  disabled={busy}
                  aria-label={`Nouveau groupe pour ${org.name}`}
                />
                <Button type="submit" disabled={busy} className="w-fit">
                  Créer
                </Button>
              </form>
              {messages[org.id] && (
                <Alert variant="default" className="py-2">
                  <AlertDescription>{messages[org.id]}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
