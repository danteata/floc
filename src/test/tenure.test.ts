import { describe, expect, it } from 'vitest'
import { tenureStart } from '../../convex/lib/tenure'

describe('tenureStart', () => {
    it('prefers the joined date', () => {
        expect(tenureStart({ joined_date: '2026-03-01', created_at: '2026-07-10T09:00:00Z' })).toBe('2026-03-01')
    })
    it('falls back to when the record was created', () => {
        expect(tenureStart({ created_at: '2026-07-10T09:00:00Z' })).toBe('2026-07-10')
        expect(tenureStart({ _creationTime: Date.parse('2026-08-02T12:00:00Z') })).toBe('2026-08-02')
    })
    it('is null when nothing is known', () => {
        expect(tenureStart({})).toBeNull()
    })
})
