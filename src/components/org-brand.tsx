"use client"

import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { BrandProvider } from "@/components/brand-provider"
import { useOrganization } from "@/hooks/use-organization"
import { useFlag } from "@/hooks/use-flags"

/**
 * The signed-in app's brand: this user's organization, if it has set one.
 *
 * Split from `BrandProvider` so the provider itself stays a pure "paint this
 * hex" component — which is what lets the settings preview and the public
 * pages reuse it with a colour that came from somewhere else entirely.
 */
export function OrgBrand({ children }: { children?: React.ReactNode }) {
  const { organization } = useOrganization()
  const enabled = useFlag("release.org_branding")

  const theme = useQuery(
    api.organizations.getTheme,
    enabled && organization?._id ? { organization_id: organization._id } : "skip",
  )

  // `configured` rather than just `brandHex`: getTheme reports our own default
  // for an organization that never chose one, and painting that would be a
  // no-op that still costs a re-render on every theme toggle.
  return <BrandProvider brandHex={theme?.configured ? theme.brandHex : null}>{children}</BrandProvider>
}
