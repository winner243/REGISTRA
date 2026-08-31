import { SidebarNav } from "@/components/layout/SidebarNav"
import { sidebarNav } from "@/components/layout/nav"
import { cn } from "@/lib/utils"

interface SidebarProps {
  className?: string
}

export function Sidebar({ className }: SidebarProps) {
  return (
    <div
      className={cn(
        "hidden w-60 shrink-0 md:block",
        className
      )}
    >
      <div className="sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto border-r px-3 py-5">
        <SidebarNav items={sidebarNav} />
      </div>
    </div>
  )
}
