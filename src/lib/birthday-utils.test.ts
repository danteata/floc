import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getUpcomingBirthdays } from './birthday-utils'

const member = (name: string, dob: string) => ({ id: name, name, status: 'active', dob }) as never

describe('getUpcomingBirthdays', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 8, 20, 10)) }) // 20 Sep 2026
    afterEach(() => vi.useRealTimers())

    it('leaves out birthdays earlier this month that have already passed', () => {
        const names = getUpcomingBirthdays([member('Passed', '1990-09-05'), member('Coming', '1990-09-28')]).map((b) => b.name)
        expect(names).toEqual(['Coming'])
    })

    it('gives the age they turn on the coming birthday', () => {
        const [b] = getUpcomingBirthdays([member('Ama', '1990-09-28')])
        expect(b!.age).toBe(36)
    })

    it('counts today as today, at the age they turn today', () => {
        const [b] = getUpcomingBirthdays([member('Kofi', '2000-09-20')])
        expect(b!.isToday).toBe(true)
        expect(b!.age).toBe(26)
    })
})
