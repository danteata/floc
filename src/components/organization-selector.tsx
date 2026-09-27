'use client'

import { useState } from 'react'
import { ChevronDown, Building2, Check, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { useOrganization } from '@/hooks/use-organization'
import { cn } from '@/lib/utils'

interface OrganizationSelectorProps {
  className?: string
}

// Minimal shape of an org node from api.organizations.list — carries the
// materialized-path fields used to render the hierarchy.
interface OrgNode {
  _id: string
  name: string
  depth?: number
  path?: string
  parent_organization_id?: string
}

export function OrganizationSelector({ className }: OrganizationSelectorProps) {
  const {
    context,
    isLoading,
    homeOrganization,
    viewOrganization,
    returnToHomeOrganization
  } = useOrganization()

  const accessibleOrganizations: OrgNode[] = context?.accessibleOrganizations || []
  const currentOrganization = context?.organization

  // Sorting by materialized `path` yields a correct pre-order tree traversal
  // (parents immediately before their descendants). Indentation is depth
  // relative to the home org, so arbitrary nesting renders without building
  // an explicit tree.
  const homeDepth = homeOrganization?.depth ?? 0
  const orgTree = [...accessibleOrganizations].sort((a, b) =>
    (a.path || "").localeCompare(b.path || "")
  )
  const hasHierarchy = orgTree.length > 1

  const [isOpen, setIsOpen] = useState(false)

  if (isLoading || !context) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="h-9 w-32 bg-muted/30 animate-pulse rounded-lg border border-border/30" />
      </div>
    )
  }

  const handleOrganizationSelect = async (org: OrgNode) => {
    try {
      if (org._id === homeOrganization?._id) {
        await returnToHomeOrganization()
      } else {
        await viewOrganization(org._id)
      }
      setIsOpen(false)
    } catch (error) {
      console.error('Failed to switch organization:', error)
    }
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={`flex items-center gap-2 h-9 px-3 hover:bg-primary/10 border border-transparent hover:border-primary/30 transition-all duration-300 rounded-lg ${className}`}
        >
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium truncate max-w-[16rem]">
            {currentOrganization?.name || "Choose a church"}
          </span>
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-200", isOpen && "rotate-180")} />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-[280px] p-1.5 glass-card border border-border/30 rounded-xl overflow-hidden">
        <div className="p-2 mb-1 bg-muted/30 rounded-lg border border-border/20">
          <DropdownMenuLabel className="p-0 text-[10px] text-muted-foreground tracking-wider mb-1.5 flex items-center gap-1.5">
            <Globe className="h-3 w-3" /> Current
          </DropdownMenuLabel>

          {currentOrganization ? (
            <div className="flex items-center gap-2 p-2 bg-primary/10 text-primary rounded-md border border-primary/30">
              <Building2 className="h-4 w-4" />
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{currentOrganization.name}</div>
              </div>
            </div>
          ) : (
            <div className="p-2 text-center border border-dashed border-border/50 rounded-md">
              <span className="text-xs text-muted-foreground">No selection</span>
            </div>
          )}
        </div>

        <DropdownMenuSeparator className="my-1.5 bg-border/30" />

        <DropdownMenuLabel className="px-2 pb-1.5 text-[10px] text-muted-foreground tracking-wider">
          {hasHierarchy ? "Organizations" : "Switch Organization"}
        </DropdownMenuLabel>

        <div className="space-y-0.5 max-h-[250px] overflow-y-auto scrollbar-thin">
          {orgTree.length > 0 ? (
            orgTree.map((org) => {
              const isSelected = currentOrganization?._id === org._id
              const isHome = homeOrganization?._id === org._id
              const indent = Math.max(0, (org.depth ?? 0) - homeDepth)
              return (
                <DropdownMenuItem
                  key={org._id}
                  onClick={() => handleOrganizationSelect(org)}
                  style={{ paddingLeft: `${8 + indent * 16}px` }}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-lg cursor-pointer text-sm transition-all duration-200",
                    isSelected
                      ? "bg-primary/15 text-primary border border-primary/30"
                      : "hover:bg-muted/50 hover:border hover:border-border/30"
                  )}
                >
                  {indent > 0 && (
                    <span className="text-muted-foreground/40 shrink-0 -ml-1 select-none">└</span>
                  )}
                  <Building2 className={cn("h-4 w-4 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")} />
                  <span className="truncate flex-1">{org.name}</span>
                  {isHome && hasHierarchy && (
                    <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 shrink-0">Home</Badge>
                  )}
                  {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </DropdownMenuItem>
              )
            })
          ) : (
            <div className="p-4 text-center text-xs text-muted-foreground">
              No other organizations
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}


// Compact version
export function OrganizationSelectorCompact({ className }: OrganizationSelectorProps) {
  const { context, isLoading } = useOrganization()

  if (isLoading || !context) {
    return (
      <div className={`h-6 w-24 bg-muted/30 animate-pulse rounded border border-border/20 ${className}`} />
    )
  }

  return (
    <div className={`flex items-center gap-1.5 text-xs ${className}`}>
      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="font-medium truncate">{context.organization?.name || "No org"}</span>
    </div>
  )
}
