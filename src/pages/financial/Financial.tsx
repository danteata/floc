'use client'

import { FinancialTransaction } from '@/types/database'

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { FinancialTransactionDialog } from '@/components/financial-transaction-dialog'
import { FinancialWidget } from '@/components/financial-widget'
import { FinancialReports } from '@/components/financial-reports'
import { ServiceFinancialSummaryDialog } from '@/components/service-financial-summary-dialog'
import {
    Plus,
    Search,
    Filter,
    Download,
    Edit,
    Ban,
    Calendar as CalendarIcon,
    ArrowUpRight,
    ArrowDownRight,
    BarChart3,
} from 'lucide-react'
import {
    calculateTransactionTotals,
    monthOnMonth,
    describeMonthOnMonth,
    exportTransactionsToCSV,
    TRANSACTION_CATEGORIES
} from '@/lib/financial-utils'
import { LayoutWrapper } from '@/components/layout-wrapper'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard, StatGrid } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { useMoney } from '@/lib/money'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Id } from '../../../convex/_generated/dataModel'
import { useOrganization } from '@/hooks/use-organization'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { formatDay } from '@/lib/display'

export default function FinancialPage() {
    const { user, isLoaded } = useUser()
    const { organization } = useOrganization()
    const { toast } = useToast()
    const navigate = useNavigate()
    const money = useMoney()

    // State
    const [searchTerm, setSearchTerm] = useState('')
    const [categoryFilter, setCategoryFilter] = useState<string>('all')
    const [typeFilter, setTypeFilter] = useState<string>('all')
    const [dateRange, setDateRange] = useState<string>('all')
    const [showTransactionDialog, setShowTransactionDialog] = useState(false)
    const [showSummaryDialog, setShowSummaryDialog] = useState(false)
    const [editingTransaction, setEditingTransaction] = useState<any>(null)
    const [editingSummary, setEditingSummary] = useState<any>(null)

    // Convex Queries
    const transactions = useQuery(api.financial.listTransactions, {
        organization_id: organization?._id as Id<"organizations">
    }) as any || []

    // Convex Mutations
    const createTransaction = useMutation(api.financial.createTransaction)
    const updateTransaction = useMutation(api.financial.updateTransaction)
    const voidTransaction = useMutation(api.financial.voidTransaction)

    const handleSaveTransaction = async (transactionData: any) => {
        try {
            if (editingTransaction) {
                await updateTransaction({
                    id: editingTransaction._id as Id<"financial_transactions">,
                    ...transactionData
                })
                toast({ title: "Transaction updated" })
            } else {
                await createTransaction({
                    ...transactionData,
                    organization_id: organization?._id as Id<"organizations">
                })
                toast({ title: "Transaction added" })
            }
            setShowTransactionDialog(false)
            setEditingTransaction(null)
        } catch (error: any) {
            toast({ title: "Couldn't save the transaction", description: error.message, variant: "destructive" })
        }
    }

    const handleVoidTransaction = async (transactionId: string) => {
        // Financial records are never deleted once entered — voiding keeps
        // the row (audit-preserving) but excludes it from totals/reports.
        const reason = window.prompt('Why are you voiding this transaction? It stays in the ledger but no longer counts in any total.')
        if (reason === null) return
        if (!reason.trim()) {
            toast({ title: "Transaction not voided", description: "Give a reason to void a transaction.", variant: "destructive" })
            return
        }
        try {
            await voidTransaction({ id: transactionId as Id<"financial_transactions">, reason: reason.trim() })
            toast({ title: "Transaction voided" })
        } catch (error: any) {
            toast({ title: "Couldn't void the transaction", description: error.message, variant: "destructive" })
        }
    }

    const filteredTransactions = useMemo(() => {
        const rawTransactions = (transactions || []) as unknown as any[];
        const filtered = rawTransactions.filter((transaction: any) => {
            const matchesSearch = searchTerm === '' ||
                transaction.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (transaction.member_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (transaction.event_name || '').toLowerCase().includes(searchTerm.toLowerCase())

            const matchesCategory = categoryFilter === 'all' || transaction.category === categoryFilter
            const matchesType = typeFilter === 'all' || transaction.type === typeFilter

            let matchesDateRange = true
            if (dateRange !== 'all') {
                const transactionDate = new Date(transaction.date)
                const now = new Date()

                switch (dateRange) {
                    case 'today':
                        matchesDateRange = transactionDate.toDateString() === now.toDateString()
                        break
                    case 'week':
                        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
                        matchesDateRange = transactionDate >= weekAgo
                        break
                    case 'month':
                        matchesDateRange = transactionDate.getMonth() === now.getMonth() &&
                            transactionDate.getFullYear() === now.getFullYear()
                        break
                    case 'year':
                        matchesDateRange = transactionDate.getFullYear() === now.getFullYear()
                        break
                }
            }
            return matchesSearch && matchesCategory && matchesType && matchesDateRange
        });
        return filtered as FinancialTransaction[];
    }, [transactions, searchTerm, categoryFilter, typeFilter, dateRange])

    const totals = useMemo(() => calculateTransactionTotals(filteredTransactions), [filteredTransactions])
    // Worked out from the transactions' dates; no hint at all when last month
    // has nothing to compare with, rather than an invented trend.
    const incomeTrend = useMemo(() => monthOnMonth(transactions, 'income').change, [transactions])
    const expenseTrend = useMemo(() => monthOnMonth(transactions, 'expense').change, [transactions])

    const handleExportData = () => {
        const csvContent = exportTransactionsToCSV(filteredTransactions)
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        const url = URL.createObjectURL(blob)
        link.setAttribute('href', url)
        link.setAttribute('download', `financial-transactions-${new Date().toISOString().split('T')[0]}.csv`)
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    return (
        <LayoutWrapper>
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <PageHeader
                    title="Finance"
                    description="Giving, offerings and expenses, service by service."
                    actions={<>
                        <Button
                            variant="outline"
                            className="shadow-sm hover:shadow-md transition-all rounded-lg"
                            onClick={handleExportData}
                        >
                            <Download className="h-4 w-4 mr-2" />
                            Export CSV
                        </Button>
                        <Button
                            className="bg-primary text-primary-foreground shadow-soft hover:shadow-soft-lg transition-all rounded-lg"
                            onClick={() => setShowTransactionDialog(true)}
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Add transaction
                        </Button>
                    </>}
                />

                <StatGrid>
                    <StatCard
                        label="Total income"
                        value={money(totals.income)}
                        icon={ArrowUpRight}
                        hint={describeMonthOnMonth(incomeTrend)}
                        hintTone={incomeTrend === null || incomeTrend === 0 ? 'neutral' : incomeTrend > 0 ? 'positive' : 'negative'}
                    />
                    <StatCard
                        label="Total expenses"
                        value={money(totals.expense)}
                        icon={ArrowDownRight}
                        hint={describeMonthOnMonth(expenseTrend)}
                    />
                    <StatCard
                        label="Net"
                        value={money(totals.net)}
                        icon={BarChart3}
                    />
                    <StatCard
                        label="Total transactions"
                        value={filteredTransactions.length.toString()}
                        icon={CalendarIcon}
                    />
                </StatGrid>

                <Tabs defaultValue="overview" className="space-y-8">
                    <TabsList className="bg-muted/50 p-1 rounded-xl w-full md:w-auto inline-flex">
                        <TabsTrigger
                            value="overview"
                            className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-6 transition-all"
                        >
                            Overview
                        </TabsTrigger>
                        <TabsTrigger
                            value="transactions"
                            className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-6 transition-all"
                        >
                            Ledger
                        </TabsTrigger>
                        <TabsTrigger
                            value="reports"
                            className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-6 transition-all"
                        >
                            Reports
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="animate-in fade-in duration-500 space-y-8">
                        <FinancialWidget
                            onAddTransaction={() => setShowTransactionDialog(true)}
                        />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <ActionBox
                                title="Service summary"
                                description="Record the attendance and giving for one service or event."
                                buttonText="Add summary"
                                onClick={() => setShowSummaryDialog(true)}
                                icon={<Plus className="h-5 w-5" />}
                            />
                            <ActionBox
                                title="Import transactions"
                                description="Bring in transactions from a CSV file or spreadsheet."
                                buttonText="Import"
                                onClick={() => { }}
                                icon={<Download className="h-5 w-5" />}
                            />
                        </div>
                    </TabsContent>

                    <TabsContent value="transactions" className="animate-in fade-in duration-500 space-y-8">
                        {/* Filters */}
                        <Card className="shadow-soft hover:shadow-soft-lg transition-all rounded-xl border border-border/50">
                            <CardHeader className="bg-muted/30 pb-4">
                                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                                    <Filter className="h-4 w-4 text-muted-foreground" />
                                    Filters
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-6">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div className="relative group">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                        <Input
                                            placeholder="Search the ledger…"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="pl-9 bg-background border-input-border rounded-lg"
                                        />
                                    </div>

                                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                                        <SelectTrigger className="rounded-lg">
                                            <SelectValue placeholder="Type" />
                                        </SelectTrigger>
                                        <SelectContent className="rounded-lg shadow-lg border-border/50">
                                            <SelectItem value="all">All types</SelectItem>
                                            <SelectItem value="income">Income</SelectItem>
                                            <SelectItem value="expense">Expenses</SelectItem>
                                        </SelectContent>
                                    </Select>

                                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                                        <SelectTrigger className="rounded-lg">
                                            <SelectValue placeholder="Category" />
                                        </SelectTrigger>
                                        <SelectContent className="rounded-lg shadow-lg border-border/50 max-h-[300px]">
                                            <SelectItem value="all">All categories</SelectItem>
                                            {Object.entries(TRANSACTION_CATEGORIES).map(([key, category]) => (
                                                <SelectItem key={key} value={key}>
                                                    {category.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    <Select value={dateRange} onValueChange={setDateRange}>
                                        <SelectTrigger className="rounded-lg">
                                            <SelectValue placeholder="Range" />
                                        </SelectTrigger>
                                        <SelectContent className="rounded-lg shadow-lg border-border/50">
                                            <SelectItem value="all">All time</SelectItem>
                                            <SelectItem value="today">Today</SelectItem>
                                            <SelectItem value="week">Last 7 days</SelectItem>
                                            <SelectItem value="month">This month</SelectItem>
                                            <SelectItem value="year">This year</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Table */}
                        <div className="rounded-xl overflow-hidden shadow-soft border border-border/50 bg-card">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/40 hover:bg-muted/40 border-b border-border/50">
                                        <TableHead className="font-semibold text-muted-foreground pl-6">Date</TableHead>
                                        <TableHead className="font-semibold text-muted-foreground">Description</TableHead>
                                        <TableHead className="font-semibold text-muted-foreground">Member or event</TableHead>
                                        <TableHead className="font-semibold text-muted-foreground">Amount</TableHead>
                                        <TableHead className="font-semibold text-muted-foreground text-right pr-6">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredTransactions.map((transaction) => {
                                        const isVoided = transaction.status === 'voided'
                                        const isPending = transaction.status === 'pending'
                                        const isFailed = transaction.status === 'failed'
                                        return (
                                        <TableRow key={transaction._id} className={cn("hover:bg-muted/30 border-b border-border/50 transition-colors", isVoided && "opacity-50")}>
                                            <TableCell className="pl-6 text-sm text-muted-foreground">
                                                {formatDay(new Date(transaction.date))}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <Badge variant="outline" className="w-fit text-xs bg-muted/50 border-border/50 text-muted-foreground">
                                                            {TRANSACTION_CATEGORIES[transaction.category]?.label ?? transaction.category}
                                                        </Badge>
                                                        {isVoided && (
                                                            <Badge variant="destructive" className="text-xs" title={transaction.void_reason}>Voided</Badge>
                                                        )}
                                                        {isPending && (
                                                            <Badge variant="outline" className="text-xs text-warning-strong border-warning/30">Pending</Badge>
                                                        )}
                                                        {isFailed && (
                                                            <Badge variant="outline" className="text-xs text-muted-foreground">Failed</Badge>
                                                        )}
                                                    </div>
                                                    <span className={cn("font-medium text-sm text-foreground truncate max-w-[200px]", isVoided && "line-through")}>
                                                        {transaction.description}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {transaction.member_name || transaction.giver_name || transaction.event_name || <span className="text-muted-foreground">Not linked</span>}
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant="secondary"
                                                    className={cn(
                                                        "font-semibold text-xs rounded-md px-2.5 py-0.5 border-0",
                                                        transaction.type === 'income'
                                                            ? 'bg-success/10 text-success-strong dark:text-success'
                                                            : 'bg-destructive/10 text-destructive-strong dark:text-destructive'
                                                    )}
                                                >
                                                    {transaction.type === 'income' ? '+' : '-'} {money(transaction.amount)}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right pr-6">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg"
                                                        disabled={isVoided}
                                                        aria-label="Edit transaction"
                                                        title="Edit"
                                                        onClick={() => {
                                                            setEditingTransaction(transaction)
                                                            setShowTransactionDialog(true)
                                                        }}
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                                                        disabled={isVoided}
                                                        aria-label="Void transaction"
                                                        title="Void"
                                                        onClick={() => transaction._id && handleVoidTransaction(transaction._id)}
                                                    >
                                                        <Ban className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                            {filteredTransactions.length === 0 && (
                                transactions.length === 0 ? (
                                    <EmptyState
                                        icon={Search}
                                        title="No transactions yet"
                                        description="Add a transaction or a service summary and it will appear here."
                                    />
                                ) : (
                                    <EmptyState
                                        icon={Search}
                                        title="No transactions match these filters"
                                        description="Change or clear the filters to see more."
                                    />
                                )
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="reports" className="animate-in fade-in duration-500">
                        <div className="rounded-xl overflow-hidden shadow-soft border border-border/50 bg-card p-6">
                            <FinancialReports />
                        </div>
                    </TabsContent>
                </Tabs>

                <FinancialTransactionDialog
                    open={showTransactionDialog}
                    onOpenChange={(open) => {
                        setShowTransactionDialog(open)
                        if (!open) setEditingTransaction(null)
                    }}
                    transaction={editingTransaction}
                />

                <ServiceFinancialSummaryDialog
                    open={showSummaryDialog}
                    onOpenChange={(open) => {
                        setShowSummaryDialog(open)
                        if (!open) setEditingSummary(null)
                    }}
                    summary={editingSummary}
                />
            </div>
        </LayoutWrapper>
    )
}

function ActionBox({ title, description, buttonText, onClick, icon }: { title: string, description: string, buttonText: string, onClick: () => void, icon: React.ReactNode }) {
    return (
        <div className="p-6 rounded-xl border border-border/50 bg-card shadow-sm hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-6 group cursor-pointer" onClick={onClick}>
            <div className="space-y-2">
                <h3 className="text-lg font-semibold flex items-center gap-2 group-hover:text-primary transition-colors">
                    {title}
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
                    {description}
                </p>
            </div>
            <Button className="h-10 px-6 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 group-hover:bg-primary group-hover:text-primary-foreground transition-all shadow-sm">
                <span className="mr-2">{buttonText}</span>
                {icon}
            </Button>
        </div>
    )
}
