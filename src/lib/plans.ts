/**
 * The plans as the landing page and the billing page describe them. The amount
 * actually charged is the Paystack plan's (PAYSTACK_PRO_PLAN_CODE); keep this in
 * step with it. The two pages used to quote different prices (GH₵120 and GH₵150).
 */
export const PRO_PRICE_GHS = 150

/** Mirrors convex/entitlements.ts (a test keeps them equal; importing it here
 *  would pull server code into the browser bundle). */
export const FREE_MEMBER_LIMIT = 200
