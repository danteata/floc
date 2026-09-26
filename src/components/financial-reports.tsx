'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, startOfQuarter, endOfQuarter, subMonths, subYears } from 'date-fns'
import { CalendarIcon, Download, TrendingUp, TrendingDown, DollarSign, PieChart, BarChart3, FileText, Loader2 } from 'lucide-react'
import { TransactionCategory } from '@/types/database'
import { formatCurrency, TRANSACTION_CATEGORIES } from '@/lib/financial-utils'
import { cn } from '@/lib/utils'
import { StatCard, StatGrid } from '@/components/ui/stat-card'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { useOrganization } from '@/hooks/use-organization'

type ReportType = 'income-statement' | 'expense-breakdown' | 'contribution-analysis' | 'budget-comparison' | 'trend-analysis'

export function FinancialReports() {
    const { organization } = useOrganization()
    const [reportType, setReportType] = useState<ReportType>('income-statement')
    const [dateRange, setDateRange] = useState('this-month')
    const [customStartDate, setCustomStartDate] = useState<Date>()
    const [customEndDate, setCustomEndDate] = useState<Date>()

    const transactions = useQuery(api.financial.listTransactions,
        organization ? { organization_id: organization._id } : "skip"
    )

    const dateRangeOptions = [
        { value: 'this-month', label: 'This Month' },
        { value: 'last-month', label: 'Last Month' },
        { value: 'this-quarter', label: 'This Quarter' },
        { value: 'this-year', label: 'This Year' },
        { value: 'last-year', label: 'Last Year' },
        { value: 'custom', label: 'Custom Range' }
    ]

    const filteredTransactions = useMemo(() => {
        if (!transactions) return []

        let start: Date
        let end: Date

        if (dateRange === 'custom' && customStartDate && customEndDate) {
            start = customStartDate
            end = customEndDate
        } else {
            const now = new Date()
            switch (dateRange) {
                case 'this-month':
                    start = startOfMonth(now)
                    end = endOfMonth(now)
                    break
                case 'last-month':
                    const lastMonth = subMonths(now, 1)
                    start = startOfMonth(lastMonth)
                    end = endOfMonth(lastMonth)
                    break
                case 'this-quarter':
                    start = startOfQuarter(now)
                    end = endOfQuarter(now)
                    break
                case 'this-year':
                    start = startOfYear(now)
                    end = endOfYear(now)
                    break
                case 'last-year':
                    const lastYear = subYears(now, 1)
                    start = startOfYear(lastYear)
                    end = endOfYear(lastYear)
                    break
                default:
                    start = new Date(0)
                    end = new Date()
            }
        }

        return transactions.filter(transaction => {
            const transactionDate = new Date(transaction.date)
            return transactionDate >= start && transactionDate <= end
        })
    }, [transactions, dateRange, customStartDate, customEndDate])

    const reportData = useMemo(() => {
        const income = filteredTransactions.filter(t => t.type === 'income')
        const expenses = filteredTransactions.filter(t => t.type === 'expense')

        const totalIncome = income.reduce((sum, t) => sum + t.amount, 0)
        const totalExpenses = expenses.reduce((sum, t) => sum + t.amount, 0)
        const netIncome = totalIncome - totalExpenses

        // Group by category
        const incomeByCategory = income.reduce((acc, t) => {
            acc[t.category] = (acc[t.category] || 0) + t.amount
            return acc
        }, {} as Record<string, number>)

        const expensesByCategory = expenses.reduce((acc, t) => {
            acc[t.category] = (acc[t.category] || 0) + t.amount
            return acc
        }, {} as Record<string, number>)

        // Group by month for trend analysis
        const monthlyData = filteredTransactions.reduce((acc, t) => {
            const month = format(new Date(t.date), 'MMM yyyy')
            if (!acc[month]) {
                acc[month] = { income: 0, expenses: 0, net: 0 }
            }
            if (t.type === 'income') {
                acc[month].income += t.amount
            } else {
                acc[month].expenses += t.amount
            }
            acc[month].net = acc[month].income - acc[month].expenses
            return acc
        }, {} as Record<string, { income: number; expenses: number; net: number }>)

        return {
            totalIncome,
            totalExpenses,
            netIncome,
            incomeByCategory,
            expensesByCategory,
            monthlyData,
            transactionCount: filteredTransactions.length
        }
    }, [filteredTransactions])

    const exportReport = () => {
        let csvContent = ''

        switch (reportType) {
            case 'income-statement':
                csvContent = `Financial Report - ${dateRangeOptions.find(d => d.value === dateRange)?.label}\n\n`
                csvContent += `Total Income,${formatCurrency(reportData.totalIncome)}\n`
                csvContent += `Total Expenses,${formatCurrency(reportData.totalExpenses)}\n`
                csvContent += `Net Income,${formatCurrency(reportData.netIncome)}\n\n`
                csvContent += `Income by Category\n`
                Object.entries(reportData.incomeByCategory).forEach(([category, amount]) => {
                    csvContent += `${TRANSACTION_CATEGORIES[category as unknown as TransactionCategory]?.label || category},${formatCurrency(amount)}\n`
                })
                csvContent += `\nExpenses by Category\n`
                Object.entries(reportData.expensesByCategory).forEach(([category, amount]) => {
                    csvContent += `${TRANSACTION_CATEGORIES[category as unknown as TransactionCategory]?.label || category},${formatCurrency(amount)}\n`
                })
                break

            case 'trend-analysis':
                csvContent = `Monthly Trends - ${dateRangeOptions.find(d => d.value === dateRange)?.label}\n\n`
                csvContent += `Month,Income,Expenses,Net Income\n`
                Object.entries(reportData.monthlyData).forEach(([month, data]) => {
                    csvContent += `${month},${formatCurrency(data.income)},${formatCurrency(data.expenses)},${formatCurrency(data.net)}\n`
                })
                break

            default:
                csvContent = `Transaction Report - ${dateRangeOptions.find(d => d.value === dateRange)?.label}\n\n`
                csvContent += `Date,Type,Category,Description,Amount,Payment Method\n`
                filteredTransactions.forEach(t => {
                    csvContent += `${t.date},${t.type},${TRANSACTION_CATEGORIES[t.category as unknown as TransactionCategory]?.label || t.category},"${t.description}",${formatCurrency(t.amount)},${t.payment_method}\n`
                })
        }

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        const url = URL.createObjectURL(blob)
        link.setAttribute('href', url)
        link.setAttribute('download', `financial-report-${reportType}-${dateRange}-${new Date().toISOString().split('T')[0]}.csv`)
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    if (transactions === undefined) {
        return (
            <div className="flex flex-col items-center justify-center h-64 border border-dashed border-border/50 rounded-xl bg-muted/10 animate-pulse">
                <Loader2 className="h-10 w-10 animate-spin mb-4 text-primary" />
                <span className="text-sm text-muted-foreground">Gathering intelligence...</span>
            </div>
        )
    }

    return (
        <div className="space-y-8">
            {/* Report Controls */}
            <Card className="glass-card border-border/50 shadow-soft rounded-xl overflow-hidden">
                <div className="h-1 bg-gradient-primary"></div>
                <CardHeader className="p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div>
                            <CardTitle className="flex items-center gap-3 text-2xl tracking-tight">
                                <div className="p-2.5 bg-primary/10 text-primary rounded-xl shadow-md">
                                    <FileText className="h-6 w-6" />
                                </div>
                                Intelligence Hub
                            </CardTitle>
                            <CardDescription className="text-muted-foreground mt-2">
                                Secure financial analytics & audit generation
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-3">
                            <Badge variant="outline" className="bg-success/10 text-success-strong border-success/20 px-3 py-1 rounded-full">
                                <span className="w-1.5 h-1.5 rounded-full bg-success mr-2 animate-pulse"></span>
                                System Online
                            </Badge>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-6 pt-0">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm text-muted-foreground ml-1">Analysis Type</label>
                            <Select value={reportType} onValueChange={(value: ReportType) => setReportType(value)}>
                                <SelectTrigger className="h-11 rounded-lg border-input-border bg-background/50 hover:bg-accent/50 transition-colors">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl shadow-lg border-border/50">
                                    <SelectItem value="income-statement">Income Statement</SelectItem>
                                    <SelectItem value="expense-breakdown">Expense Breakdown</SelectItem>
                                    <SelectItem value="contribution-analysis">Contribution Analysis</SelectItem>
                                    <SelectItem value="budget-comparison">Budget Comparison</SelectItem>
                                    <SelectItem value="trend-analysis">Trend Analysis</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm text-muted-foreground ml-1">Temporal Range</label>
                            <Select value={dateRange} onValueChange={setDateRange}>
                                <SelectTrigger className="h-11 rounded-lg border-input-border bg-background/50 hover:bg-accent/50 transition-colors">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl shadow-lg border-border/50">
                                    {dateRangeOptions.map(option => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm text-muted-foreground ml-1">Actions</label>
                            <Button
                                onClick={exportReport}
                                className="w-full h-11 rounded-lg bg-primary text-primary-foreground shadow-soft hover:shadow-soft-lg transition-all"
                            >
                                <Download className="h-4 w-4 mr-2" />
                                Extract Data
                            </Button>
                        </div>
                    </div>

                    {dateRange === 'custom' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 p-4 bg-muted/30 rounded-xl border border-dashed border-border">
                            <div className="space-y-2">
                                <label className="text-xs text-muted-foreground tracking-wide ml-1">Start Date</label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className={cn("w-full h-10 justify-start text-left font-normal rounded-lg border-input-border", !customStartDate && "text-muted-foreground")}>
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {customStartDate ? format(customStartDate, "PPP") : <span>Select Date</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0 rounded-xl shadow-lg border-border/50">
                                        <Calendar mode="single" selected={customStartDate} onSelect={setCustomStartDate} initialFocus />
                                    </PopoverContent>
                                </Popover>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs text-muted-foreground tracking-wide ml-1">End Date</label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className={cn("w-full h-10 justify-start text-left font-normal rounded-lg border-input-border", !customEndDate && "text-muted-foreground")}>
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {customEndDate ? format(customEndDate, "PPP") : <span>Select Date</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0 rounded-xl shadow-lg border-border/50">
                                        <Calendar mode="single" selected={customEndDate} onSelect={setCustomEndDate} initialFocus />
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Report Content */}
            <Tabs value={reportType} onValueChange={(value) => setReportType(value as ReportType)} className="space-y-8">
                <TabsList className="bg-muted/50 p-1 rounded-xl w-full md:w-auto inline-flex overflow-x-auto">
                    <TabsTrigger value="income-statement" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-4">Income Statement</TabsTrigger>
                    <TabsTrigger value="expense-breakdown" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-4">Expense Breakdown</TabsTrigger>
                    <TabsTrigger value="contribution-analysis" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-4">Contributions</TabsTrigger>
                    <TabsTrigger value="trend-analysis" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-4">Trends</TabsTrigger>
                </TabsList>

                <TabsContent value="income-statement" className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <StatGrid className="lg:grid-cols-3">
                        <StatCard
                            label="Total inflow"
                            value={formatCurrency(reportData.totalIncome)}
                            icon={TrendingUp}
                        />
                        <StatCard
                            label="Total outflow"
                            value={formatCurrency(reportData.totalExpenses)}
                            icon={TrendingDown}
                        />
                        <StatCard
                            label="Net position"
                            value={formatCurrency(reportData.netIncome)}
                            icon={DollarSign}
                            hint={reportData.netIncome >= 0 ? "Surplus" : "Deficit"}
                            hintTone={reportData.netIncome >= 0 ? "positive" : "negative"}
                        />
                    </StatGrid>

                    <Card className="glass-card border-border/50 shadow-soft rounded-xl overflow-hidden">
                        <CardHeader className="p-6 border-b border-border/50 bg-muted/20">
                            <CardTitle className="text-lg font-semibold flex items-center gap-2">
                                <BarChart3 className="h-5 w-5 text-muted-foreground" />
                                Inflow Categorization Matrix
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent border-border/50">
                                        <TableHead className="pl-6 h-12">Source</TableHead>
                                        <TableHead className="text-right h-12">Amount</TableHead>
                                        <TableHead className="text-right pr-6 h-12">Distribution</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {Object.entries(reportData.incomeByCategory).length > 0 ? (
                                        Object.entries(reportData.incomeByCategory).map(([category, amount]) => (
                                            <TableRow key={category} className="border-border/50 hover:bg-muted/30 transition-colors">
                                                <TableCell className="pl-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-lg", TRANSACTION_CATEGORIES[category as unknown as TransactionCategory]?.color.replace('bg-', 'bg-').replace('500', '100') || "bg-muted")}>
                                                            {TRANSACTION_CATEGORIES[category as unknown as TransactionCategory]?.icon || '💰'}
                                                        </div>
                                                        <span className="font-medium text-foreground">{TRANSACTION_CATEGORIES[category as unknown as TransactionCategory]?.label || category}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right text-success-strong">
                                                    {formatCurrency(amount)}
                                                </TableCell>
                                                <TableCell className="text-right pr-6">
                                                    <Badge variant="secondary" className="font-medium">
                                                        {((amount / reportData.totalIncome) * 100).toFixed(1)}%
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={3} className="h-24 text-center text-muted-foreground italic">No active inflow channels found for this period</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="expense-breakdown" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <Card className="glass-card border-border/50 shadow-soft rounded-xl overflow-hidden">
                        <CardHeader className="p-6 border-b border-border/50 bg-muted/20">
                            <CardTitle className="text-lg font-semibold flex items-center gap-2">
                                <PieChart className="h-5 w-5 text-muted-foreground" />
                                Expense Breakdown
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent border-border/50">
                                        <TableHead className="pl-6 h-12">Category</TableHead>
                                        <TableHead className="text-right h-12">Amount</TableHead>
                                        <TableHead className="text-right pr-6 h-12">Impact</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {Object.entries(reportData.expensesByCategory).length > 0 ? (
                                        Object.entries(reportData.expensesByCategory).map(([category, amount]) => (
                                            <TableRow key={category} className="border-border/50 hover:bg-muted/30 transition-colors">
                                                <TableCell className="pl-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-lg", TRANSACTION_CATEGORIES[category as unknown as TransactionCategory]?.color.replace('bg-', 'bg-').replace('500', '100') || "bg-muted")}>
                                                            {TRANSACTION_CATEGORIES[category as unknown as TransactionCategory]?.icon || '💸'}
                                                        </div>
                                                        <span className="font-medium text-foreground">{TRANSACTION_CATEGORIES[category as unknown as TransactionCategory]?.label || category}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right text-destructive-strong">
                                                    {formatCurrency(amount)}
                                                </TableCell>
                                                <TableCell className="text-right pr-6">
                                                    <Badge variant="secondary" className="font-medium text-destructive-strong bg-destructive/50">
                                                        {((amount / reportData.totalExpenses) * 100).toFixed(1)}% Share
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={3} className="h-24 text-center text-muted-foreground italic">No expenses recorded for this period</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="contribution-analysis" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <Card className="glass-card border-border/50 border-dashed bg-muted/10 rounded-xl">
                        <CardContent className="flex flex-col items-center justify-center p-20 text-center">
                            <div className="p-6 bg-gradient-primary/5 rounded-full mb-6">
                                <PieChart className="h-12 w-12 text-primary/40" />
                            </div>
                            <h3 className="text-xl font-semibold text-foreground mb-2">Analytics Module Pending</h3>
                            <p className="text-muted-foreground max-w-sm">
                                High-density contribution telemetry and donor analysis tools are currently under development.
                            </p>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="trend-analysis" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <Card className="glass-card border-border/50 shadow-soft rounded-xl overflow-hidden">
                        <CardHeader className="p-6 border-b border-border/50 bg-muted/20">
                            <CardTitle className="text-lg font-semibold flex items-center gap-2">
                                <TrendingUp className="h-5 w-5 text-muted-foreground" />
                                Monthly Trends
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent border-border/50">
                                        <TableHead className="pl-6 h-12">Period</TableHead>
                                        <TableHead className="text-right h-12">Income</TableHead>
                                        <TableHead className="text-right h-12">Expenses</TableHead>
                                        <TableHead className="text-right pr-6 h-12">Net Result</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {Object.entries(reportData.monthlyData).length > 0 ? (
                                        Object.entries(reportData.monthlyData).map(([month, data]) => (
                                            <TableRow key={month} className="border-border/50 hover:bg-muted/30 transition-colors">
                                                <TableCell className="pl-6 py-4 text-foreground">{month}</TableCell>
                                                <TableCell className="text-right text-success-strong">{formatCurrency(data.income)}</TableCell>
                                                <TableCell className="text-right text-destructive-strong">{formatCurrency(data.expenses)}</TableCell>
                                                <TableCell className="text-right pr-6">
                                                    <Badge variant="outline" className={cn("font-medium border-0", data.net >= 0 ? "bg-success/10 text-success-strong" : "bg-destructive/10 text-destructive-strong")}>
                                                        {formatCurrency(data.net)}
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={4} className="h-24 text-center text-muted-foreground italic">No historical data available</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Summary Footer */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <Card className="glass-card border-border/50 shadow-sm p-4 flex flex-col items-center justify-center text-center">
                    <span className="text-xs text-muted-foreground tracking-wide mb-1">Total Income</span>
                    <span className="text-lg text-success-strong">{formatCurrency(reportData.totalIncome)}</span>
                </Card>
                <Card className="glass-card border-border/50 shadow-sm p-4 flex flex-col items-center justify-center text-center">
                    <span className="text-xs text-muted-foreground tracking-wide mb-1">Total Expenses</span>
                    <span className="text-lg text-destructive-strong">{formatCurrency(reportData.totalExpenses)}</span>
                </Card>
                <Card className="glass-card border-border/50 shadow-sm p-4 flex flex-col items-center justify-center text-center">
                    <span className="text-xs text-muted-foreground tracking-wide mb-1">Net Result</span>
                    <span className={cn("text-lg", reportData.netIncome >= 0 ? "text-primary" : "text-destructive-strong")}>
                        {formatCurrency(reportData.netIncome)}
                    </span>
                </Card>
                <Card className="glass-card border-border/50 shadow-sm p-4 flex flex-col items-center justify-center text-center">
                    <span className="text-xs text-muted-foreground tracking-wide mb-1">Transactions</span>
                    <span className="text-lg text-foreground">{reportData.transactionCount}</span>
                </Card>
            </div>
        </div>
    )
}
