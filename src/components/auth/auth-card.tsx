import type { ReactNode } from "react"

import { Logo } from "@/components/brand/Logo"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

interface AuthCardProps {
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}

export function AuthCard({
  title,
  description,
  children,
  footer,
}: AuthCardProps) {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 px-4 py-10 sm:py-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo size={40} showName={false} />
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="sr-only">{title}</CardTitle>
          {description && <CardDescription className="sr-only">{description}</CardDescription>}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">{children}</CardContent>
      </Card>

      {footer && (
        <div className="text-center text-sm text-muted-foreground">{footer}</div>
      )}
    </div>
  )
}
