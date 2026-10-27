import type { LucideIcon } from "lucide-react"
import {
  Building2,
  ClipboardList,
  CreditCard,
  KeyRound,
  LayoutDashboard,
  Users,
} from "lucide-react"

import type { NavItem } from "@/components/layout/nav"

/**
 * Navigation de l'espace Super Admin.
 *
 * Règle : **aucun lien vers une route qui n'existe pas**. Chaque entrée est
 * rattachée à un fichier `page.tsx` réel sous `src/app/admin/`.
 *
 * `Rôles` pointe vers une page de **lecture** : les rôles et permissions sont
 * globaux à toutes les organisations et aucune écriture n'est prévue ici.
 *
 * Il n'existe pas de journal d'audit dans REGISTRA (aucune table dédiée) :
 * cette entrée est volontairement absente plutôt que présentée puis cassée —
 * et les présences ne sont jamais présentées comme un audit.
 */
export const adminNav: NavItem[] = [
  { label: "Tableau de bord", href: "/admin", icon: LayoutDashboard, exact: true },
  { label: "Établissements", href: "/admin/organizations", icon: Building2 },
  { label: "Utilisateurs", href: "/admin/users", icon: Users },
  { label: "Rôles", href: "/admin/roles", icon: KeyRound },
  { label: "Abonnements", href: "/admin/subscriptions", icon: CreditCard },
  { label: "Présences récentes", href: "/admin/activity", icon: ClipboardList },
]
