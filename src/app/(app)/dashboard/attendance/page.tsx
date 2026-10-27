/* Route « Présence » conservée pour compatibilité.
   Le parcours opérationnel passe désormais par la page centrale du groupe
   (/dashboard/groups/[groupId]) qui intègre la feuille de présence.
   On redirige donc vers la liste des groupes. */
import { redirect } from "next/navigation"

export default function AttendancePage() {
  redirect("/dashboard/groups")
}
