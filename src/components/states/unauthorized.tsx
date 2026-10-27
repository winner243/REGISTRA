import Link from "next/link"
import { ShieldX } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface UnauthorizedProps {
  code?: string
  title?: string
  description?: string
  /** Lien du bouton "Retour". Défaut : accueil. */
  backHref?: string
  backLabel?: string
  className?: string
}

export function Unauthorized({
  code = "403",
  title = "Accès refusé",
  description = "Vous n'avez pas les autorisations nécessaires pour accéder à cette page.",
  backHref = "/",
  backLabel = "Retour à l'accueil",
  className,
}: UnauthorizedProps) {
  return (
    <main
      className={cn(
        "mx-auto flex w-full max-w-7xl flex-1 items-center justify-center px-4 py-16 sm:px-6 sm:py-24 lg:px-8",
        className
      )}
    >
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-muted">
          <ShieldX aria-hidden="true" className="size-7 text-muted-foreground" />
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-muted-foreground" aria-hidden="true">
            {code}
          </p>
          <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {title}
          </h1>
          <p className="text-pretty text-sm text-muted-foreground">
            {description}
          </p>
        </div>
        <Button nativeButton={false} render={<Link href={backHref} />}>{backLabel}</Button>
      </div>
    </main>
  )
}
