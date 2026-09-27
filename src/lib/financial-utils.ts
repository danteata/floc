import { DEFAULT_CURRENCY, formatMoney } from '@/lib/money'
import { formatMonth, toDayKey } from '@/lib/display'
import { toCsv } from '@/lib/csv'
import { FinancialTransaction, TransactionType, TransactionCategory, BudgetCategory } from '@/types/database'

export const TRANSACTION_CATEGORIES: Record<TransactionCategory, { label: string; color: string; icon: string }> = {
    tithe: { label: 'Tithes', color: 'bg-green-500', icon: '💰' },
    offering: { label: 'Offerings', color: 'bg-blue-500', icon: '🙏' },
    donation: { label: 'Donations', color: 'bg-purple-500', icon: '🎁' },
    mission: { label: 'Missions', color: 'bg-orange-500', icon: '🌍' },
    utilities: { label: 'Utilities', color: 'bg-yellow-500', icon: '⚡' },
    maintenance: { label: 'Maintenance', color: 'bg-gray-500', icon: '🔧' },
    supplies: { label: 'Supplies', color: 'bg-indigo-500', icon: '📦' },
    salary: { label: 'Salaries', color: 'bg-red-500', icon: '💼' },
    event: { label: 'Events', color: 'bg-pink-500', icon: '🎪' },
    other: { label: 'Other', color: 'bg-slate-500', icon: '📝' }
}

export const PAYMENT_METHODS = [
    { value: 'cash', label: 'Cash' },
    { value: 'check', label: 'Check' },
    { value: 'bank_transfer', label: 'Bank transfer' },
    { value: 'credit_card', label: 'Card' },
    { value: 'online', label: 'Online' },
    { value: 'other', label: 'Other' }
] as const

/** Money in the church's currency (see src/lib/money.ts). This used to be
 *  hard-wired to US dollars, whatever the church's books were kept in. */
export function formatCurrency(amount: number, currency: string = DEFAULT_CURRENCY): string {
    return formatMoney(amount, currency)
}

/** Online giving settles in cedis only (see convex/paystack.ts). */
export function formatGHS(amount: number): string {
    return formatMoney(amount, 'GHS')
}

// Online gifts can sit as "pending" (checkout started, not yet confirmed) or
// "failed"/"voided" — none of those represent money actually in hand, so
// every total/report calculation must exclude them. Manually-entered rows
// have no `status` at all (undefined), which counts as completed.
export function isCountedTransaction(t: { status?: string }): boolean {
    return (t.status ?? 'completed') === 'completed'
}

export function calculateTransactionTotals(transactions: FinancialTransaction[]) {
    const totals = {
        income: 0,
        expense: 0,
        net: 0,
        byCategory: {} as Record<TransactionCategory, { income: number; expense: number; net: number }>
    }

    // Initialize category totals
    Object.keys(TRANSACTION_CATEGORIES).forEach(category => {
        totals.byCategory[category as TransactionCategory] = { income: 0, expense: 0, net: 0 }
    })

    transactions.filter(isCountedTransaction).forEach(transaction => {
        if (transaction.type === 'income') {
            totals.income += transaction.amount
            totals.byCategory[transaction.category].income += transaction.amount
        } else {
            totals.expense += transaction.amount
            totals.byCategory[transaction.category].expense += transaction.amount
        }
    })

    // Calculate net amounts
    totals.net = totals.income - totals.expense
    Object.keys(totals.byCategory).forEach(category => {
        const cat = category as TransactionCategory
        totals.byCategory[cat].net = totals.byCategory[cat].income - totals.byCategory[cat].expense
    })

    return totals
}

/** The calendar day of a stored transaction date ("2026-09-26" or an ISO timestamp), as "yyyy-mm-dd". */
export function transactionDay(date: string): string {
    return (date ?? '').slice(0, 10)
}

export type ReportingPeriod = 'month' | 'quarter' | 'year'

const MONTHS_IN_PERIOD: Record<ReportingPeriod, number> = { month: 1, quarter: 3, year: 12 }

