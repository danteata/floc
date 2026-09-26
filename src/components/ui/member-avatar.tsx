import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

/** "Abena Osei-Mensah" → "AO"; "revrsm" → "R"; nothing → "?". */
export function initialsOf(name?: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  const first = words[0]![0] ?? ""
  const last = words.length > 1 ? words[words.length - 1]![0] ?? "" : ""
  return (first + last).toUpperCase()
}

interface MemberAvatarProps {
  name?: string | null
  src?: string | null
  size?: "sm" | "default" | "lg"
  className?: string
}

const SIZE = { sm: "size-7 text-[0.6875rem]", default: "size-9 text-xs", lg: "size-11 text-sm" }

/**
 * A person's photo, or their initials when there is none. Lists used to pass a
 * placeholder image that always loaded, so the initials never showed and every
 * row got the same grey circle.
 */
export function MemberAvatar({ name, src, size = "default", className }: MemberAvatarProps) {
  const hasPhoto = !!src && !src.startsWith("/placeholder")
  return (
    <Avatar className={cn(SIZE[size], className)}>
      {hasPhoto && <AvatarImage src={src!} alt="" />}
      <AvatarFallback className="bg-primary/10 font-semibold text-primary">{initialsOf(name)}</AvatarFallback>
    </Avatar>
  )
}
