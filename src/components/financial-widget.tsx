'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatCard, StatGrid } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    Wallet,
    TrendingUp,
    TrendingDown,
    Plus,
    Loader2
} from 'lucide-react'
import {
    calculateTransactionTotals,
    isCountedTransaction,
    periodToDateRanges,
    transactionDay,
    TRANSACTION_CATEGORIES
} from '@/lib/financial-utils'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { useOrganization } from '@/hooks/use-organization'
import { useMoney } from '@/lib/money'
import type { FinancialTransaction } from '@/types/database'

interface FinancialWidgetProps {
    onAddTransaction?: () => void
    className?: string
}

export function FinancialWidget({
    onAddTransaction,
    className = ''
}: FinancialWidgetProps) {
    const { organization } = useOrganization()
    const [selectedPeriod, setSelectedPeriod] = useState<'month' | 'quarter' | 'year'>('month')
    const money = useMoney()

    const transactions = useQuery(api.financial.listTransactions,
        organization ? { organization_id: organization._id } : "skip"
    )

    if (transactions === undefined) {
        return (
            <Card className={`${className} h-[400px] items-center justify-center`}>
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Loading income and expenses…</span>
                </div>
            </Card>
        )
    }

    // This period so far against the same span of the one before (1 to 5
    // September against 1 to 5 August), from each row's own calendar day. A
    // few days set against a whole month read as a steep fall every month.
    const ranges = periodToDateRanges(selectedPeriod)
    const rows = (transactions || []).map(t => ({ ...t, type: t.type as any, category: t.category as any, payment_method: (t as any).payment_method as any, organization_id: t.organization_id as any, status: t.status as FinancialTransaction['status'] }))
    const inRange = (range: { start: string; end: string }) => rows.filter(t => {
        const day = transactionDay(t.date)
        return day >= range.start && day <= range.end
    })
    const currentTotals = calculateTransactionTotals(inRange(ranges.current))
    const previousTotals = calculateTransactionTotals(inRange(ranges.previous))

    // Calculate percentage changes
    const incomeChange = previousTotals.income > 0
        ? ((currentTotals.income - previousTotals.income) / previousTotals.income) * 100
        : 0

    const expenseChange = previousTotals.expense > 0
        ? ((currentTotals.expense - previousTotals.expense) / previousTotals.expense) * 100
        : 0

    const netChange = previousTotals.net !== 0
        ? ((currentTotals.net - previousTotals.net) / Math.abs(previousTotals.net)) * 100
        : 0

    const countedCount = rows.filter(isCountedTransaction).length

    // Get top income categories
    const topIncomeCategories = Object.entries(currentTotals.byCategory)
        .filter(([, totals]) => totals.income > 0)
        .sort(([, a], [, b]) => b.income - a.income)
        .slice(0, 3)

    // Get top expense categories
    const topExpenseCategories = Object.entries(currentTotals.byCategory)
        .filter(([, totals]) => totals.expense > 0)
        .sort(([, a], [, b]) => b.expense - a.expense)
        .slice(0, 3)

    const getPeriodLabel = () => {
        const now = new Date()
        switch (selectedPeriod) {
            case 'month':
                return now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
            case 'quarter':
                return `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`
            case 'year':
                return now.getFullYear().toString()
            default:
                return ''
        }
    }

    // Says exactly what the comparison covers: the same days of the last period.
    const previousWord = { month: 'Same days last month', quarter: 'Same days last quarter', year: 'Same days last year' }[selectedPeriod]
    const reportTitle = { month: 'Monthly report', quarter: 'Quarterly report', year: 'Yearly report' }[selectedPeriod]
    const thisPeriod = { month: 'this month', quarter: 'this quarter', year: 'this year' }[selectedPeriod]
    const changeText = (change: number) =>
        change !== 0 ? ` (${change > 0 ? '+' : ''}${change.toFixed(1)}%)` : ''

    const categoryList = (
        rows: typeof topIncomeCategories,
        kind: 'income' | 'expense',
        total: number,
    ) => (
        <ul className="divide-y divide-border">
            {rows.map(([category, totals]) => {
                const categoryInfo = TRANSACTION_CATEGORIES[category as keyof typeof TRANSACTION_CATEGORIES]
                const amount = totals[kind]
                const percentage = total > 0 ? (amount / total) * 100 : 0
                return (
                    <li key={category} className="flex items-center justify-between gap-3 py-2.5">
                        <span className="min-w-0 truncate text-sm text-foreground">{categoryInfo?.label || category}</span>
                        <span className="shrink-0 text-right">
                            <span className="block text-sm font-medium tabular-nums text-foreground">{money(amount)}</span>
                            <span className="block text-xs text-muted-foreground">{percentage.toFixed(1)}% of {kind === 'income' ? 'income' : 'expenses'}</span>
                        </span>
                    </li>
                )
            })}
        </ul>
    )

    return (
        <Card className={className}>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                    <Wallet className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    {reportTitle}
                </CardTitle>
                <CardDescription>{getPeriodLabel()} so far, against the same days of {selectedPeriod === 'month' ? 'last month' : selectedPeriod === 'quarter' ? 'last quarter' : 'last year'}</CardDescription>
                <div className="col-span-full mt-3 flex flex-wrap items-center gap-3">
                    <Tabs value={selectedPeriod} onValueChange={(value) => setSelectedPeriod(value as any)}>
                        <TabsList>
                            <TabsTrigger value="month" className="px-3 text-xs">Month</TabsTrigger>
                            <TabsTrigger value="quarter" className="px-3 text-xs">Quarter</TabsTrigger>
                            <TabsTrigger value="year" className="px-3 text-xs">Year</TabsTrigger>
                        </TabsList>
                    </Tabs>
                    {onAddTransaction && (
                        <Button size="sm" onClick={onAddTransaction}>
                            <Plus className="mr-1 h-4 w-4" />
                            Add transaction
                        </Button>
                    )}
                </div>
            </CardHeader>

            <CardContent className="space-y-6">
                <StatGrid className="grid-cols-1 sm:grid-cols-3 lg:grid-cols-3">
                    <StatCard
                        label="Income"
                        value={money(currentTotals.income)}
                        icon={TrendingUp}
                        hint={`${previousWord}: ${money(previousTotals.income)}${changeText(incomeChange)}`}
                        hintTone={incomeChange > 0 ? 'positive' : incomeChange < 0 ? 'negative' : 'neutral'}
                    />
                    <StatCard
                        label="Expenses"
                        value={money(currentTotals.expense)}
                        icon={TrendingDown}
                        hint={`${previousWord}: ${money(previousTotals.expense)}${changeText(expenseChange)}`}
                        hintTone={expenseChange > 0 ? 'warning' : 'neutral'}
                    />
                    <StatCard
                        label="Net"
                        value={money(currentTotals.net)}
                        icon={Wallet}
                        hint={`${currentTotals.net >= 0 ? 'Surplus' : 'Deficit'}${changeText(netChange)}`}
                        hintTone={currentTotals.net >= 0 ? 'positive' : 'negative'}
                    />
                </StatGrid>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <section>
                        <h4 className="text-sm font-semibold text-foreground">Top income</h4>
                        {topIncomeCategories.length > 0 ? (
                            categoryList(topIncomeCategories, 'income', currentTotals.income)
                        ) : (
                            <EmptyState icon={TrendingUp} title={`No income recorded ${thisPeriod}`} className="py-6" />
                        )}
                    </section>

                    <section>
                        <h4 className="text-sm font-semibold text-foreground">Top expenses</h4>
                        {topExpenseCategories.length > 0 ? (
                            categoryList(topExpenseCategories, 'expense', currentTotals.expense)
                        ) : (
                            <EmptyState icon={TrendingDown} title={`No expenses recorded ${thisPeriod}`} className="py-6" />
                        )}
                    </section>
                </div>

                {countedCount > 0 && (
                    <p className="text-center text-xs text-muted-foreground">
                        {countedCount} {countedCount === 1 ? 'transaction' : 'transactions'} counted in all (voided, pending and failed ones are left out)
                    </p>
                )}
            </CardContent>
        </Card>
    )
}
