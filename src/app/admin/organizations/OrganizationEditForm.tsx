"use client"

/**
 * Formulaire de modification d'un établissement — côté Super Admin.
 *
 * Client Component : il n'embarque AUCUNE logique d'autorisation. Il délègue
 * au Server Action, qui revérifie le claim de plateforme avant d'écrire. Le
 * bouton n'apparaît que si l'action est réellement disponible ; aucune action
 * n'est affichée à l'état « désactivé » ou « simulée ».
 *
 * Champ Type :
 *   - établissement AYANT des réglages → les 8 types, pré-sélection = actuel,
 *     toute valeur sélectionnée modifie réellement la ligne ;
 *   - établissement SANS réglage → option « Non défini » en plus. La soumettre
 *     envoie une valeur vide : le Server Action n'écrit alors QUE le nom et ne
 *     crée pas de ligne `organization_registra_settings` à l'aveugle.
 *
 * Le dialogue se referme dans la transition (après résolution de l'action),
 * et non dans un effet : pas de rendu en cascade, et la fermeture est
 * conditionnée à un succès réel.
 */

import { useId, useState, useTransition } from "react"
import { Pencil } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { updateOrganizationAction } from "@/lib/platform-admin/actions"
import type { AdminActionState } from "@/lib/platform-admin/actions"
import { ORG_TYPES } from "@/lib/registra/vocab"

const INITIAL_STATE: AdminActionState = { ok: false, message: "" }

/** Sentinelles : aucun réglage, ou valeur volontairement vide. */
const NO_SETTING = "__none__"
const NO_TYPE_SUBMIT = ""

export function OrganizationEditForm({
  organization,
  currentType,
}: {
  organization: { id: string; name: string }
  /** Type actuel, `null` si l'établissement n'a aucune ligne de réglage. */
  currentType: string | null
}) {
  const [state, setState] = useState<AdminActionState>(INITIAL_STATE)
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<string>(currentType ?? NO_SETTING)
  const [pending, startTransition] = useTransition()
  const fieldId = useId()
  const typeId = useId()

  const submittedType = type === NO_SETTING ? NO_TYPE_SUBMIT : type

  const formAction = (formData: FormData) => {
    startTransition(async () => {
      const result = await updateOrganizationAction(INITIAL_STATE, formData)
      setState(result)
      // Fermeture conditionnée à un succès réel — jamais en cas d'erreur.
      if (result.ok) setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Modifier ${organization.name}`}
          />
        }
      >
        <Pencil className="size-4" aria-hidden="true" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" aria-busy={pending}>
        <DialogHeader>
          <DialogTitle>Modifier l&apos;établissement</DialogTitle>
          <DialogDescription>
            Le nom est le libellé affiché dans toute REGISTRA. Le type détermine
            les libellés par défaut (École, Église, Entreprise…).
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="organizationId" value={organization.id} />
          <input type="hidden" name="organizationType" value={submittedType} />

          <div className="space-y-2">
            <Label htmlFor={fieldId}>Nom de l&apos;établissement</Label>
            <Input
              id={fieldId}
              name="name"
              defaultValue={organization.name}
              required
              minLength={2}
              maxLength={120}
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={typeId}>Type</Label>
            <Select value={type} onValueChange={(value) => value && setType(value)}>
              <SelectTrigger id={typeId} className="w-full">
                <SelectValue placeholder="Type d'établissement" />
              </SelectTrigger>
              <SelectContent>
                {currentType === null && (
                  <SelectItem value={NO_SETTING}>
                    Non défini (aucun réglage)
                  </SelectItem>
                )}
                {ORG_TYPES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {currentType === null && type === NO_SETTING && (
              <p className="text-xs text-muted-foreground">
                Choisir un type créera les réglages REGISTRA de cet établissement.
              </p>
            )}
          </div>

          {state.message ? (
            <p
              role={state.ok ? "status" : "alert"}
              className={state.ok ? "text-sm text-primary" : "text-sm text-destructive"}
            >
              {state.message}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
