import Image from "next/image"

import { brand } from "@/config/brand"
import { cn } from "@/lib/utils"

interface LogoProps {
  className?: string
  showName?: boolean
  size?: number
}

export function Logo({ className, showName = true, size = 32 }: LogoProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-2.5 text-foreground",
        className
      )}
    >
      <Image
        src={brand.logo.src}
        alt={brand.logo.alt}
        width={size}
        height={size}
        className={cn("shrink-0 object-contain", size === 32 ? "size-8" : "")}
        unoptimized
      />
      {showName && (
        <span className="text-sm font-semibold tracking-tight">
          {brand.name}
        </span>
      )}
    </span>
  )
}