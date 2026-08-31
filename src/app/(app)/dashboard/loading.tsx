import { LoadingState } from "@/components/states/loading-state"

export default function DashboardLoading() {
  return (
    <div className="flex items-center justify-center">
      <LoadingState message="Chargement de votre espace..." />
    </div>
  )
}
