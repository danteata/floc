'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import {
    Building2,
    Settings,
    BarChart3,
    Layout,
} from 'lucide-react'
import { UnitManagement } from '@/components/unit-management'
import { OrganizationChart } from '@/components/organization-chart'
import { SettingsDialog } from '@/components/settings-dialog'
import { EventTypesManagement } from '@/components/event-types-management'
import { OrganizationLinks } from '@/components/organization-links'
import { LayoutWrapper } from '@/components/layout-wrapper'
import { useUserRole } from '@/hooks/use-user-role'
import { PageHeader } from '@/components/ui/page-header'
import { NoAccess } from "@/components/ui/no-access"
import { LoadingState } from "@/components/ui/loading-state"

export default function OrganizationPage() {
    const { isAdmin, role, isLoading: roleLoading } = useUserRole()
    const [activeTab, setActiveTab] = useState('units')
    const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)

    const hasAccess = isAdmin ||
        role === 'organization_admin' ||
        role === 'division_admin' ||
        role === 'unit_admin'

    if (roleLoading) return <LayoutWrapper><LoadingState message="Checking your access…" /></LayoutWrapper>
    if (!hasAccess) {
        return (
            <LayoutWrapper>
                <div className="container py-10">
                    <NoAccess what="manage your church's structure" who="organization and unit leaders" />
                </div>
            </LayoutWrapper>
        )
    }

    return (
        <LayoutWrapper>
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <PageHeader
                    title="Organization"
                    description="How your church is structured: units, leaders and event types."
                    actions={<>
                        <Button
                            className="bg-primary text-primary-foreground shadow-soft hover:shadow-soft-lg transition-all rounded-lg"
                            onClick={() => setSettingsDialogOpen(true)}
                        >
                            <Settings className="h-4 w-4 mr-2" />
                            Church settings
                        </Button>
                    </>}
                />

                {/* Tabs: scroll sideways on phones rather than clip */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
                    <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
                    <TabsList className="bg-muted/50 p-1 rounded-xl w-max inline-flex">
                        <TabsTrigger
                            value="units"
                            className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 md:px-6 transition-all"
                        >
                            <Layout className="h-4 w-4 mr-2" />
                            Units
                        </TabsTrigger>
                        <TabsTrigger
                            value="chart"
                            className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 md:px-6 transition-all"
                        >
                            <BarChart3 className="h-4 w-4 mr-2" />
                            Org chart
                        </TabsTrigger>
                        <TabsTrigger
                            value="event-types"
                            className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 md:px-6 transition-all"
                        >
                            <Settings className="h-4 w-4 mr-2" />
                            Event types
                        </TabsTrigger>
                        <TabsTrigger
                            value="org-links"
                            className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 md:px-6 transition-all"
                        >
                            <Building2 className="h-4 w-4 mr-2" />
                            Linked churches
                        </TabsTrigger>
                    </TabsList>
                    </div>

                    <TabsContent value="units" className="animate-in fade-in duration-500">
                        <div className="rounded-xl overflow-hidden shadow-soft border border-border/50 bg-card p-4 md:p-6">
                            <UnitManagement />
                        </div>
                    </TabsContent>

                    <TabsContent value="chart" className="animate-in fade-in duration-500">
                        <div className="rounded-xl overflow-hidden shadow-soft border border-border/50 bg-card p-4 md:p-6">
                            <OrganizationChart />
                        </div>
                    </TabsContent>

                    <TabsContent value="event-types" className="animate-in fade-in duration-500">
                        <div className="rounded-xl overflow-hidden shadow-soft border border-border/50 bg-card p-4 md:p-6">
                            <EventTypesManagement />
                        </div>
                    </TabsContent>

                    <TabsContent value="org-links" className="animate-in fade-in duration-500">
                        <div className="rounded-xl overflow-hidden shadow-soft border border-border/50 bg-card p-4 md:p-6">
                            <OrganizationLinks />
                        </div>
                    </TabsContent>
                </Tabs>

                {/* How-to notes */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <InfoBlock
                        title="Working with units"
                        items={[
                            "Add a unit, or a sub-unit beneath an existing one, from Create",
                            "Give each unit a leader so they can look after its members",
                            "Save a template for units you set up often, then create from it",
                            "Merge two units when they have become one"
                        ]}
                    />
                    <InfoBlock
                        title="Using the org chart"
                        items={[
                            "Drag a unit onto another to move it beneath that unit",
                            "Collapse a branch to focus on one part of the church",
                            "Zoom in and out, or fit the whole chart to the screen",
                            "Show details to see how many members each unit has"
                        ]}
                    />
                </div>

                <SettingsDialog
                    open={settingsDialogOpen}
                    onOpenChange={setSettingsDialogOpen}
                />
            </div>
        </LayoutWrapper>
    )
}

function InfoBlock({ title, items }: { title: string, items: string[] }) {
    return (
        <div className="p-6 rounded-xl bg-card ring-1 ring-foreground/10 flex flex-col gap-4">
            <h3 className="text-base font-semibold">{title}</h3>
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground marker:text-muted-foreground/60">
                {items.map((item, i) => (
                    <li key={i}>{item}</li>
                ))}
            </ul>
        </div>
    )
}
