import { CheckCircle2, X } from "lucide-react"

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface SuccessMessageProps {
  message: string
  title?: string
  onClose?: () => void
  className?: string
}

export function SuccessMessage({
  message,
  title,
  onClose,
  className,
}: SuccessMessageProps) {
  return (
    <Alert
      role="status"
      aria-live="polite"
      className={cn(
        "border-emerald-600/30 bg-emerald-50 text-emerald-900 [&_svg]:text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-100 [&_[data-slot=alert-description]]:text-emerald-900/90 dark:[&_[data-slot=alert-description]]:text-emerald-100/90",
        className
      )}
    >
      <CheckCircle2 aria-hidden="true" />
      {title && <AlertTitle>{title}</AlertTitle>}
      <AlertDescription>{message}</AlertDescription>
      {onClose && (
        <AlertAction>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Fermer le message"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </Button>
        </AlertAction>
      )}
    </Alert>
  )
}