function periodStart(period: ReportingPeriod, d: Date): Date {
    if (period === 'month') return new Date(d.getFullYear(), d.getMonth(), 1)
    if (period === 'quarter') return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1)
    return new Date(d.getFullYear(), 0, 1)
}

/** The same day `months` months earlier, pulled back to the month's last day if it has fewer days (31 Mar -> 28 Feb). */
function monthsEarlier(d: Date, months: number): Date {
    const target = new Date(d.getFullYear(), d.getMonth() - months, 1)
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
    return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), lastDay))
}

/**
 * This month (quarter, year) so far, and the same span of the one before:
 * on 5 September that is 1 to 5 September against 1 to 5 August. Comparing a
 * few days with a whole month would show a steep fall every early month.
 * Days are local "yyyy-mm-dd" strings, inclusive.
 */
export function periodToDateRanges(period: ReportingPeriod, now: Date = new Date()) {
    const sameDayBefore = monthsEarlier(now, MONTHS_IN_PERIOD[period])
    return {
        current: { start: toDayKey(periodStart(period, now)), end: toDayKey(now) },
        previous: { start: toDayKey(periodStart(period, sameDayBefore)), end: toDayKey(sameDayBefore) },
    }
}

/**
 * One type's counted total for this period so far against the same span of
 * the previous period, from the transactions' own dates. `change` is a
 * whole-number percentage, or null when the previous span had nothing to
 * compare against (a percentage of zero is meaningless).
 */
export function periodToDate(
    transactions: Array<{ type: string; amount: number; date: string; status?: string }>,
    type: TransactionType,
    period: ReportingPeriod,
    now: Date = new Date(),
): { current: number; previous: number; change: number | null } {
    const { current: cur, previous: prev } = periodToDateRanges(period, now)
    let current = 0
    let previous = 0
    for (const t of transactions) {
        if (t.type !== type || !isCountedTransaction(t)) continue
        const day = transactionDay(t.date)
        if (day >= cur.start && day <= cur.end) current += t.amount
        else if (day >= prev.start && day <= prev.end) previous += t.amount
    }
    const change = previous > 0 ? Math.round(((current - previous) / previous) * 100) : null
    return { current, previous, change }
}

/** This month so far against the same days of last month (see periodToDate). */
export function monthOnMonth(
    transactions: Array<{ type: string; amount: number; date: string; status?: string }>,
    type: TransactionType,
    now: Date = new Date(),
): { current: number; previous: number; change: number | null } {
    return periodToDate(transactions, type, 'month', now)
}

/** "12% up on the same days last month", "Level with the same days last month", or null with nothing to compare. */
export function describeMonthOnMonth(change: number | null): string | null {
    if (change === null) return null
    if (change === 0) return 'Level with the same days last month'
    return `${Math.abs(change)}% ${change > 0 ? 'up' : 'down'} on the same days last month`
}

/** Newest transaction date first; rows on the same day newest-entered first. */
export function sortByTransactionDate<T extends { date: string; _creationTime?: number }>(transactions: T[]): T[] {
    return [...transactions].sort((a, b) => {
        const da = transactionDay(a.date)
        const db = transactionDay(b.date)
        if (da !== db) return da < db ? 1 : -1
        return (b._creationTime ?? 0) - (a._creationTime ?? 0)
    })
}

export function calculateBudgetVariance(budgets: BudgetCategory[], transactions: FinancialTransaction[]) {
    const variances = budgets.map(budget => {
        const categoryTransactions = transactions.filter(t =>
            isCountedTransaction(t) &&
            t.category === budget.category &&
            transactionDay(t.date).slice(0, 7) === `${budget.fiscal_year}-${String(budget.month).padStart(2, '0')}`
        )

        const actualAmount = categoryTransactions.reduce((sum, t) => sum + t.amount, 0)
        const variance = budget.budgeted_amount - actualAmount
        const variancePercent = budget.budgeted_amount > 0 ? (variance / budget.budgeted_amount) * 100 : 0

        return {
            ...budget,
            actual_amount: actualAmount,
            variance,
            variance_percent: variancePercent,
            status: variance >= 0 ? 'under_budget' : 'over_budget'
        }
    })

    return variances
}

