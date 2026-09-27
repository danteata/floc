import { Building2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { useOrganization } from "@/hooks/use-organization"

interface OrgNode {
  _id: string
  name: string
  path?: string
}

// Shown when an org admin has browsed into a descendant org (e.g. a parent-org
// admin viewing one of their sub-organizations), so it's never mistaken for
// their own org. Renders the full ancestor chain (home org → … → viewed
// sub-organization) as a breadcrumb, each ancestor clickable to jump to it.
export function ViewingOrgBanner() {
  const {
    isViewingDescendant,
    currentOrganization,
    homeOrganization,
    context,
    viewOrganization,
    returnToHomeOrganization,
  } = useOrganization()

  if (!isViewingDescendant || !currentOrganization) return null

  const accessible: OrgNode[] = context?.accessibleOrganizations || []
  const nameById = new Map(accessible.map((o) => [o._id, o]))

  // The current org's materialized path is "/rootId/…/currentId". Resolve each
  // segment to an org we can actually see; ids above the home org (not in the
  // accessible set) drop out, so the chain naturally starts at the home org.
  const segmentIds: string[] = (currentOrganization.path || "")
    .split("/")
    .filter(Boolean)
  const chain = segmentIds
    .map((id) => nameById.get(id))
    .filter((o): o is OrgNode => !!o)

  const jumpTo = (org: OrgNode) => {
    if (org._id === homeOrganization?._id) {
      void returnToHomeOrganization()
    } else {
      void viewOrganization(org._id)
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 sm:px-6 bg-primary/10 border-b border-primary/20 text-sm">
      <div className="flex items-center gap-2 min-w-0 text-primary">
        <Building2 className="h-4 w-4 shrink-0" />
        {chain.length > 1 ? (
          <Breadcrumb>
            <BreadcrumbList className="text-primary/80">
              {chain.map((org, i) => {
                const isLast = i === chain.length - 1
                return (
                  <BreadcrumbItem key={org._id}>
                    {isLast ? (
                      <BreadcrumbPage className="text-primary font-medium">
                        {org.name}
                      </BreadcrumbPage>
                    ) : (
                      <>
                        <BreadcrumbLink
                          onClick={() => jumpTo(org)}
                          className="cursor-pointer hover:text-primary"
                        >
                          {org.name}
                        </BreadcrumbLink>
                        <BreadcrumbSeparator />
                      </>
                    )}
                  </BreadcrumbItem>
                )
              })}
            </BreadcrumbList>
          </Breadcrumb>
        ) : (
          <span className="truncate">
            Viewing <span className="font-medium">{currentOrganization.name}</span>
            {homeOrganization && <>, part of {homeOrganization.name}</>}
          </span>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 max-w-[45%] gap-1.5 text-primary hover:bg-primary/15 shrink-0"
        onClick={() => returnToHomeOrganization()}
        aria-label={`Back to ${homeOrganization?.name ?? "your church"}`}
      >
        <X className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Back to {homeOrganization?.name ?? "your church"}</span>
      </Button>
    </div>
  )
}
