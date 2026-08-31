import { Unauthorized } from "@/components/states/unauthorized"

export default function ForbiddenPage() {
  return (
    <Unauthorized
      code="403"
      title="Accès refusé"
      description="Vous n'avez pas les autorisations nécessaires pour accéder à cette page."
      backHref="/dashboard"
      backLabel="Retour au dashboard"
    />
  )
}
