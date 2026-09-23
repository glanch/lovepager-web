import { Link } from "@tanstack/react-router"
import { Heart } from "lucide-react"

import { cn } from "@/lib/utils"

interface LogoProps {
  variant?: "full" | "icon" | "responsive"
  className?: string
  asLink?: boolean
}

export function Logo({
  variant = "full",
  className,
  asLink = true,
}: LogoProps) {
  const icon = (
    <Heart className={cn("h-5 w-5 text-pink-500 fill-pink-500", className)} />
  )

  const full = (
    <div className={cn("flex items-center gap-2", className)}>
      <Heart className="h-5 w-5 text-pink-500 fill-pink-500 shrink-0" />
      <span className="font-semibold tracking-tight">LovePager</span>
    </div>
  )

  const content =
    variant === "responsive" ? (
      <>
        <div className="group-data-[collapsible=icon]:hidden">{full}</div>
        <div className="hidden group-data-[collapsible=icon]:block">{icon}</div>
      </>
    ) : variant === "icon" ? (
      icon
    ) : (
      full
    )

  if (!asLink) return content
  return <Link to="/">{content}</Link>
}
