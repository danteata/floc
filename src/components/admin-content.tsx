
import { useState } from "react"
import { Plus, Settings, Trash2, Edit, RefreshCw, Shield, Map, Zap, Database, Users, Building, Layers } from "lucide-react"
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
import { useOrganization } from "@/hooks/use-organization"

export function AdminContent() {
  const { organization } = useOrganization()
  const allUnits = useQuery(api.units.listByOrg, organization?._id ? { organization_id: organization._id } : "skip") || []
  const units = allUnits

  const isLoading = allUnits === undefined

  // Convex Mutations
  const updateUnitMutation = useMutation(api.units.update)
  const removeUnitMutation = useMutation(api.units.remove)

  const [isUnitDialogOpen, setIsUnitDialogOpen] = useState(false)
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false)
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null)
  const [unitTypeFilter, setUnitTypeFilter] = useState<'all' | 'functional' | 'geographic' | 'administrative'>('all')

  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean
    type: 'unit'
    item: Unit | null
  }>({ open: false, type: 'unit', item: null })

  // Filter units based on selected type
  const filteredUnits = unitTypeFilter === 'all'
    ? units
    : units.filter(unit => unit.type === unitTypeFilter)

  const handleDeleteUnit = async (unit: Unit) => {
    try {
      await removeUnitMutation({ id: unit._id as any })
      toast.success(`${unit.name} removed successfully`)
      setDeleteDialog({ open: false, type: 'unit', item: null })
    } catch (error) {
      console.error("Error deleting unit:", error)
      toast.error(`Critical failure removing unit`)
    }
  }

  const handleToggleUnitStatus = async (unit: Unit) => {
    try {
      await updateUnitMutation({
        id: unit._id as any,
        updates: { active: !unit.active }
      })
      toast.success(`Status updated for ${unit.name}`)
    } catch (error) {
      console.error("Error updating unit:", error)
      toast.error("Failed to toggle status")
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
    return <LoadingState message="Synchronizing configuration..." />
  }

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-500">
      <PageHeader
        title="Administration"
        description="Your church's units, operations, settings and features."
        actions={
          <>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 px-4 py-1.5 rounded-full text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2 animate-pulse"></span>
              System Active
            </Badge>
          </>
        }
      />

      {/* Tabs */}
      <Tabs defaultValue="units" className="w-full">
        <TabsList className="bg-muted/50 p-1 rounded-xl w-full md:w-auto inline-flex overflow-x-auto">
          <TabsTrigger value="units" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-4">
            Organizational Units
          </TabsTrigger>
          <TabsTrigger value="events" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-4">
            Operations
          </TabsTrigger>
          <TabsTrigger value="settings" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-4">
            System Core
          </TabsTrigger>
          <TabsTrigger value="flags" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-4">
            Feature Flags
          </TabsTrigger>
        </TabsList>

        <TabsContent value="units" className="mt-6 w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
          <Card className="glass-card border-border/50 shadow-soft rounded-xl overflow-hidden">
            <CardHeader className="border-b border-border/50 bg-muted/20 px-6 py-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
                <div className="space-y-1">
                  <CardTitle className="text-xl tracking-tight text-foreground">Organizational Units</CardTitle>
                  <CardDescription>
                    Manage all units including functional teams, geographic locations, and administrative divisions
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <select
                    value={unitTypeFilter}
                    onChange={(e) => setUnitTypeFilter(e.target.value as any)}
                    className="px-3 py-2 border border-border rounded-lg bg-background text-sm"
                  >
                    <option value="all">All Types</option>
                    <option value="functional">Functional</option>
                    <option value="geographic">Geographic</option>
                    <option value="administrative">Administrative</option>
                    <option value="organization">Organization</option>
                  </select>
                  <Button
                    onClick={() => setIsUnitDialogOpen(true)}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm rounded-lg"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add New Unit
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
                        <Badge variant="secondary" className="bg-muted text-muted-foreground font-normal rounded-md text-xs">
                          {(unit as any).leader_name || "Unassigned"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`cursor-pointer px-2.5 py-0.5 rounded-full border text-xs ${unit.active ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-muted text-muted-foreground border-border"}`}
                          onClick={() => handleToggleUnitStatus(unit)}
                        >
                          {unit.active ? "Active" : "Standby"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
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
                              ? "No organizational units found"
                              : `No ${unitTypeFilter} units found`
                          }
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
          <div className="glass-card border-border/50 shadow-soft rounded-xl overflow-hidden bg-card/50">
            <div className="border-b border-border/50 bg-muted/20 px-6 py-4">
              <h2 className="text-xl tracking-tight text-foreground">Operational Protocols</h2>
              <p className="text-sm text-muted-foreground mt-1">Configure systemic event parameters and reporting categories</p>
            </div>
            <div className="p-6">
              <EventTypesManagement />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="mt-6 w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
          <Card className="glass-card border-border/50 shadow-soft rounded-xl overflow-hidden">
            <CardHeader className="border-b border-border/50 bg-muted/20 px-6 py-4">
              <div className="space-y-1">
                <CardTitle className="text-xl tracking-tight">System Core Settings</CardTitle>
                <CardDescription>
                  Configure system-wide parameters and terminology overrides
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-12">
              <div className="flex flex-col items-center justify-center text-center space-y-6">
                <div className="p-4 bg-muted/50 rounded-full border border-border/50">
                  <Settings className="h-10 w-10 text-muted-foreground" />
                </div>
                <div className="space-y-2 max-w-md">
                  <h3 className="text-lg font-semibold tracking-tight">System Overrides</h3>
                  <p className="text-sm text-muted-foreground">
                    Modify global terminology patterns, application behavior, and organizational metadata. Ensure all changes comply with regional reporting standards.
                  </p>
                </div>
                <Button
                  onClick={() => setIsSettingsDialogOpen(true)}
                  className="h-12 px-8 shadow-md hover:shadow-lg transition-all rounded-lg gap-2"
                >
                  <Zap className="h-4 w-4" />
                  Initiate Override
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
        title="Confirm Deletion"
        description={`Are you sure you want to delete the unit "${deleteDialog.item?.name}"? All associated data will be removed. This action cannot be undone.`}
        onConfirm={() => {
          if (deleteDialog.type === 'unit' && deleteDialog.item) {
            handleDeleteUnit(deleteDialog.item)
          }
        }}
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
