'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatCard, StatGrid } from '@/components/ui/stat-card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    Users,
    Wallet,
    Plus,
    Calendar,
    Target,
    Church
} from 'lucide-react'
import { ServiceFinancialSummary } from '@/types/database'
import { useMoney } from '@/lib/money'
import { formatDay } from '@/lib/display'

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
    const money = useMoney()

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
                return 'Last 7 days'
            case 'month':
                return now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
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

    const changeHint = (change: number, base: string) =>
        change !== 0 ? `${base} · ${change > 0 ? '+' : '-'}${Math.abs(change).toFixed(1)}% on the period before` : base
    const changeTone = (change: number) => (change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral') as 'positive' | 'negative' | 'neutral'

    return (
        <Card className={className}>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                    <Church className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    Service giving and attendance
                </CardTitle>
                <CardDescription>{getPeriodLabel()}</CardDescription>
                <div className="col-span-full mt-3 flex flex-wrap items-center gap-3">
                    <Tabs value={selectedPeriod} onValueChange={(value) => setSelectedPeriod(value as any)}>
                        <TabsList>
                            <TabsTrigger value="week" className="text-xs">Week</TabsTrigger>
                            <TabsTrigger value="month" className="text-xs">Month</TabsTrigger>
                            <TabsTrigger value="quarter" className="text-xs">Quarter</TabsTrigger>
                        </TabsList>
                    </Tabs>
                    {onAddSummary && (
                        <Button size="sm" onClick={onAddSummary}>
                            <Plus className="mr-1 h-4 w-4" />
                            Add summary
                        </Button>
                    )}
                </div>
            </CardHeader>

            <CardContent className="space-y-6">
                <StatGrid className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    <StatCard
                        label="Attendance"
                        value={currentTotals.totalAttendance.toLocaleString('en-GB')}
                        icon={Users}
                        hint={changeHint(attendanceChange, `Average ${Math.round(avgAttendance)} per service`)}
                        hintTone={changeTone(attendanceChange)}
                    />
                    <StatCard
                        label="Tithe payers"
                        value={currentTotals.totalTithePayers}
                        icon={Target}
                        hint={changeHint(
                            tithePayersChange,
                            currentTotals.totalAttendance > 0
                                ? `${((currentTotals.totalTithePayers / currentTotals.totalAttendance) * 100).toFixed(1)}% of attendance`
                                : '0% of attendance',
                        )}
                        hintTone={changeTone(tithePayersChange)}
                    />
                    <StatCard
                        label="Services recorded"
                        value={currentTotals.serviceCount}
                        icon={Calendar}
                        hint={
                            currentSummaries.length > 0
                                ? `Latest ${formatDay(currentSummaries[currentSummaries.length - 1]?.service_date)}`
                                : undefined
                        }
                    />
                    <StatCard
                        label="Tithes"
                        value={money(currentTotals.totalTithes)}
                        icon={Wallet}
                        hint={changeHint(tithesChange, `Average ${money(avgTithes)} per service`)}
                        hintTone={changeTone(tithesChange)}
                    />
                    <StatCard
                        label="Offerings"
                        value={money(currentTotals.totalOfferings)}
                        icon={Church}
                        hint={changeHint(offeringsChange, `Average ${money(avgOfferings)} per service`)}
                        hintTone={changeTone(offeringsChange)}
                    />
                    <StatCard
                        label="Total income"
                        value={money(totalIncome)}
                        icon={Wallet}
                        hint="Tithes, offerings, donations and special offerings"
                    />
                </StatGrid>

                {(currentTotals.totalDonations > 0 || currentTotals.totalSpecialOfferings > 0) && (
                    <section className="space-y-2">
                        <h4 className="text-sm font-semibold text-foreground">Other income</h4>
                        <ul className="divide-y divide-border text-sm">
                            {currentTotals.totalDonations > 0 && (
                                <li className="flex items-center justify-between gap-3 py-2">
                                    <span className="text-muted-foreground">Donations</span>
                                    <span className="font-medium tabular-nums">{money(currentTotals.totalDonations)}</span>
                                </li>
                            )}
                            {currentTotals.totalSpecialOfferings > 0 && (
                                <li className="flex items-center justify-between gap-3 py-2">
                                    <span className="text-muted-foreground">Special offerings</span>
                                    <span className="font-medium tabular-nums">{money(currentTotals.totalSpecialOfferings)}</span>
                                </li>
                            )}
                        </ul>
                    </section>
                )}
            </CardContent>
        </Card>
    )
}
