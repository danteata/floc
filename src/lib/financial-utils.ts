import { DEFAULT_CURRENCY, formatMoney } from '@/lib/money'
import { formatMonth } from '@/lib/display'
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

/**
 * This calendar month's total of one type against last month's, from the
 * transactions' own dates. `change` is a whole-number percentage, or null when
 * last month had nothing to compare against (a percentage of zero is meaningless).
 */
export function monthOnMonth(
    transactions: Array<{ type: string; amount: number; date: string; status?: string }>,
    type: TransactionType,
    now: Date = new Date(),
): { current: number; previous: number; change: number | null } {
    const thisMonth = now.getFullYear() * 12 + now.getMonth()
    let current = 0
    let previous = 0
    for (const t of transactions) {
        if (t.type !== type || !isCountedTransaction(t)) continue
        const d = new Date(t.date)
        if (Number.isNaN(d.getTime())) continue
        const month = d.getFullYear() * 12 + d.getMonth()
        if (month === thisMonth) current += t.amount
        else if (month === thisMonth - 1) previous += t.amount
    }
    const change = previous > 0 ? Math.round(((current - previous) / previous) * 100) : null
    return { current, previous, change }
}

/** "12% up on last month", "Level with last month", or null with nothing to compare. */
export function describeMonthOnMonth(change: number | null): string | null {
    if (change === null) return null
    if (change === 0) return 'Level with last month'
    return `${Math.abs(change)}% ${change > 0 ? 'up' : 'down'} on last month`
}

export function calculateBudgetVariance(budgets: BudgetCategory[], transactions: FinancialTransaction[]) {
    const variances = budgets.map(budget => {
        const categoryTransactions = transactions.filter(t =>
            isCountedTransaction(t) &&
            t.category === budget.category &&
            new Date(t.date).getMonth() === budget.month - 1 &&
            new Date(t.date).getFullYear() === budget.fiscal_year
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

export function getTransactionsByPeriod(transactions: FinancialTransaction[], period: 'month' | 'quarter' | 'year') {
    const now = new Date()
    let startDate: Date

    switch (period) {
        case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1)
            break
        case 'quarter':
            const quarterStart = Math.floor(now.getMonth() / 3) * 3
            startDate = new Date(now.getFullYear(), quarterStart, 1)
            break
        case 'year':
            startDate = new Date(now.getFullYear(), 0, 1)
            break
    }

    return transactions.filter(t => new Date(t.date) >= startDate)
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
        const monthTransactions = transactions.filter(t => {
            const transactionDate = new Date(t.date)
            return transactionDate.getMonth() === date.getMonth() &&
                transactionDate.getFullYear() === date.getFullYear()
        })

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

export function exportTransactionsToCSV(transactions: FinancialTransaction[]): string {
    const headers = [
        'Date',
        'Type',
        'Category',
        'Amount',
        'Description',
        'Payment Method',
        'Member',
        'Event',
        'Recorded By',
        'Notes'
    ]

    const rows = transactions.map(t => [
        t.date,
        t.type,
        TRANSACTION_CATEGORIES[t.category as TransactionCategory]?.label || t.category,
        t.amount.toString(),
        t.description,
        PAYMENT_METHODS.find(pm => pm.value === t.payment_method)?.label || t.payment_method,
        t.member_name || '',
        t.event_name || '',
        t.recorded_by_name,
        t.notes || ''
    ])

    const csvContent = [headers, ...rows]
        .map(row => row.map(cell => `"${cell}"`).join(','))
        .join('\n')

    return csvContent
}
