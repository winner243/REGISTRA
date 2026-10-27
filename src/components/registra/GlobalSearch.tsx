"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Search } from "lucide-react"

import { globalSearch } from "@/lib/registra/actions"
import { Input } from "@/components/ui/input"

type Results = Awaited<ReturnType<typeof globalSearch>>

export function GlobalSearch() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Results | null>(null)

  const term = query.trim()
  const active = term.length >= 2

  useEffect(() => {
    if (term.length < 2) return
    let cancelled = false
    const timer = setTimeout(async () => {
      if (cancelled) return
      setResults(null)
      const res = await globalSearch(term)
      if (!cancelled) setResults(res)
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [term])

  const total = results
    ? results.organizations.length + results.groups.length + results.members.length
    : 0

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher un établissement, un groupe, un membre, un matricule…"
          className="pl-9"
          aria-label="Recherche globale"
        />
      </div>

      {active && (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {results === null ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">Recherche…</p>
          ) : total === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              Aucun résultat pour « {term} ».
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {results.organizations.map((o) => (
                <li key={`org-${o.id}`}>
                  <a
                    href={`#org-${o.id}`}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-muted"
                  >
                    <span className="font-medium">{o.name}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Établissement</span>
                  </a>
                </li>
              ))}
              {results.groups.map((g) => (
                <li key={`group-${g.id}`}>
                  <Link
                    href={`/dashboard/groups/${g.id}`}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-muted"
                  >
                    <span>
                      <span className="font-medium">{g.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{g.orgName}</span>
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Groupe</span>
                  </Link>
                </li>
              ))}
              {results.members.map((m) => (
                <li key={`member-${m.id}`}>
                  <Link
                    href={`/dashboard/groups/${m.groupId}`}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-muted"
                  >
                    <span>
                      {m.code ? (
                        <span className="mr-2 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                          {m.code}
                        </span>
                      ) : null}
                      <span className="font-medium">{m.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{m.groupName}</span>
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Membre</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
