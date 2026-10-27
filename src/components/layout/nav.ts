import type { LucideIcon } from "lucide-react"
import { LayoutDashboard, Layers, History, BarChart3, Upload } from "lucide-react"

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

/**
 * Navigation de l'application, réduite au périmètre du MVP Registra :
 * établissement → groupe → membres/feuille de présence → historique/stats → import/export.
 *
 * Les pages du Starter hors périmètre (Équipe, Notifications, Paramètres,
 * Facturation, Compte, Profil…) restent accessibles par leurs routes mais ne
 * sont pas exposées dans le menu (décision MVP : masquer, sans supprimer).
 */
export const sidebarNav: NavItem[] = [
  { label: "Tableau de bord", href: "/dashboard", icon: LayoutDashboard, exact: true },
  { label: "Groupes", href: "/dashboard/groups", icon: Layers },
  { label: "Historique", href: "/dashboard/group-history", icon: History },
  { label: "Statistiques", href: "/dashboard/stats", icon: BarChart3 },
  { label: "Import / Export", href: "/dashboard/imports", icon: Upload },
]