export function getTransactionsByPeriod(transactions: FinancialTransaction[], period: ReportingPeriod) {
    const start = toDayKey(periodStart(period, new Date()))
    return transactions.filter(t => transactionDay(t.date) >= start)
}

export function getTopTransactionCategories(transactions: FinancialTransaction[], limit = 5) {
    const categoryTotals = transactions.filter(isCountedTransaction).reduce((acc, transaction) => {
        if (!acc[transaction.category]) {
            acc[transaction.category] = 0
        }
        acc[transaction.category] += transaction.amount
        return acc
    }, {} as Record<string, number>)

    return Object.entries(categoryTotals)
        .sort(([, a], [, b]) => b - a)
        .slice(0, limit)
        .map(([category, amount]) => ({
            category: category as TransactionCategory,
            amount,
            label: TRANSACTION_CATEGORIES[category as TransactionCategory].label,
            color: TRANSACTION_CATEGORIES[category as TransactionCategory].color
        }))
}

export function generateFinancialReport(transactions: FinancialTransaction[], startDate: string, endDate: string) {
    const filteredTransactions = transactions.filter(t =>
        t.date >= startDate && t.date <= endDate
    )

    const totals = calculateTransactionTotals(filteredTransactions)

    return {
        start_date: startDate,
        end_date: endDate,
        transaction_count: filteredTransactions.length,
        ...totals,
        top_categories: getTopTransactionCategories(filteredTransactions, 10)
    }
}

export function validateTransaction(transaction: Partial<FinancialTransaction>): string[] {
    const errors: string[] = []

    if (!transaction.type) errors.push('Transaction type is required')
    if (!transaction.category) errors.push('Category is required')
    if (!transaction.amount || transaction.amount <= 0) errors.push('Amount must be greater than 0')
    if (!transaction.description?.trim()) errors.push('Description is required')
    if (!transaction.date) errors.push('Date is required')
    if (!transaction.payment_method) errors.push('Payment method is required')
    if (!transaction.recorded_by) errors.push('Recorded by is required')

    return errors
}

export function getMonthlyTrend(transactions: FinancialTransaction[], months = 12) {
    const now = new Date()
    const trend = []

    for (let i = months - 1; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const monthKey = toDayKey(date).slice(0, 7)
        const monthTransactions = transactions.filter(t => transactionDay(t.date).slice(0, 7) === monthKey)

        const totals = calculateTransactionTotals(monthTransactions)

        trend.push({
            month: formatMonth(date),
            income: totals.income,
            expense: totals.expense,
            net: totals.net
        })
    }

    return trend
}

const STATUS_LABELS: Record<string, string> = {
    completed: 'Completed',
    pending: 'Pending',
    failed: 'Failed',
    voided: 'Voided',
}

/**
 * Every row of the ledger as CSV, with a Status column so voided, pending and
 * failed rows (which no total counts) can be told apart or filtered out.
 */
export function exportTransactionsToCSV(transactions: FinancialTransaction[]): string {
    const headers = [
        'Date',
        'Status',
        'Type',
        'Category',
        'Amount',
        'Description',
        'Payment method',
        'Member or giver',
        'Event',
        'Recorded by',
        'Notes'
    ]

    const rows = transactions.map(t => [
        transactionDay(t.date),
        STATUS_LABELS[t.status ?? 'completed'] ?? t.status,
        t.type === 'income' ? 'Income' : t.type === 'expense' ? 'Expense' : t.type,
        TRANSACTION_CATEGORIES[t.category as TransactionCategory]?.label || t.category,
        t.amount.toString(),
        t.description,
        PAYMENT_METHODS.find(pm => pm.value === t.payment_method)?.label || t.payment_method,
        t.member_name || t.giver_name || '',
        t.event_name || '',
        t.recorded_by_name,
        t.notes || ''
    ])

    return toCsv(headers, rows)
}
