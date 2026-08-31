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
  { label: "Dashboard", href: "/dashboard" },
  { label: "Pricing", href: "/pricing" },
  { label: "Documentation" },
]

export const sidebarNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, exact: true },
  { label: "Projects", icon: Folder },
  { label: "Customers", icon: Users },
  { label: "Analytics", icon: BarChart3 },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
  { label: "Billing", href: "/dashboard/billing", icon: CreditCard },
  { label: "Account", href: "/dashboard/account", icon: CircleUser },
  { label: "Profile", href: "/dashboard/profile", icon: IdCard },
]
