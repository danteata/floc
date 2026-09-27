'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Edit, Crown, Target, Briefcase, Trash2, Plus, Users, Link2, RotateCcw, GitMerge } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Id } from '../../../convex/_generated/dataModel'
import { useToast } from '@/hooks/use-toast'

interface UnitCardProps {
  unit: {
    _id: string;
    name: string;
    type?: string;
    description?: string;
    category?: string;
    source_template_id?: string;
    template_overrides?: string[];
  }
  viewMode: 'grid' | 'list'
  memberCount?: number
  leaderName?: string
  onEdit?: (unitId: string) => void
  onCreateChild?: (unitId: string) => void
  onOverride?: (unitId: string) => void
  onReset?: (unitId: string) => void
  onMerge?: (unitId: string) => void
}

export function UnitCard({ unit, viewMode, memberCount, leaderName, onEdit, onCreateChild, onOverride, onReset, onMerge }: UnitCardProps) {
  const { toast } = useToast();
  const removeMutation = useMutation(api.units.remove);
  const isInherited = !!unit.source_template_id
  const hasOverrides = (unit.template_overrides?.length ?? 0) > 0

  const handleDelete = async () => {
    if (!confirm(`Delete "${unit.name}"? This can't be undone.`)) return;
    try {
      await removeMutation({ id: unit._id as Id<"units"> });
      toast({ title: `${unit.name} deleted` });
    } catch (e: any) {
      toast({ title: "Couldn't delete the unit", description: e.message, variant: "destructive" });
    }
  }

  const typeLabel = (() => {
    const t = (unit.type || 'administrative').replace(/[_-]+/g, ' ')
    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
  })()

  const getUnitIcon = (type: string) => {
    if (type === 'functional' || type === 'ministry') return <Target className="h-4 w-4 text-muted-foreground" />
    return <Briefcase className="h-4 w-4 text-muted-foreground" />
  }


  if (viewMode === 'list') {
    return (
      <div className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-card hover:bg-muted/30 transition-all group">
        <div className="flex items-center gap-4">
          <div className="shrink-0">
            {getUnitIcon(unit.type || 'administrative')}
          </div>
          <div>
            <h4 className="font-semibold text-sm tracking-tight text-foreground">{unit.name}</h4>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="outline" className="text-xs h-5 px-1.5 text-muted-foreground">
                {typeLabel}
              </Badge>
              {isInherited && (
                <Badge variant="outline" className="text-xs h-5 px-1.5 gap-1 border-primary/30 text-primary">
                  <Link2 className="h-3 w-3" /> Inherited{hasOverrides ? ' (overridden)' : ''}
                </Badge>
              )}
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3 w-3" /> {memberCount ?? 0}
              </span>
              {leaderName && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Crown className="h-3 w-3" /> {leaderName}
                </span>
              )}
            </div>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" aria-label={`Actions for ${unit.name}`} className="h-8 w-8 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity rounded-full hover:bg-muted">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-xl border-border/50 shadow-soft p-1 whitespace-nowrap">
            <DropdownMenuItem onClick={() => onEdit?.(unit._id)} className="cursor-pointer rounded-lg focus:bg-muted"><Edit className="h-4 w-4 mr-2" /> Edit</DropdownMenuItem>
            {onCreateChild && (
              <DropdownMenuItem onClick={() => onCreateChild(unit._id)} className="cursor-pointer rounded-lg focus:bg-muted"><Plus className="h-4 w-4 mr-2" /> Add sub-unit</DropdownMenuItem>
            )}
            {isInherited && onOverride && (
              <DropdownMenuItem onClick={() => onOverride(unit._id)} className="cursor-pointer rounded-lg focus:bg-muted"><Link2 className="h-4 w-4 mr-2" /> Override</DropdownMenuItem>
            )}
            {isInherited && hasOverrides && onReset && (
              <DropdownMenuItem onClick={() => onReset(unit._id)} className="cursor-pointer rounded-lg focus:bg-muted"><RotateCcw className="h-4 w-4 mr-2" /> Reset to template</DropdownMenuItem>
            )}
            {onMerge && (
              <DropdownMenuItem onClick={() => onMerge(unit._id)} className="cursor-pointer rounded-lg focus:bg-muted"><GitMerge className="h-4 w-4 mr-2" /> Merge into…</DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={handleDelete} className="text-destructive cursor-pointer rounded-lg focus:bg-destructive/10"><Trash2 className="h-4 w-4 mr-2" /> Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  }

  return (
    <Card className="rounded-xl overflow-visible group">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="shrink-0">
              {getUnitIcon(unit.type || 'administrative')}
            </div>
            <div>
              <h4 className="font-semibold text-base tracking-tight leading-none mb-1.5 text-foreground">{unit.name}</h4>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs text-muted-foreground">
                  {typeLabel}
                </p>
                {isInherited && (
                  <Badge variant="outline" className="text-xs h-5 px-1.5 gap-1 border-primary/30 text-primary">
                    <Link2 className="h-3 w-3" /> Inherited{hasOverrides ? ' (overridden)' : ''}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" aria-label={`Actions for ${unit.name}`} className="h-8 w-8 -mr-2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity rounded-full hover:bg-muted">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl border-border/50 shadow-soft p-1 whitespace-nowrap">
              <DropdownMenuItem onClick={() => onEdit?.(unit._id)} className="cursor-pointer rounded-lg focus:bg-muted"><Edit className="h-4 w-4 mr-2" /> Edit</DropdownMenuItem>
              {onCreateChild && (
                <DropdownMenuItem onClick={() => onCreateChild(unit._id)} className="cursor-pointer rounded-lg focus:bg-muted"><Plus className="h-4 w-4 mr-2" /> Add sub-unit</DropdownMenuItem>
              )}
              {isInherited && onOverride && (
                <DropdownMenuItem onClick={() => onOverride(unit._id)} className="cursor-pointer rounded-lg focus:bg-muted"><Link2 className="h-4 w-4 mr-2" /> Override</DropdownMenuItem>
              )}
              {isInherited && hasOverrides && onReset && (
                <DropdownMenuItem onClick={() => onReset(unit._id)} className="cursor-pointer rounded-lg focus:bg-muted"><RotateCcw className="h-4 w-4 mr-2" /> Reset to template</DropdownMenuItem>
              )}
              {onMerge && (
                <DropdownMenuItem onClick={() => onMerge(unit._id)} className="cursor-pointer rounded-lg focus:bg-muted"><GitMerge className="h-4 w-4 mr-2" /> Merge into…</DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={handleDelete} className="text-destructive cursor-pointer rounded-lg focus:bg-destructive/10"><Trash2 className="h-4 w-4 mr-2" /> Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground line-clamp-2 min-h-[40px]">
            {unit.description || "No description yet."}
          </p>
          <div className="flex items-center gap-3 flex-wrap pt-1 text-xs text-muted-foreground border-t border-border/40 mt-2 pt-3">
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> {memberCount ?? 0} {(memberCount ?? 0) === 1 ? 'member' : 'members'}
            </span>
            <span className={cn("inline-flex items-center gap-1.5", !leaderName && "text-muted-foreground/70")}>
              <Crown className="h-3.5 w-3.5" /> {leaderName || 'No leader'}
            </span>
            {unit.category && (
              <Badge variant="outline" className="text-xs bg-muted/50 ml-auto">
                {unit.category}
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
