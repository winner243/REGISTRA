import { AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface ErrorStateProps {
  title?: string
  description?: string
  onRetry?: () => void
  retryLabel?: string
  className?: string
}

export function ErrorState({
  title = "Une erreur est survenue.",
  description = "Impossible de charger les données. Réessaie dans un instant.",
  onRetry,
  retryLabel = "Réessayer",
  className,
}: ErrorStateProps) {
  return (
    <Card
      role="alert"
      aria-live="assertive"
      className={cn(
        "border-destructive/40 bg-destructive/5",
        className
      )}
    >
      <CardContent className="flex flex-col items-center gap-4 px-4 py-12 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle
            aria-hidden="true"
            className="size-6 text-destructive"
          />
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description && (
            <p className="max-w-md text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {onRetry && (
          <Button variant="outline" onClick={onRetry} type="button">
            {retryLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
