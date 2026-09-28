
import { useMemo, useState } from "react"
import { Plus, Settings, Trash2, Edit, RefreshCw, Shield, Map, Database, Building, Layers } from "lucide-react"
import { useQuery, useMutation } from "convex/react"
import { api } from "../../convex/_generated/api"
import type { Unit } from "@/types/database"

import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FeatureFlagsPanel } from "@/components/feature-flags-panel"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { SettingsDialog } from "@/components/settings-dialog"
import { EventTypesManagement } from "@/components/event-types-management"
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { toast } from "sonner"
import { errorMessage } from "@/lib/errors"
import { useOrganization } from "@/hooks/use-organization"
import { CreateUnitDialog } from "@/components/unit-management/create-unit-dialog"
import { EditUnitDialog } from "@/components/unit-management/edit-unit-dialog"
import type { Id } from "../../convex/_generated/dataModel"

/** Leader's name, which units.listByOrg adds to each row from its leader_id. */
const leaderName = (unit: object): string | undefined => (unit as { leader_name?: string | null }).leader_name ?? undefined

export function AdminContent() {
  const { organization } = useOrganization()
  const allUnits = useQuery(api.units.listByOrg, organization?._id ? { organization_id: organization._id } : "skip") || []
  const units = allUnits

  const isLoading = allUnits === undefined

  // Convex Mutations
  const createUnitMutation = useMutation(api.units.create)
  const updateUnitMutation = useMutation(api.units.update)
  const removeUnitMutation = useMutation(api.units.remove)
  const [isSavingUnit, setIsSavingUnit] = useState(false)

  const [isUnitDialogOpen, setIsUnitDialogOpen] = useState(false)
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false)
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null)
  const [unitTypeFilter, setUnitTypeFilter] = useState<'all' | 'functional' | 'geographic' | 'administrative'>('all')

  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean
    type: 'unit'
    item: Unit | null
  }>({ open: false, type: 'unit', item: null })

  // Filter units based on selected type. "Functional" takes in ministry
  // units too, as it does on the Organization page.
  const filteredUnits = unitTypeFilter === 'all'
    ? units
    : units.filter(unit => unit.type === unitTypeFilter || (unitTypeFilter === 'functional' && unit.type === 'ministry'))

  const closeUnitDialog = (open: boolean) => {
    setIsUnitDialogOpen(open)
    if (!open) setEditingUnit(null)
  }

  // The same create and edit dialogs the Organization page uses.
  const handleCreateUnit = async (data: {
    name: string
    description: string
    type: string
    category: string
    unitId?: string
    leader_id?: string
  }) => {
    if (!organization?._id) return
    setIsSavingUnit(true)
    try {
      await createUnitMutation({
        name: data.name,
        description: data.description,
        organization_id: organization._id,
        parent_unit_id: data.unitId ? (data.unitId as Id<"units">) : undefined,
        active: true,
        type: data.type,
        category: data.category,
        leader_id: data.leader_id ? (data.leader_id as Id<"members">) : undefined,
      })
      toast.success("Unit created")
      closeUnitDialog(false)
    } catch (error) {
      toast.error("Couldn't create the unit", { description: error instanceof Error ? error.message : undefined })
      throw error
    } finally {
      setIsSavingUnit(false)
    }
  }

  const handleUpdateUnit = async (id: string, data: {
    name: string
    description: string
    type: string
    category: string
    unit_id: string
    leader_id?: string
  }) => {
    setIsSavingUnit(true)
    try {
      await updateUnitMutation({
        id: id as Id<"units">,
        updates: {
          name: data.name,
          description: data.description,
          // null clears: top level, or no leader.
          parent_unit_id: data.unit_id && data.unit_id !== 'none' ? (data.unit_id as Id<"units">) : null,
          type: data.type,
          category: data.category,
          leader_id: data.leader_id ? (data.leader_id as Id<"members">) : null,
        },
      })
      toast.success("Unit updated")
      closeUnitDialog(false)
    } catch (error) {
      toast.error("Couldn't update the unit", { description: error instanceof Error ? error.message : undefined })
      throw error
    } finally {
      setIsSavingUnit(false)
    }
  }

  // A unit can't be moved under itself or one of its own sub-units.
  const editableParents = useMemo(() => {
    if (!editingUnit) return units
    const path = (editingUnit as { path?: string }).path
    return units.filter((u) => u._id !== editingUnit._id && !(path && u.path?.startsWith(path + '/')))
  }, [units, editingUnit])

  const deletingHasChildren = !!deleteDialog.item && units.some((u) => u.parent_unit_id === deleteDialog.item?._id)

  const handleDeleteUnit = async (unit: Unit) => {
    try {
      await removeUnitMutation({ id: unit._id as any })
      toast.success(`${unit.name} deleted`)
      setDeleteDialog({ open: false, type: 'unit', item: null })
    } catch (error) {
      console.error("Error deleting unit:", error)
      toast.error("Couldn't delete the unit", { description: errorMessage(error) })
    }
  }

  const handleToggleUnitStatus = async (unit: Unit) => {
    try {
      await updateUnitMutation({
        id: unit._id as any,
        updates: { active: !unit.active }
      })
      toast.success(`${unit.name} is now ${unit.active ? "inactive" : "active"}`)
    } catch (error) {
      console.error("Error updating unit:", error)
      toast.error("Couldn't change the unit's status", { description: error instanceof Error ? error.message : undefined })
    }
  }

  const getUnitTypeLabel = (type: string) => {
    switch (type) {
      case 'functional': return 'Functional'
      case 'geographic': return 'Geographic'
      case 'administrative': return 'Administrative'
      case 'organization': return 'Organization'
      default: return type.charAt(0).toUpperCase() + type.slice(1)
    }
  }

  const getUnitTypeIcon = (type: string) => {
    switch (type) {
      case 'functional': return <Layers className="h-4 w-4" />
      case 'geographic': return <Map className="h-4 w-4" />
      case 'administrative': return <Building className="h-4 w-4" />
      default: return <Shield className="h-4 w-4" />
    }
  }

  const Loader2 = ({ className }: { className?: string }) => (
    <RefreshCw className={cn("animate-spin", className)} />
  )

  if (isLoading) {
    return <LoadingState message="Loading…" />
  }

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-500">
      <PageHeader
        title="Administration"
        description="Your church's units, event types, settings and features."
      />

      {/* Tabs */}
      <Tabs defaultValue="units" className="w-full">
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <TabsList className="bg-muted/50 p-1 rounded-xl w-max inline-flex">
          <TabsTrigger value="units" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-4">
            Units
          </TabsTrigger>
          <TabsTrigger value="events" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-4">
            Event types
          </TabsTrigger>
          <TabsTrigger value="settings" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-4">
            Settings
          </TabsTrigger>
          <TabsTrigger value="flags" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-4">
            Features
          </TabsTrigger>
        </TabsList>
        </div>

        <TabsContent value="units" className="mt-6 w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
          <Card className="rounded-xl overflow-hidden">
            <CardHeader className="border-b border-border/50 bg-muted/20 px-6 py-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
                <div className="space-y-1">
                  <CardTitle className="text-lg font-semibold text-foreground">Units</CardTitle>
                  <CardDescription>
                    Every unit in your church: ministries and teams, zones and locations, and administrative groups.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={unitTypeFilter}
                    onChange={(e) => setUnitTypeFilter(e.target.value as any)}
                    className="px-3 py-2 border border-border rounded-lg bg-background text-sm"
                  >
                    <option value="all">All types</option>
                    <option value="functional">Functional</option>
                    <option value="geographic">Geographic</option>
                    <option value="administrative">Administrative</option>
                    <option value="organization">Organization</option>
                  </select>
                  <Button
                    onClick={() => { setEditingUnit(null); setIsUnitDialogOpen(true) }}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm rounded-lg"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    New unit
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border/50">
                    <TableHead className="py-4 pl-6">Name</TableHead>
                    <TableHead className="hidden sm:table-cell">Type</TableHead>
                    <TableHead className="hidden md:table-cell">Description</TableHead>
                    <TableHead className="hidden lg:table-cell">Leader</TableHead>
                    <TableHead className="font-medium">Status</TableHead>
                    <TableHead className="text-right pr-6 w-[150px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUnits.map((unit) => (
                    <TableRow key={unit._id} className="border-border/50 hover:bg-muted/30 transition-colors">
                      <TableCell className="font-medium py-4 pl-6 text-foreground">
                        <div className="flex items-center gap-2">
                          {getUnitTypeIcon(unit.type)}
                          {unit.name}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="outline" className="text-xs">
                          {getUnitTypeLabel(unit.type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {unit.description || "-"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {leaderName(unit) ? (
                          <span className="text-sm text-foreground">{leaderName(unit)}</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`cursor-pointer px-2.5 py-0.5 rounded-full border text-xs ${unit.active ? "bg-success/10 text-success-strong border-success/20" : "bg-muted text-muted-foreground border-border"}`}
                          onClick={() => handleToggleUnitStatus(unit)}
                        >
                          {unit.active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                            aria-label={`Edit ${unit.name}`}
                            onClick={() => {
                              setEditingUnit(unit as any)
                              setIsUnitDialogOpen(true)
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                            aria-label={`Delete ${unit.name}`}
                            onClick={() => setDeleteDialog({
                              open: true,
                              type: 'unit',
                              item: unit as any
                            })}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredUnits.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32">
                        <EmptyState
                          icon={Database}
                          title={
                            unitTypeFilter === 'all'
                              ? "No units yet"
                              : `No ${unitTypeFilter} units`
                          }
                          description={unitTypeFilter === 'all' ? "Add your first unit with New unit." : "Choose another type to see more units."}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Event Types Tab */}
        <TabsContent value="events" className="mt-6 w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="rounded-xl overflow-hidden bg-card ring-1 ring-foreground/10">
            <div className="p-2 md:p-4">
              <EventTypesManagement />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="mt-6 w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
          <Card className="rounded-xl overflow-hidden">
            <CardHeader className="border-b border-border/50 bg-muted/20 px-6 py-4">
              <div className="space-y-1">
                <CardTitle className="text-lg font-semibold">Church settings</CardTitle>
                <CardDescription>
                  Your church's details, the words used for your units, branding and AI settings.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-6 md:p-12">
              <div className="flex flex-col items-center justify-center text-center space-y-6">
                <Settings className="h-8 w-8 text-muted-foreground" />
                <div className="space-y-2 max-w-md">
                  <h3 className="text-base font-semibold">Change how Floc fits your church</h3>
                  <p className="text-sm text-muted-foreground">
                    Update your church's name and details, rename units to match the words your church uses, and set your branding.
                  </p>
                </div>
                <Button
                  onClick={() => setIsSettingsDialogOpen(true)}
                  className="rounded-lg gap-2"
                >
                  <Settings className="h-4 w-4" />
                  Open church settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="flags" className="mt-6 w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
          <FeatureFlagsPanel />
        </TabsContent>
      </Tabs>

      <DeleteConfirmDialog
        open={deleteDialog.open}
        onOpenChange={(open: boolean) => setDeleteDialog({ ...deleteDialog, open })}
        title="Delete this unit?"
        description={deletingHasChildren
          ? `"${deleteDialog.item?.name}" has sub-units, so it can't be deleted yet. Move or delete its sub-units first.`
          : `"${deleteDialog.item?.name}" will be deleted. Its members stay in the church but are taken out of this unit, and its leaders lose access to it. This can't be undone.`}
        onConfirm={() => {
          if (deleteDialog.type === 'unit' && deleteDialog.item) {
            handleDeleteUnit(deleteDialog.item)
          }
        }}
      />

      <CreateUnitDialog
        open={isUnitDialogOpen && !editingUnit}
        onOpenChange={closeUnitDialog}
        availableUnits={units}
        onCreateUnit={handleCreateUnit}
        creating={isSavingUnit}
      />

      <EditUnitDialog
        open={isUnitDialogOpen && !!editingUnit}
        onOpenChange={closeUnitDialog}
        unit={editingUnit ? { ...editingUnit, _id: String(editingUnit._id) } : null}
        availableUnits={editableParents}
        onUpdateUnit={handleUpdateUnit}
        updating={isSavingUnit}
      />

      <SettingsDialog
        open={isSettingsDialogOpen}
        onOpenChange={setIsSettingsDialogOpen}
      />
    </div>
  )
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
