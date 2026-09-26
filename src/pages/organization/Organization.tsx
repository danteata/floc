'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import {
    Building2,
    Settings,
    BarChart3,
    Shield,
    Layout,
    ArrowUpRight
} from 'lucide-react'
import { UnitManagement } from '@/components/unit-management'
import { OrganizationChart } from '@/components/organization-chart'
import { SettingsDialog } from '@/components/settings-dialog'
import { EventTypesManagement } from '@/components/event-types-management'
import { OrganizationLinks } from '@/components/organization-links'
import { LayoutWrapper } from '@/components/layout-wrapper'
import { useUserRole } from '@/hooks/use-user-role'
import { PageHeader } from '@/components/ui/page-header'

export default function OrganizationPage() {
    const { isAdmin, role } = useUserRole()
    const [activeTab, setActiveTab] = useState('units')
    const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)

    const hasAccess = isAdmin ||
        role === 'organization_admin' ||
        role === 'division_admin' ||
        role === 'unit_admin'

    if (!hasAccess) {
        return (
            <LayoutWrapper>
                <div className="container p-20 flex items-center justify-center">
                    <div className="text-center space-y-6 max-w-md p-10 border border-border bg-card shadow-soft-lg rounded-xl">
                        <div className="mx-auto h-20 w-20 bg-destructive/10 text-destructive rounded-full flex items-center justify-center">
                            <Shield className="h-10 w-10" />
                        </div>
                        <h2 className="text-2xl tracking-tight">Access Denied</h2>
                        <p className="font-medium text-muted-foreground">
                            Your security clearance is insufficient for organization architecture protocols.
                        </p>
                        <Button variant="outline" className="shadow-sm hover:shadow-md rounded-lg" onClick={() => window.history.back()}>
                            Return to Dashboard
                        </Button>
                    </div>
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

                {/* Operational Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
                    <TabsList className="bg-muted/50 p-1 rounded-xl w-full md:w-auto inline-flex">
                        <TabsTrigger
                            value="units"
                            className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-6 transition-all"
                        >
                            <Layout className="h-4 w-4 mr-2" />
                            Unit Management
                        </TabsTrigger>
                        <TabsTrigger
                            value="chart"
                            className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-6 transition-all"
                        >
                            <BarChart3 className="h-4 w-4 mr-2" />
                            Hierarchy Visualizer
                        </TabsTrigger>
                        <TabsTrigger
                            value="event-types"
                            className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-6 transition-all"
                        >
                            <Settings className="h-4 w-4 mr-2" />
                            Event Types
                        </TabsTrigger>
                        <TabsTrigger
                            value="org-links"
                            className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-6 transition-all"
                        >
                            <Building2 className="h-4 w-4 mr-2" />
                            Linked Orgs
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="units" className="animate-in fade-in duration-500">
                        <div className="rounded-xl overflow-hidden shadow-soft border border-border/50 bg-card p-6">
                            <UnitManagement />
                        </div>
                    </TabsContent>

                    <TabsContent value="chart" className="animate-in fade-in duration-500">
                        <div className="rounded-xl overflow-hidden shadow-soft border border-border/50 bg-card p-6">
                            <OrganizationChart />
                        </div>
                    </TabsContent>

                    <TabsContent value="event-types" className="animate-in fade-in duration-500">
                        <div className="rounded-xl overflow-hidden shadow-soft border border-border/50 bg-card p-6">
                            <EventTypesManagement />
                        </div>
                    </TabsContent>

                    <TabsContent value="org-links" className="animate-in fade-in duration-500">
                        <div className="rounded-xl overflow-hidden shadow-soft border border-border/50 bg-card p-6">
                            <OrganizationLinks />
                        </div>
                    </TabsContent>
                </Tabs>

                {/* Knowledge Base Area */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <InfoBlock
                        title="Unit Management"
                        items={[
                            "Configure and relocate operational units between sector divisions",
                            "Batch execute terminology updates and structural changes",
                            "Monitor personnel distribution across the entire hierarchy",
                            "Perform real-time architectural validation of unit status"
                        ]}
                    />
                    <InfoBlock
                        title="Strategic Visualization"
                        items={[
                            "Execute drag-and-drop structural updates via the Visualizer",
                            "Isolate specific branches for granular personnel review",
                            "Track organizational growth through integrated trend data",
                            "Sync high-level terminology with global application states"
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
        <div className="p-6 rounded-xl border border-border/50 bg-card shadow-sm hover:shadow-md transition-all flex flex-col gap-4">
            <h3 className="text-lg flex items-center gap-3">
                <div className="h-1.5 w-8 bg-primary rounded-full" /> {title}
            </h3>
            <ul className="space-y-3">
                {items.map((item, i) => (
                    <li key={i} className="flex items-start gap-3 group">
                        <div className="h-5 w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                            <ArrowUpRight className="h-3 w-3" />
                        </div>
                        <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">{item}</span>
                    </li>
                ))}
            </ul>
        </div>
    )
}
