import { DollarSign, Users, FolderKanban } from "lucide-react"

export type Stat = {
  id: string
  label: string
  value: string
  icon: typeof DollarSign
  trend: string
  trendUp: boolean
}

export const stats: Stat[] = [
  {
    id: "revenue",
    label: "Revenus",
    value: "$12,450",
    icon: DollarSign,
    trend: "+12.5%",
    trendUp: true,
  },
  {
    id: "users",
    label: "Utilisateurs",
    value: "1,284",
    icon: Users,
    trend: "+8.2%",
    trendUp: true,
  },
  {
    id: "projects",
    label: "Projets",
    value: "342",
    icon: FolderKanban,
    trend: "+4.1%",
    trendUp: true,
  },
]

export type ActivityItem = {
  id: string
  action: string
  user: string
  date: string
}

export const recentActivity: ActivityItem[] = [
  { id: "1", action: "Projet créé", user: "John Doe", date: "Aujourd'hui" },
  { id: "2", action: "Profil mis à jour", user: "Jane Doe", date: "Hier" },
  { id: "3", action: "Client ajouté", user: "Alex Martin", date: "Il y a 2 jours" },
]