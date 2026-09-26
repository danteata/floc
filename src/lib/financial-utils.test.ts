import { describe, expect, it } from 'vitest'
import { describeMonthOnMonth, monthOnMonth } from './financial-utils'

const now = new Date(2026, 8, 26) // 26 September 2026

describe('monthOnMonth', () => {
    it('compares this calendar month with last, from the transactions’ own dates', () => {
        const txns = [
            { type: 'income', amount: 1200, date: '2026-09-06' },
            { type: 'income', amount: 1000, date: '2026-08-30' },
            { type: 'income', amount: 500, date: '2026-07-12' }, // two months back: ignored
            { type: 'expense', amount: 300, date: '2026-09-02' },
        ]
        expect(monthOnMonth(txns, 'income', now)).toEqual({ current: 1200, previous: 1000, change: 20 })
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
        expect(describeMonthOnMonth(12)).toBe('12% up on last month')
        expect(describeMonthOnMonth(-5)).toBe('5% down on last month')
        expect(describeMonthOnMonth(0)).toBe('Level with last month')
        expect(describeMonthOnMonth(null)).toBeNull()
    })
})
