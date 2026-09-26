'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    Users,
    DollarSign,
    Plus,
    ArrowUpRight,
    ArrowDownRight,
    Calendar,
    Target,
    Church
} from 'lucide-react'
import { ServiceFinancialSummary } from '@/types/database'
import { formatCurrency } from '@/lib/financial-utils'

interface ServiceSummaryWidgetProps {
    summaries: ServiceFinancialSummary[]
    onAddSummary?: () => void
    className?: string
}

export function ServiceSummaryWidget({
    summaries,
    onAddSummary,
    className = ''
}: ServiceSummaryWidgetProps) {
    const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'quarter'>('week')

    // Calculate current period totals
    const currentSummaries = summaries.filter(summary => {
        const summaryDate = new Date(summary.service_date)
        const now = new Date()

        switch (selectedPeriod) {
            case 'week':
                const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
                return summaryDate >= weekAgo
            case 'month':
                return summaryDate.getMonth() === now.getMonth() &&
                    summaryDate.getFullYear() === now.getFullYear()
            case 'quarter':
                const currentQuarter = Math.floor(now.getMonth() / 3)
                const summaryQuarter = Math.floor(summaryDate.getMonth() / 3)
                return summaryQuarter === currentQuarter &&
                    summaryDate.getFullYear() === now.getFullYear()
            default:
                return true
        }
    })

    // Calculate previous period totals for comparison
    const previousSummaries = summaries.filter(summary => {
        const summaryDate = new Date(summary.service_date)
        const now = new Date()

        switch (selectedPeriod) {
            case 'week':
                const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
                const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
                return summaryDate >= twoWeeksAgo && summaryDate < weekAgo
            case 'month':
                const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
                const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
                return summaryDate >= lastMonth && summaryDate < thisMonth
            case 'quarter':
                const lastQuarter = new Date(now.getFullYear(), now.getMonth() - 3, 1)
                const thisQuarter = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
                return summaryDate >= lastQuarter && summaryDate < thisQuarter
            default:
                return false
        }
    })

    // Aggregate current period data
    const currentTotals = currentSummaries.reduce((acc, summary) => ({
        totalAttendance: acc.totalAttendance + summary.total_attendance,
        totalTithePayers: acc.totalTithePayers + summary.tithe_payers,
        totalTithes: acc.totalTithes + summary.total_tithes,
        totalOfferings: acc.totalOfferings + summary.total_offerings,
        totalDonations: acc.totalDonations + summary.total_donations,
        totalSpecialOfferings: acc.totalSpecialOfferings + (summary.special_offerings || 0),
        serviceCount: acc.serviceCount + 1
    }), {
        totalAttendance: 0,
        totalTithePayers: 0,
        totalTithes: 0,
        totalOfferings: 0,
        totalDonations: 0,
        totalSpecialOfferings: 0,
        serviceCount: 0
    })

    // Aggregate previous period data
    const previousTotals = previousSummaries.reduce((acc, summary) => ({
        totalAttendance: acc.totalAttendance + summary.total_attendance,
        totalTithePayers: acc.totalTithePayers + summary.tithe_payers,
        totalTithes: acc.totalTithes + summary.total_tithes,
        totalOfferings: acc.totalOfferings + summary.total_offerings,
        totalDonations: acc.totalDonations + summary.total_donations,
        totalSpecialOfferings: acc.totalSpecialOfferings + (summary.special_offerings || 0),
        serviceCount: acc.serviceCount + 1
    }), {
        totalAttendance: 0,
        totalTithePayers: 0,
        totalTithes: 0,
        totalOfferings: 0,
        totalDonations: 0,
        totalSpecialOfferings: 0,
        serviceCount: 0
    })

    // Calculate percentage changes
    const attendanceChange = previousTotals.totalAttendance > 0
        ? ((currentTotals.totalAttendance - previousTotals.totalAttendance) / previousTotals.totalAttendance) * 100
        : 0

    const tithePayersChange = previousTotals.totalTithePayers > 0
        ? ((currentTotals.totalTithePayers - previousTotals.totalTithePayers) / previousTotals.totalTithePayers) * 100
        : 0

    const tithesChange = previousTotals.totalTithes > 0
        ? ((currentTotals.totalTithes - previousTotals.totalTithes) / previousTotals.totalTithes) * 100
        : 0

    const offeringsChange = previousTotals.totalOfferings > 0
        ? ((currentTotals.totalOfferings - previousTotals.totalOfferings) / previousTotals.totalOfferings) * 100
        : 0

    const totalIncome = currentTotals.totalTithes + currentTotals.totalOfferings + currentTotals.totalDonations + currentTotals.totalSpecialOfferings

    const getPeriodLabel = () => {
        const now = new Date()
        switch (selectedPeriod) {
            case 'week':
                return 'This Week'
            case 'month':
                return now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
            case 'quarter':
                const quarter = Math.floor(now.getMonth() / 3) + 1
                return `Q${quarter} ${now.getFullYear()}`
            default:
                return ''
        }
    }

    // Calculate averages per service
    const avgAttendance = currentTotals.serviceCount > 0 ? currentTotals.totalAttendance / currentTotals.serviceCount : 0
    const avgTithes = currentTotals.serviceCount > 0 ? currentTotals.totalTithes / currentTotals.serviceCount : 0
    const avgOfferings = currentTotals.serviceCount > 0 ? currentTotals.totalOfferings / currentTotals.serviceCount : 0

    return (
        <Card className={`${className} shadow-soft hover:shadow-soft-lg transition-all border-0`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b border-border/50">
                <div>
                    <CardTitle className="text-lg font-semibold flex items-center gap-2">
                        <Church className="h-5 w-5 text-primary" />
                        Service Financial Summary
                    </CardTitle>
                    <CardDescription>
                        {getPeriodLabel()} overview
                    </CardDescription>
                </div>
                <div className="flex items-center gap-3">
                    <Tabs value={selectedPeriod} onValueChange={(value) => setSelectedPeriod(value as any)}>
                        <TabsList className="bg-muted/50 border border-input/20">
                            <TabsTrigger value="week" className="text-xs">Week</TabsTrigger>
                            <TabsTrigger value="month" className="text-xs">Month</TabsTrigger>
                            <TabsTrigger value="quarter" className="text-xs">Quarter</TabsTrigger>
                        </TabsList>
                    </Tabs>
                    {onAddSummary && (
                        <Button size="sm" onClick={onAddSummary} className="shadow-sm">
                            <Plus className="h-4 w-4 mr-1" />
                            Add
                        </Button>
                    )}
                </div>
            </CardHeader>

            <CardContent className="space-y-6 pt-6">
                {/* Key Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Total Attendance */}
                    <div className="p-4 bg-card rounded-xl border border-border/50 shadow-sm hover:shadow-md transition-all group">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                    <Users className="h-4 w-4" />
                                </div>
                                <span className="text-sm text-muted-foreground">Total Attendance</span>
                            </div>
                            {attendanceChange !== 0 && (
                                <Badge variant={attendanceChange > 0 ? "success" : "destructive"} className="text-xs border-0">
                                    {attendanceChange > 0 ? (
                                        <ArrowUpRight className="h-3 w-3 mr-1" />
                                    ) : (
                                        <ArrowDownRight className="h-3 w-3 mr-1" />
                                    )}
                                    {Math.abs(attendanceChange).toFixed(1)}%
                                </Badge>
                            )}
                        </div>
                        <div className="text-2xl text-foreground">
                            {currentTotals.totalAttendance.toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                            Avg: {Math.round(avgAttendance)} per service
                        </div>
                    </div>

                    {/* Tithe Payers */}
                    <div className="p-4 bg-card rounded-xl border border-border/50 shadow-sm hover:shadow-md transition-all group">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <div className="p-2 rounded-lg bg-success/10 text-success group-hover:bg-success group-hover:text-success-foreground transition-colors">
                                    <Target className="h-4 w-4" />
                                </div>
                                <span className="text-sm text-muted-foreground">Tithe Payers</span>
                            </div>
                            {tithePayersChange !== 0 && (
                                <Badge variant={tithePayersChange > 0 ? "success" : "destructive"} className="text-xs border-0">
                                    {tithePayersChange > 0 ? (
                                        <ArrowUpRight className="h-3 w-3 mr-1" />
                                    ) : (
                                        <ArrowDownRight className="h-3 w-3 mr-1" />
                                    )}
                                    {Math.abs(tithePayersChange).toFixed(1)}%
                                </Badge>
                            )}
                        </div>
                        <div className="text-2xl text-foreground">
                            {currentTotals.totalTithePayers}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                            {currentTotals.totalAttendance > 0
                                ? `${((currentTotals.totalTithePayers / currentTotals.totalAttendance) * 100).toFixed(1)}% of attendance`
                                : '0% of attendance'
                            }
                        </div>
                    </div>
                </div>

                {/* Financial Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Total Tithes */}
                    <div className="p-4 bg-card rounded-xl border border-border/50 shadow-sm hover:shadow-md transition-all group">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <div className="p-2 rounded-lg bg-success/10 text-success group-hover:bg-success group-hover:text-success-foreground transition-colors">
                                    <DollarSign className="h-4 w-4" />
                                </div>
                                <span className="text-sm text-muted-foreground">Total Tithes</span>
                            </div>
                            {tithesChange !== 0 && (
                                <Badge variant={tithesChange > 0 ? "success" : "destructive"} className="text-xs border-0">
                                    {tithesChange > 0 ? (
                                        <ArrowUpRight className="h-3 w-3 mr-1" />
                                    ) : (
                                        <ArrowDownRight className="h-3 w-3 mr-1" />
                                    )}
                                    {Math.abs(tithesChange).toFixed(1)}%
                                </Badge>
                            )}
                        </div>
                        <div className="text-2xl text-success">
                            {formatCurrency(currentTotals.totalTithes)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                            Avg: {formatCurrency(avgTithes)} per service
                        </div>
                    </div>

                    {/* Total Offerings */}
                    <div className="p-4 bg-card rounded-xl border border-border/50 shadow-sm hover:shadow-md transition-all group">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <div className="p-2 rounded-lg bg-accent/10 text-accent-foreground group-hover:bg-accent group-hover:text-accent-foreground transition-colors">
                                    <Church className="h-4 w-4" />
                                </div>
                                <span className="text-sm text-muted-foreground">Total Offerings</span>
                            </div>
                            {offeringsChange !== 0 && (
                                <Badge variant={offeringsChange > 0 ? "success" : "destructive"} className="text-xs border-0">
                                    {offeringsChange > 0 ? (
                                        <ArrowUpRight className="h-3 w-3 mr-1" />
                                    ) : (
                                        <ArrowDownRight className="h-3 w-3 mr-1" />
                                    )}
                                    {Math.abs(offeringsChange).toFixed(1)}%
                                </Badge>
                            )}
                        </div>
                        <div className="text-2xl text-accent-foreground">
                            {formatCurrency(currentTotals.totalOfferings)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                            Avg: {formatCurrency(avgOfferings)} per service
                        </div>
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border/50">
                    <div className="p-4 bg-muted/20 rounded-xl border border-border/50">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                                <DollarSign className="h-3.5 w-3.5" />
                            </div>
                            <div className="text-xs font-semibold text-muted-foreground tracking-wide">Total Income</div>
                        </div>
                        <div className="text-xl text-foreground">
                            {formatCurrency(totalIncome)}
                        </div>
                    </div>

                    <div className="p-4 bg-muted/20 rounded-xl border border-border/50">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="p-1.5 rounded-md bg-secondary text-secondary-foreground">
                                <Calendar className="h-3.5 w-3.5" />
                            </div>
                            <div className="text-xs font-semibold text-muted-foreground tracking-wide">Services Recorded</div>
                        </div>
                        <div className="text-xl text-foreground">
                            {currentTotals.serviceCount}
                        </div>
                    </div>
                </div>

                {/* Additional Breakdown */}
                {(currentTotals.totalDonations > 0 || currentTotals.totalSpecialOfferings > 0) && (
                    <div className="pt-4 border-t border-border/50 space-y-3 p-4 rounded-xl bg-warning/50 dark:bg-warning/10 border border-warning/25 dark:border-warning/20">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-md bg-warning/15 text-warning-strong dark:bg-warning/40 dark:text-warning">
                                <Target className="h-3.5 w-3.5" />
                            </div>
                            <h4 className="text-sm font-semibold text-warning-strong dark:text-warning-strong">Additional Income</h4>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            {currentTotals.totalDonations > 0 && (
                                <div className="flex items-center justify-between p-2 rounded-md bg-white/50 dark:bg-black/20">
                                    <span className="text-muted-foreground">Donations:</span>
                                    <span className="font-bold">{formatCurrency(currentTotals.totalDonations)}</span>
                                </div>
                            )}
                            {currentTotals.totalSpecialOfferings > 0 && (
                                <div className="flex items-center justify-between p-2 rounded-md bg-white/50 dark:bg-black/20">
                                    <span className="text-muted-foreground">Special Offerings:</span>
                                    <span className="font-bold">{formatCurrency(currentTotals.totalSpecialOfferings)}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Recent Activity */}
                {currentSummaries.length > 0 && (
                    <div className="pt-2 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                        <span>Latest: {new Date(currentSummaries[currentSummaries.length - 1]?.service_date).toLocaleDateString()}</span>
                        <Badge variant="outline" className="text-[10px] h-5">
                            {currentSummaries.length} services
                        </Badge>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
