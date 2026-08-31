import { Unauthorized } from "@/components/states/unauthorized"

export default function UnauthorizedPage() {
  return (
    <Unauthorized
      code="401"
      title="Non authentifié"
      description="Vous devez être connecté pour accéder à cette page."
      backLabel="Retour à la connexion"
      backHref="/login"
    />
  )
}
