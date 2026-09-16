import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import type { FlagKey } from "../../convex/lib/flags/catalog"
import { flagValue, flagsLoaded } from "../../convex/lib/flags/resolve"
import { useOrganization } from "@/hooks/use-organization"

/**
 * Feature flags in the UI.
 *
 * One reactive query for the whole map, so a flip reaches every open tab
 * without a refresh, and reading a flag costs nothing per call site.
 *
 * While it loads, every flag reads as its declared default — a kill switch
 * reads ON. That is deliberate: the SERVER enforces the switch (see
 * `convex/lib/flags/server.ts`), so a briefly-enabled button gives an honest
 * refusal, whereas a "temporarily unavailable" banner flickering on every page
 * load would be misinformation. Use `loaded` where the difference matters.
 */
export function useFlags() {
  const { organization } = useOrganization()
  const map = useQuery(
    api.flags.resolved,
    organization?._id ? { organization_id: organization._id } : {},
  )

  return {
    flag: (key: FlagKey) => flagValue(map, key),
    loaded: flagsLoaded(map),
  }
}

/** Single-flag convenience, for the common case. */
export function useFlag(key: FlagKey): boolean {
  return useFlags().flag(key)
}
