import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

interface LoadingStateProps {
  message?: string
  size?: "sm" | "default" | "lg"
  className?: string
}

const sizeStyles = {
  sm: "size-4",
  default: "size-6",
  lg: "size-8",
}

export function LoadingState({
  message = "Chargement...",
  size = "default",
  className,
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-4 py-10 text-center",
        className
      )}
    >
      <Loader2
        aria-hidden="true"
        className={cn("animate-spin text-muted-foreground", sizeStyles[size])}
      />
      <p className="text-sm text-muted-foreground">{message}</p>
      <span className="sr-only">{message}</span>
    </div>
  )
}
