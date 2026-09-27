import { describe, expect, it } from 'vitest'
import { formatDay, titleCase } from './display'

describe('titleCase', () => {
    it('raises stored lower-case names and leaves capitalised ones alone', () => {
        expect(titleCase('sunday service (bouquet)')).toBe('Sunday Service (Bouquet)')
        expect(titleCase('day of prayer')).toBe('Day of Prayer')
        expect(titleCase('YPG meeting')).toBe('YPG Meeting')
    })
})

describe('formatDay', () => {
    it('reads a calendar date without slipping a day', () => {
        expect(formatDay('2026-09-26')).toBe('26 Sep 2026')
    })
})
