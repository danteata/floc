import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    describeMonthOnMonth,
    exportTransactionsToCSV,
    getMonthlyTrend,
    monthOnMonth,
    periodToDate,
    periodToDateRanges,
    sortByTransactionDate,
    transactionDay,
} from './financial-utils'
import type { FinancialTransaction } from '@/types/database'

const now = new Date(2026, 8, 26) // 26 September 2026

describe('monthOnMonth', () => {
    it('compares this month so far with the same days of last month, from the transactions’ own dates', () => {
        const txns = [
            { type: 'income', amount: 1200, date: '2026-09-06' },
            { type: 'income', amount: 1000, date: '2026-08-20' },
            { type: 'income', amount: 800, date: '2026-08-30' }, // after 26 Aug: not in the same span
            { type: 'income', amount: 500, date: '2026-07-12' }, // two months back: ignored
            { type: 'expense', amount: 300, date: '2026-09-02' },
        ]
        expect(monthOnMonth(txns, 'income', now)).toEqual({ current: 1200, previous: 1000, change: 20 })
    })

    it('does not show a steep fall early in the month', () => {
        const fifth = new Date(2026, 8, 5)
        const txns = [
            { type: 'income', amount: 100, date: '2026-09-03' },
            { type: 'income', amount: 100, date: '2026-08-02' },
            { type: 'income', amount: 500, date: '2026-08-25' },
        ]
        expect(monthOnMonth(txns, 'income', fifth)).toEqual({ current: 100, previous: 100, change: 0 })
    })

    it('leaves voided transactions out', () => {
        const txns = [
            { type: 'income', amount: 1000, date: '2026-08-10' },
            { type: 'income', amount: 900, date: '2026-09-10', status: 'voided' },
        ]
        expect(monthOnMonth(txns, 'income', now).current).toBe(0)
    })

    it('gives no change when last month had nothing to compare with', () => {
        expect(monthOnMonth([{ type: 'income', amount: 50, date: '2026-09-01' }], 'income', now).change).toBeNull()
    })
})

describe('describeMonthOnMonth', () => {
    it('says it in words, and says nothing without a comparison', () => {
        expect(describeMonthOnMonth(12)).toBe('12% up on the same days last month')
        expect(describeMonthOnMonth(-5)).toBe('5% down on the same days last month')
        expect(describeMonthOnMonth(0)).toBe('Level with the same days last month')
        expect(describeMonthOnMonth(null)).toBeNull()
    })
})

describe('periodToDateRanges', () => {
    it('takes the same span of the previous month, clamped to its length', () => {
        expect(periodToDateRanges('month', new Date(2026, 2, 31))).toEqual({
            current: { start: '2026-03-01', end: '2026-03-31' },
            previous: { start: '2026-02-01', end: '2026-02-28' },
        })
    })

    it('does the same for a quarter and a year', () => {
        expect(periodToDateRanges('quarter', new Date(2026, 7, 15))).toEqual({
            current: { start: '2026-07-01', end: '2026-08-15' },
            previous: { start: '2026-04-01', end: '2026-05-15' },
        })
        expect(periodToDateRanges('year', new Date(2026, 0, 10))).toEqual({
            current: { start: '2026-01-01', end: '2026-01-10' },
            previous: { start: '2025-01-01', end: '2025-01-10' },
        })
    })

    it('crosses the year for January and the first quarter', () => {
        expect(periodToDateRanges('month', new Date(2026, 0, 5)).previous).toEqual({ start: '2025-12-01', end: '2025-12-05' })
        expect(periodToDateRanges('quarter', new Date(2026, 1, 5)).previous).toEqual({ start: '2025-10-01', end: '2025-11-05' })
    })
})

describe('periodToDate', () => {
    it('reads stored days as calendar days, not UTC instants', () => {
        const txns = [{ type: 'income', amount: 40, date: '2026-09-01' }, { type: 'income', amount: 60, date: '2026-08-01' }]
        expect(periodToDate(txns, 'income', 'month', new Date(2026, 8, 1))).toEqual({ current: 40, previous: 60, change: -33 })
    })
})

describe('transactionDay', () => {
    it('keeps the calendar day of a plain date or a timestamp', () => {
        expect(transactionDay('2026-09-01')).toBe('2026-09-01')
        expect(transactionDay('2026-09-01T10:00:00.000Z')).toBe('2026-09-01')
    })
})

describe('sortByTransactionDate', () => {
    it('puts the latest date first, then the latest entered', () => {
        const rows = [
            { id: 'a', date: '2026-09-01', _creationTime: 5 },
            { id: 'b', date: '2026-09-10', _creationTime: 1 },
            { id: 'c', date: '2026-09-01', _creationTime: 9 },
        ]
        expect(sortByTransactionDate(rows).map(r => r.id)).toEqual(['b', 'c', 'a'])
    })
})

describe('getMonthlyTrend', () => {
    afterEach(() => vi.useRealTimers())

    it('buckets the 1st of a month into that month', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date(2026, 8, 26))
        const txns = [{ type: 'income', category: 'tithe', amount: 10, date: '2026-09-01' }] as FinancialTransaction[]
        expect(getMonthlyTrend(txns, 2)).toEqual([
            { month: 'Aug 2026', income: 0, expense: 0, net: 0 },
            { month: 'Sep 2026', income: 10, expense: 0, net: 10 },
        ])
    })
})

describe('exportTransactionsToCSV', () => {
    const base = {
        type: 'income', category: 'offering', amount: 25, description: 'Sunday "harvest" offering', date: '2026-09-06',
        payment_method: 'cash', recorded_by: 'u1', recorded_by_name: 'Ama', organization_id: 'o1',
    } as FinancialTransaction

    it('adds a status column, escapes quotes, and names the giver when there is no member', () => {
        const csv = exportTransactionsToCSV([
            base,
            { ...base, status: 'voided', member_name: undefined, giver_name: 'Kofi Mensah' },
        ])
        const [header, first, second] = csv.split('\r\n')
        expect(header.split(',')[1]).toBe('"Status"')
        expect(first).toContain('"Completed"')
        expect(first).toContain('"Sunday ""harvest"" offering"')
        expect(second).toContain('"Voided"')
        expect(second).toContain('"Kofi Mensah"')
    })
})
