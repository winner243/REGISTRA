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
    label: "Revenue",
    value: "$12,450",
    icon: DollarSign,
    trend: "+12.5%",
    trendUp: true,
  },
  {
    id: "users",
    label: "Users",
    value: "1,284",
    icon: Users,
    trend: "+8.2%",
    trendUp: true,
  },
  {
    id: "projects",
    label: "Projects",
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
  { id: "1", action: "Created project", user: "John Doe", date: "Today" },
  { id: "2", action: "Updated profile", user: "Jane Doe", date: "Yesterday" },
  { id: "3", action: "Added customer", user: "Alex Martin", date: "2 days ago" },
]
