"use client"

import { useEffect } from "react"
import { brandVariables } from "../../convex/lib/theme/css"
import { useTheme } from "@/components/theme-provider"

/**
 * Paint an organization's brand onto the document.
 *
 * ## Why the derivation runs on the client
 *
 * The server stores one hex. A dozen variables come out of `deriveBrand`,
 * contrast-checked against both themes' surfaces. Doing that here rather than
 * server-side means an improvement to the derivation reaches every organization
 * on their next load, and the settings preview runs the exact code the runtime
 * does — a preview computed differently from the thing it previews is a preview
 * of nothing.
 *
 * ## Why it depends on `resolvedTheme`
 *
 * We write resolved values (`--primary: #0369a1`), not a per-mode pair, because
 * our stylesheet resolves the mode in JavaScript rather than in the cascade.
 * The cost of that is this dependency: without it the brand would be painted
 * for whichever mode happened to be active when it mounted, and stay wrong
 * after the reader hit the theme toggle — or after their OS switched at sunset
 * while they had "system" selected. That is the classic runtime-theming bug,
 * where a brand looks right until it doesn't.
 *
 * Every property set here is removed on cleanup, and cleanup runs BEFORE the
 * next apply, so switching brands in the settings preview can never leave a
 * variable from the previous one behind.
 */
export function BrandProvider({
  brandHex,
  children,
}: {
  /** Null for an organization that hasn't chosen one: the product's palette stays. */
  brandHex: string | null | undefined
  children?: React.ReactNode
}) {
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    if (!brandHex) return
    const root = document.documentElement

    let variables: Record<string, string>
    try {
      variables = brandVariables(brandHex, resolvedTheme)
    } catch {
      // A stored colour that can't be parsed must not take the app down. Our
      // own palette is a complete, working fallback — which is the whole reason
      // branding is an override rather than a replacement.
      return
    }

    for (const [name, value] of Object.entries(variables)) {
      root.style.setProperty(name, value)
    }
    return () => {
      for (const name of Object.keys(variables)) root.style.removeProperty(name)
    }
  }, [brandHex, resolvedTheme])

  return <>{children}</>
}
