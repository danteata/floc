'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Crown, MoreHorizontal, Edit, Trash2, Plus, Network } from 'lucide-react'

interface TemplateItem {
  _id: string
  name: string
  description?: string
  type?: string
  category?: string
  cascade_to_sub_orgs?: boolean
  inherited?: boolean
  owner_org_name?: string
  instance_count?: number
}

interface TemplatesLibraryProps {
  templates: TemplateItem[]
  onEdit: (template: TemplateItem) => void
  onDelete: (templateId: string) => void
  onInstantiate: (template: TemplateItem) => void
  /** Organization admins only: the template actions menu. */
  canManage?: boolean
}

export function TemplatesLibrary({ templates, onEdit, onDelete, onInstantiate, canManage = true }: TemplatesLibraryProps) {
  if (!templates || templates.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Crown className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold tracking-wide text-foreground">Templates</h3>
        <Badge variant="secondary" className="ml-1">{templates.length}</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => (
          <Card key={t._id} className="rounded-xl group">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="font-semibold text-sm text-foreground truncate">{t.name}</h4>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <Badge variant="outline" className="text-xs">{t.type ? t.type.charAt(0).toUpperCase() + t.type.slice(1) : 'Unit'}</Badge>
                    {t.cascade_to_sub_orgs && (
                      <Badge variant="outline" className="text-xs gap-1 border-primary/30 text-primary">
                        <Network className="h-3 w-3" /> Added to linked churches
                      </Badge>
                    )}
                    {t.inherited && (
                      <Badge variant="secondary" className="text-xs">
                        From {t.owner_org_name ?? 'parent church'}
                      </Badge>
                    )}
                  </div>
                </div>

                {canManage && !t.inherited && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" aria-label={`Actions for template ${t.name}`} className="h-8 w-8 -mr-1 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity rounded-full hover:bg-muted">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-xl border-border/50 shadow-soft p-1">
                      <DropdownMenuItem onClick={() => onInstantiate(t)} className="cursor-pointer rounded-lg"><Plus className="h-4 w-4 mr-2" /> Create a unit from it</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onEdit(t)} className="cursor-pointer rounded-lg"><Edit className="h-4 w-4 mr-2" /> Edit</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDelete(t._id)} className="text-destructive cursor-pointer rounded-lg focus:bg-destructive/10"><Trash2 className="h-4 w-4 mr-2" /> Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {t.description && (
                <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{t.description}</p>
              )}
              <p className="text-xs text-muted-foreground mt-3 pt-2 border-t border-border/40">
                {t.instance_count ?? 0} {(t.instance_count ?? 0) === 1 ? 'unit' : 'units'} from this template
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
