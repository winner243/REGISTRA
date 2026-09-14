import type { Metadata } from "next"

import { PageHeader } from "@/components/dashboard/PageHeader"
import { StatCard } from "@/components/dashboard/StatCard"
import { RecentActivity } from "@/components/dashboard/RecentActivity"
import { Badge } from "@/components/ui/badge"
import { stats, recentActivity } from "@/data/demo-dashboard"

export const metadata: Metadata = {
  title: "Tableau de bord",
}

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tableau de bord"
        description="Bienvenue 👋 Voici un aperçu de votre espace."
        actions={
          <Badge variant="outline" className="shrink-0">
            Données de démonstration
          </Badge>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <StatCard
            key={stat.id}
            label={stat.label}
            value={stat.value}
            icon={stat.icon}
            trend={stat.trend}
            trendUp={stat.trendUp}
          />
        ))}
      </div>

      <RecentActivity items={recentActivity} />
    </div>
  )
}
