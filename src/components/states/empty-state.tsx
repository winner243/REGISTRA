import type { LucideIcon } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type StateAction = {
  label: string
  href?: string
  onClick?: () => void
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link"
}

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: StateAction
  secondaryAction?: StateAction
  className?: string
}

function StateButton({ action }: { action: StateAction }) {
  const { label, href, onClick, variant = "default" } = action

  if (href) {
    return (
      <Button variant={variant} render={<Link href={href} />}>
        {label}
      </Button>
    )
  }

  return (
    <Button variant={variant} onClick={onClick} type="button">
      {label}
    </Button>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 px-4 py-12 text-center",
        className
      )}
    >
      {Icon && (
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Icon aria-hidden="true" className="size-6 text-muted-foreground" />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description && (
          <p className="max-w-md text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {(action || secondaryAction) && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {action && <StateButton action={action} />}
          {secondaryAction && <StateButton action={secondaryAction} />}
        </div>
      )}
    </div>
  )
}
