import { Unauthorized } from "@/components/states/unauthorized"

export default function NotFound() {
  return (
    <Unauthorized
      code="404"
      title="Page introuvable"
      description="La page que vous recherchez n'existe pas ou a été déplacée."
    />
  )
}
