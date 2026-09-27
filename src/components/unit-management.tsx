'use client'

import React, { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Building2,
  Plus,
  Crown,
  Layers,
  Search,
  Grid3X3,
  List,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useUserRole } from '@/hooks/use-user-role'
import { useToast } from '@/hooks/use-toast'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'

// Extracted Components
import { OrganizationOverview } from './unit-management/organization-overview'
import { SearchAndFilters } from './unit-management/search-and-filters'
import { OrganizationHierarchy } from './unit-management/organization-hierarchy'
import { CreateUnitDialog } from './unit-management/create-unit-dialog'
import { EditUnitDialog } from './unit-management/edit-unit-dialog'
import { CreateTemplateDialog, type TemplateFormData } from './unit-management/create-template-dialog'
import { TemplatesLibrary } from './unit-management/templates-library'
import { OverrideUnitDialog } from './unit-management/override-unit-dialog'
import { MergeUnitDialog } from './unit-management/merge-unit-dialog'
import type { Id } from '../../convex/_generated/dataModel'

export function UnitManagement() {
  const { isAdmin } = useUserRole()
  const { toast } = useToast()

  // State
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [filterType, setFilterType] = useState<'all' | 'administrative' | 'functional' | 'geographic'>('all')
  const [filterInheritance, setFilterInheritance] = useState<'all' | 'direct' | 'inherited' | 'template'>('all')

  // Dialog states
  const [createUnitDialogOpen, setCreateUnitDialogOpen] = useState(false)
  const [editUnitDialogOpen, setEditUnitDialogOpen] = useState(false)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null)
  const [targetUnitId, setTargetUnitId] = useState<string | null>(null)
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null)
  const [overrideUnit, setOverrideUnit] = useState<any | null>(null)
  const [mergeSource, setMergeSource] = useState<any | null>(null)

  // Tracks an in-flight create/update so the dialogs can show a spinner and
  // disable their submit buttons.
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Convex Queries & Mutations
  const chartData = useQuery(api.organizations.getChartData, {});
  const orgId = chartData?.organization?._id
  const templates = useQuery(
    api.unit_templates.list,
    orgId ? { organization_id: orgId } : "skip",
  ) || []
  const createUnitMutation = useMutation(api.units.create);
  const updateUnitMutation = useMutation(api.units.update);
  const createTemplateMutation = useMutation(api.unit_templates.create);
  const updateTemplateMutation = useMutation(api.unit_templates.update);
  const removeTemplateMutation = useMutation(api.unit_templates.remove);
  const instantiateTemplateMutation = useMutation(api.unit_templates.instantiate);
  const overrideMutation = useMutation(api.units.overrideFromTemplate);
  const resetMutation = useMutation(api.units.resetToTemplate);
  const mergeMutation = useMutation(api.units.merge);

  const handleCreateUnit = async (data: any) => {
    if (!chartData?.organization) return;
    setIsSubmitting(true);
    try {
      await createUnitMutation({
        name: data.name,
        description: data.description,
        organization_id: chartData.organization._id,
        parent_unit_id: data.unitId === "none" ? undefined : data.unitId,
        active: true,
        type: data.type,
        category: data.category,
        leader_id: data.leader_id,
      });
      toast({ title: "Unit created" });
      setCreateUnitDialogOpen(false);
      setSelectedUnitId(null);
    } catch (error: any) {
      toast({ title: "Couldn't create the unit", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleUpdateUnit = async (id: string, data: any) => {
    setIsSubmitting(true);
    try {
      await updateUnitMutation({
        id: id as any,
        updates: {
          name: data.name,
          description: data.description,
          // null means "clear": top level, or no leader. undefined would be
          // dropped in transit and leave the old value in place.
          parent_unit_id: data.unit_id === "" || data.unit_id === "none" ? null : data.unit_id,
          type: data.type,
          category: data.category,
          leader_id: data.leader_id || null,
        }
      });
      toast({ title: "Unit updated" });
      setEditUnitDialogOpen(false);
    } catch (error: any) {
      toast({ title: "Couldn't update the unit", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleSaveTemplate = async (data: TemplateFormData) => {
    if (!orgId) return;
    setIsSubmitting(true);
    try {
      if (editingTemplate) {
        await updateTemplateMutation({
          id: editingTemplate._id as Id<"unit_templates">,
          updates: data,
        });
        toast({ title: "Template updated" });
      } else {
        await createTemplateMutation({ organization_id: orgId, ...data });
        toast({ title: "Template created" });
      }
      setTemplateDialogOpen(false);
      setEditingTemplate(null);
    } catch (error: any) {
      toast({ title: "Couldn't save the template", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm("Delete this template? Units created from it become independent (they keep their members and data).")) return;
    try {
      await removeTemplateMutation({ id: templateId as Id<"unit_templates"> });
      toast({ title: "Template deleted", description: "Its units are now independent." });
    } catch (error: any) {
      toast({ title: "Couldn't delete the template", description: error.message, variant: "destructive" });
    }
  }

  const handleInstantiate = async (template: any) => {
    if (!orgId) return;
    try {
      await instantiateTemplateMutation({
        template_id: template._id as Id<"unit_templates">,
        organization_id: orgId,
      });
      toast({ title: `${template.name} created from template` });
    } catch (error: any) {
      toast({ title: "Couldn't create the unit", description: error.message, variant: "destructive" });
    }
  }

  const handleOverride = async (data: { name: string; description: string }) => {
    if (!overrideUnit) return;
    setIsSubmitting(true);
    try {
      await overrideMutation({
        unit_id: overrideUnit._id as Id<"units">,
        name: data.name,
        description: data.description,
      });
      toast({ title: "Changes saved", description: "This unit now differs from its template." });
      setOverrideUnit(null);
    } catch (error: any) {
      toast({ title: "Couldn't save your changes", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleReset = async (unitId: string) => {
    if (!confirm("Reset this unit to its template values? Local changes will be lost.")) return;
    try {
      await resetMutation({ unit_id: unitId as Id<"units"> });
      toast({ title: "Unit reset", description: "It matches its template again." });
    } catch (error: any) {
      toast({ title: "Couldn't reset the unit", description: error.message, variant: "destructive" });
    }
  }

  const handleMerge = async (sourceId: string, targetId: string) => {
    setIsSubmitting(true);
    try {
      await mergeMutation({ source_id: sourceId as Id<"units">, target_id: targetId as Id<"units"> });
      toast({ title: "Units merged" });
      setMergeSource(null);
    } catch (error: any) {
      toast({ title: "Couldn't merge the units", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  // The unit being edited, and the set of units that may be its parent —
  // excludes itself and its descendants (using the materialized path) so the
  // dropdown can't create a cycle.
  const editingUnit = chartData?.units?.find((u: any) => u._id === targetUnitId) || null
  const editableParents = useMemo(() => {
    const units = (chartData?.units as any[]) || []
    if (!editingUnit) return units
    return units.filter((u: any) => {
      if (u._id === editingUnit._id) return false
      if (editingUnit.path && u.path?.startsWith(editingUnit.path + '/')) return false
      return true
    })
  }, [chartData?.units, editingUnit])

  if (!chartData) {
    return <div className="p-8 text-center text-sm text-muted-foreground animate-pulse">Loading units…</div>
  }

  // Transform chartData to match what sub-components expect if necessary
  // Or update sub-components to use Convex data model

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Units</h2>
          <p className="text-sm text-muted-foreground">
            Departments, zones and groups, and who leads each.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="default" className="shadow-soft hover:shadow-lg transition-all rounded-lg">
                  <Plus className="h-4 w-4 mr-2" />
                  Create
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-xl border-border/50 shadow-soft">
                <DropdownMenuLabel className="font-semibold">Create</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuItem onClick={() => setCreateUnitDialogOpen(true)}>
                  <Layers className="h-4 w-4 mr-2" />
                  Unit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setEditingTemplate(null); setTemplateDialogOpen(true); }}>
                  <Crown className="h-4 w-4 mr-2" />
                  Template
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <SearchAndFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        filterType={filterType}
        onFilterTypeChange={setFilterType}
        filterInheritance={filterInheritance}
        onFilterInheritanceChange={setFilterInheritance}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      <OrganizationOverview organization={chartData as any} />

      <TemplatesLibrary
        templates={templates as any}
        onEdit={(t) => { setEditingTemplate(t); setTemplateDialogOpen(true); }}
        onDelete={handleDeleteTemplate}
        onInstantiate={handleInstantiate}
        canManage={isAdmin}
      />

      <OrganizationHierarchy
        organization={chartData as any}
        viewMode={viewMode}
        searchTerm={searchTerm}
        filterType={filterType}
        filterInheritance={filterInheritance}
        onInheritTemplates={() => { }}
        onCreateUnit={(unitId) => {
          setSelectedUnitId(unitId);
          setCreateUnitDialogOpen(true);
        }}
        onEditUnit={(unitId) => {
          setTargetUnitId(unitId);
          setEditUnitDialogOpen(true);
        }}
        onOverrideUnit={(unitId) => {
          const u = chartData?.units?.find((x: any) => x._id === unitId) || null;
          setOverrideUnit(u);
        }}
        onResetUnit={handleReset}
        onMergeUnit={(unitId) => {
          const u = chartData?.units?.find((x: any) => x._id === unitId) || null;
          setMergeSource(u);
        }}
        canManage={isAdmin}
      />

      <CreateUnitDialog
        open={createUnitDialogOpen}
        onOpenChange={(o) => {
          setCreateUnitDialogOpen(o);
          if (!o) setSelectedUnitId(null);
        }}
        availableUnits={chartData.units as any}
        onCreateUnit={handleCreateUnit}
        creating={isSubmitting}
        defaultParentId={selectedUnitId}
      />

      <EditUnitDialog
        open={editUnitDialogOpen}
        onOpenChange={setEditUnitDialogOpen}
        unit={editingUnit}
        availableUnits={editableParents as any}
        onUpdateUnit={handleUpdateUnit}
        updating={isSubmitting}
      />

      <CreateTemplateDialog
        open={templateDialogOpen}
        onOpenChange={(o) => {
          setTemplateDialogOpen(o);
          if (!o) setEditingTemplate(null);
        }}
        onSubmit={handleSaveTemplate}
        saving={isSubmitting}
        template={editingTemplate}
      />

      <OverrideUnitDialog
        open={!!overrideUnit}
        onOpenChange={(o) => { if (!o) setOverrideUnit(null); }}
        selectedUnit={overrideUnit ? { id: overrideUnit._id, name: overrideUnit.name, description: overrideUnit.description, unit_id: overrideUnit._id } : null}
        onOverrideUnit={handleOverride}
        overriding={isSubmitting}
      />

      <MergeUnitDialog
        open={!!mergeSource}
        onOpenChange={(o) => { if (!o) setMergeSource(null); }}
        source={mergeSource ? { _id: mergeSource._id, name: mergeSource.name } : null}
        units={(chartData?.units as any) || []}
        onMerge={handleMerge}
        merging={isSubmitting}
      />
    </div>
  )
}
