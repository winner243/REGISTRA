import type { LucideIcon } from "lucide-react"
import {
  LayoutDashboard,
  Folder,
  Users,
  BarChart3,
  Settings,
  CreditCard,
  CircleUser,
  IdCard,
} from "lucide-react"

export type NavItem = {
  label: string
  href?: string
  icon?: LucideIcon
  active?: boolean
  disabled?: boolean
  /** Ne considère l'élément actif que si le chemin correspond exactement à href. */
  exact?: boolean
}

export const mainNav: NavItem[] = [
  { label: "Tableau de bord", href: "/dashboard" },
  { label: "Tarifs", href: "/pricing" },
  { label: "Documentation" },
]

export const sidebarNav: NavItem[] = [
  { label: "Tableau de bord", href: "/dashboard", icon: LayoutDashboard, exact: true },
  { label: "Projets", icon: Folder },
  { label: "Clients", icon: Users },
  { label: "Statistiques", icon: BarChart3 },
  { label: "Paramètres", href: "/dashboard/settings", icon: Settings },
  { label: "Facturation", href: "/dashboard/billing", icon: CreditCard },
  { label: "Compte", href: "/dashboard/account", icon: CircleUser },
  { label: "Profil", href: "/dashboard/profile", icon: IdCard },
]
