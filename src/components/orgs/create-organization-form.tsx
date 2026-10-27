"use client"

import { useState, useTransition, type FormEvent } from "react"
import { useRouter } from "next/navigation"

import { createRegistraOrganization } from "@/lib/registra/actions"
import { ORG_TYPES, type OrgType } from "@/lib/registra/vocab"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const MAX_NAME_LENGTH = 100

export function CreateOrganizationForm({
  hasOrganizations = false,
}: {
  hasOrganizations?: boolean
}) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [type, setType] = useState<OrgType>("other")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const value = name.trim()
    if (value.length < 1) {
      setError("Le nom est requis.")
      return
    }
    if (value.length > MAX_NAME_LENGTH) {
      setError(`Le nom ne doit pas dépasser ${MAX_NAME_LENGTH} caractères.`)
      return
    }

    startTransition(async () => {
      const result = await createRegistraOrganization(value, type)
      if (result.error || !result.id) {
        setError(result.error ?? "Création impossible.")
        return
      }
      setName("")
      setType("other")
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-2">
        <Label htmlFor="organization-name">Nom de l&apos;établissement</Label>
        <Input
          id="organization-name"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Mon établissement"
          maxLength={MAX_NAME_LENGTH}
          disabled={isPending}
          required
        />
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <Label htmlFor="organization-type">Type</Label>
        <Select value={type} onValueChange={(value) => value && setType(value as OrgType)}>
          <SelectTrigger id="organization-type">
            <SelectValue placeholder="Type d'établissement" />
          </SelectTrigger>
          <SelectContent>
            {ORG_TYPES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending
          ? "Création…"
          : hasOrganizations
            ? "Ajouter"
            : "Créer l'établissement"}
      </Button>
      {error && (
        <Alert variant="destructive" className="py-2.5 sm:col-span-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </form>
  )
}
