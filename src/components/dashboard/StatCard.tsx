import type { LucideIcon } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { TrendingDown, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"

interface StatCardProps {
  label: string
  value: string
  icon?: LucideIcon
  trend?: string
  trendUp?: boolean
  className?: string
}

export function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  trendUp = true,
  className,
}: StatCardProps) {
  const TrendIcon = trendUp ? TrendingUp : TrendingDown

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardDescription className="flex items-center justify-between gap-2">
          <span>{label}</span>
          {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <CardTitle className="text-2xl font-semibold tracking-tight tabular-nums">
          {value}
        </CardTitle>
        {trend && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendIcon
              className={cn(
                "size-3.5",
                trendUp ? "text-emerald-600" : "text-red-600"
              )}
            />
            <span className="font-medium text-foreground">{trend}</span>
            <span>vs last month</span>
          </p>
        )}
      </CardContent>
    </Card>
  )
}
