import { describe, expect, it } from 'vitest'
import { FREE_MEMBER_LIMIT as SERVER_LIMIT } from '../../convex/entitlements'
import { FREE_MEMBER_LIMIT } from './plans'

describe('plans', () => {
    it('quotes the same free-plan member limit the server enforces', () => {
        expect(FREE_MEMBER_LIMIT).toBe(SERVER_LIMIT)
    })
})
