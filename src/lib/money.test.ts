import { describe, expect, it } from 'vitest'
import { formatMoney } from './money'

describe('formatMoney', () => {
    it('uses the local symbol and two decimals', () => {
        expect(formatMoney(1234.5, 'GHS')).toBe('GH₵1,234.50')
        expect(formatMoney(1234.5, 'NGN')).toBe('₦1,234.50')
        expect(formatMoney(35, 'USD')).toBe('$35.00')
    })
    it('defaults to cedis, and can drop the pesewas', () => {
        expect(formatMoney(150, undefined, { whole: true })).toBe('GH₵150')
    })
})
