'use client'

import { Building2, ChevronDown, ChevronRight } from 'lucide-react'
import { UnitCard } from './unit-card'
import { useState } from 'react'

interface OrganizationHierarchyProps {
  organization: {
    organization: any;
    rootUnits?: any[];
    units?: any[];
    childUnits?: any[];
    memberCounts?: any[];
    totalMembers?: number;
  } | null
  viewMode: 'grid' | 'list'
  searchTerm?: string
  filterType?: string
  filterInheritance?: string
  onInheritTemplates: (unitId: string) => void
  onCreateUnit: (unitId: string) => void
  onEditUnit?: (unitId: string) => void
  onOverrideUnit?: (unitId: string) => void
  onResetUnit?: (unitId: string) => void
  onMergeUnit?: (unitId: string) => void
  /** Organization admins only: show each unit's actions menu. */
  canManage?: boolean
}

// "Functional" covers ministry units too, the same grouping as the stat card.
function matchesUnitType(type: string | undefined, filterType: string) {
  if (filterType === 'functional') return type === 'functional' || type === 'ministry'
  return type === filterType
}

// Look up a unit's stats from the memberCounts array.
function unitStats(memberCounts: any[], unitId: string) {
  const entry = memberCounts?.find((mc) => mc.unit_id === unitId)
  return { count: entry?.count ?? 0, leaderName: entry?.leaderName as string | undefined }
}

// Recursive component to render a unit and its children
function UnitNode({
  unit,
  childUnits,
  memberCounts,
  viewMode,
  onEditUnit,
  onCreateUnit,
  onOverrideUnit,
  onResetUnit,
  onMergeUnit,
  canManage = true,
  depth = 0
}: {
  unit: any
  childUnits: Record<string, any[]>
  memberCounts: any[]
  viewMode: 'grid' | 'list'
  onEditUnit?: (unitId: string) => void
  onCreateUnit?: (unitId: string) => void
  onOverrideUnit?: (unitId: string) => void
  onResetUnit?: (unitId: string) => void
  onMergeUnit?: (unitId: string) => void
  canManage?: boolean
  depth?: number
}) {
  const [isExpanded, setIsExpanded] = useState(true)
  const children = childUnits[unit._id] || []
  const stats = unitStats(memberCounts, unit._id)

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        {children.length > 0 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            aria-label={isExpanded ? `Collapse ${unit.name}` : `Expand ${unit.name}`}
            aria-expanded={isExpanded}
            className="mt-4 p-1 hover:bg-muted rounded-md transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        )}
        <div className="flex-1">
          <UnitCard
            key={unit._id}
            unit={{ ...unit, type: unit.type } as any}
            viewMode={viewMode}
            memberCount={stats.count}
            leaderName={stats.leaderName}
            onEdit={onEditUnit}
            onCreateChild={onCreateUnit}
            onOverride={onOverrideUnit}
            onReset={onResetUnit}
            onMerge={onMergeUnit}
            canManage={canManage}
          />
        </div>
      </div>

      {/* Render children recursively */}
      {children.length > 0 && isExpanded && (
        <div className="ml-6 pl-4 border-l-2 border-border/50 space-y-4">
          {children.map((childUnit) => (
            <UnitNode
              key={childUnit._id}
              unit={childUnit}
              childUnits={childUnits}
              memberCounts={memberCounts}
              viewMode={viewMode}
              onEditUnit={onEditUnit}
              onCreateUnit={onCreateUnit}
              onOverrideUnit={onOverrideUnit}
              onResetUnit={onResetUnit}
              onMergeUnit={onMergeUnit}
              canManage={canManage}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function OrganizationHierarchy({
  organization,
  viewMode,
  searchTerm = '',
  filterType = 'all',
  filterInheritance = 'all',
  onCreateUnit,
  onEditUnit,
  onOverrideUnit,
  onResetUnit,
  onMergeUnit,
  canManage = true,
}: OrganizationHierarchyProps) {
  if (!organization) return null

  const rootUnits = organization.rootUnits || [];
  const allUnits = organization.units || [];
  const memberCounts = organization.memberCounts || [];

  // 'template' is handled by the parent (shows the library only) — render nothing.
  if (filterInheritance === 'template') return null

  const query = searchTerm.trim().toLowerCase()
  const inheritanceActive = filterInheritance === 'direct' || filterInheritance === 'inherited'
  const isFiltering = query !== '' || (filterType && filterType !== 'all') || inheritanceActive

  // While filtering, nesting doesn't make sense for an arbitrary subset — show
  // a flat list of every unit matching the active filters.
  if (isFiltering) {
    const matches = allUnits.filter((u) => {
      const matchesText =
        query === '' ||
        u.name?.toLowerCase().includes(query) ||
        u.description?.toLowerCase().includes(query)
      const matchesType = !filterType || filterType === 'all' || matchesUnitType(u.type, filterType)
      const matchesInheritance =
        filterInheritance === 'direct' ? !u.source_template_id
          : filterInheritance === 'inherited' ? !!u.source_template_id
          : true
      return matchesText && matchesType && matchesInheritance
    })

    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground px-1">
          {matches.length} {matches.length === 1 ? 'unit' : 'units'} match your filters
        </p>
        {matches.length > 0 ? (
          <div className={viewMode === 'grid' ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3' : 'space-y-3'}>
            {matches.map((unit) => {
              const stats = unitStats(memberCounts, unit._id)
              return (
                <UnitCard
                  key={unit._id}
                  unit={{ ...unit, type: unit.type } as any}
                  viewMode={viewMode}
                  memberCount={stats.count}
                  leaderName={stats.leaderName}
                  onEdit={onEditUnit}
                  onCreateChild={onCreateUnit}
                  onOverride={onOverrideUnit}
                  onReset={onResetUnit}
                  onMerge={onMergeUnit}
                  canManage={canManage}
                />
              )
            })}
          </div>
        ) : (
          <div className="text-center py-12 border border-dashed border-border/50 rounded-xl bg-muted/10">
            <Building2 className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No units match your search or filter.</p>
          </div>
        )}
      </div>
    )
  }

  // Group ALL units by parent for the tree view.
  const unitsByParent = allUnits.reduce((acc, unit) => {
    const parentId = unit.parent_unit_id;
    if (parentId) {
      if (!acc[parentId]) acc[parentId] = [];
      acc[parentId].push(unit);
    }
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="space-y-12">
      {/* Root Level Units */}
      {rootUnits.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 px-1">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <div>
              <h3 className="text-xl tracking-tight text-foreground">
                Units
              </h3>
              <p className="text-sm text-muted-foreground">
                {allUnits.length} {allUnits.length === 1 ? 'unit' : 'units'} in your church
              </p>
            </div>
          </div>

          <div className="space-y-6" role="tree">
            {rootUnits.map((unit) => (
              <UnitNode
                key={unit._id}
                unit={unit}
                childUnits={unitsByParent}
                memberCounts={memberCounts}
                viewMode={viewMode}
                onEditUnit={onEditUnit}
                onCreateUnit={onCreateUnit}
                onOverrideUnit={onOverrideUnit}
                onResetUnit={onResetUnit}
                onMergeUnit={onMergeUnit}
                canManage={canManage}
              />
            ))}
          </div>
        </div>
      )}

      {/* Show message if no units */}
      {rootUnits.length === 0 && (
        <div className="text-center py-12 border border-dashed border-border/50 rounded-xl bg-muted/10">
          <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
          <h3 className="text-base font-semibold text-foreground mb-1">No units yet</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Add your first unit with Create to start setting out how your church is organized.
          </p>
        </div>
      )}
    </div>
  )
}
