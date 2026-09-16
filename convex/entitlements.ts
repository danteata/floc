/**
 * Plan entitlements — single source of truth for Free vs Pro.
 *
 * Client-side `useSubscription().isPro` is UX only. Mutations/queries that
 * unlock paid capabilities must call `requireFeature` / `assertMemberLimit`
 * here so Free orgs cannot bypass limits by calling the API directly.
 */

import { Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx } from "./_generated/server";
import { isSuperAdmin, normalizeOrgId, requireUser } from "./auth";
import { appError, forbidden } from "./lib/errors";

type Ctx = MutationCtx | QueryCtx;

/** Features that require an active Pro subscription. */
export type ProFeature =
    | "geofenced_check_in"
    | "audit_trail"
    | "advanced_exports"
    | "map"
    | "unlimited_members"
    | "automations"
    | "engagement_scoring"
    | "ai_copilot";

export const FREE_MEMBER_LIMIT = 200;

export const PLAN_LIMITS = {
    free: {
        maxMembers: FREE_MEMBER_LIMIT,
        maxOrganizations: 1,
    },
    pro: {
        maxMembers: Number.POSITIVE_INFINITY,
        maxOrganizations: Number.POSITIVE_INFINITY,
    },
} as const;

/** True when a subscription row currently confers Pro. */
export function isProActive(
    sub: {
        plan: "free" | "pro";
        status: string;
        currentPeriodEnd?: string | null;
    } | null | undefined,
    now: Date = new Date(),
): boolean {
    if (!sub) return false;
    if (sub.plan !== "pro") return false;
    if (sub.status === "cancelled") return false;
    if (!sub.currentPeriodEnd) return sub.status === "active";
    return new Date(sub.currentPeriodEnd).getTime() > now.getTime();
}

export async function getOrgSubscription(
    ctx: Ctx,
    organizationId: Id<"organizations">,
) {
    return await ctx.db
        .query("subscriptions")
        .withIndex("by_org", (q) => q.eq("organization_id", organizationId))
        .unique();
}

/**
 * Whether an org currently has Pro. An org's own active subscription confers
 * Pro directly; otherwise coverage falls back UP the org tree — a
 * sub-organization is Pro if any ancestor holds an active subscription flagged
 * `covers_descendants` (a parent-org license paying for its sub-organizations).
 * The own-subscription check comes first, so a sub-org that still pays for
 * itself keeps its own plan until it lapses, at which point ancestor coverage
 * silently takes over.
 */
export async function orgIsPro(
    ctx: Ctx,
    organizationId: Id<"organizations">,
): Promise<boolean> {
    const own = await getOrgSubscription(ctx, organizationId);
    if (isProActive(own)) return true;

    // Walk ancestors via parent_organization_id (bounded by tree depth).
    let org = await ctx.db.get(organizationId);
    const seen = new Set<string>([organizationId]);
    while (org?.parent_organization_id) {
        const parentId = org.parent_organization_id;
        if (seen.has(parentId)) break; // cycle guard
        seen.add(parentId);
        const parentSub = await getOrgSubscription(ctx, parentId);
        if (parentSub?.covers_descendants && isProActive(parentSub)) return true;
        org = await ctx.db.get(parentId);
    }
    return false;
}

/**
 * Count non-archived members in an org (used for Free plan caps).
 * Bounded: only scans the org index, not the full table.
 */
export async function countOrgMembers(
    ctx: Ctx,
    organizationId: Id<"organizations">,
): Promise<number> {
    const members = await ctx.db
        .query("members")
        .withIndex("by_org", (q) => q.eq("organization_id", organizationId))
        .collect();
    return members.filter((m) => !m.archived_at).length;
}

/**
 * Throw if adding `additional` members would exceed the Free plan cap.
 * Super-admins and Pro orgs are unlimited.
 */
export async function assertMemberLimit(
    ctx: Ctx,
    organizationId: Id<"organizations">,
    additional: number = 1,
): Promise<void> {
    const user = await requireUser(ctx);
    if (isSuperAdmin(user)) return;

    if (await orgIsPro(ctx, organizationId)) return;

    const current = await countOrgMembers(ctx, organizationId);
    if (current + additional > FREE_MEMBER_LIMIT) {
        throw appError(
            "PLAN_LIMIT",
            `Free plan allows up to ${FREE_MEMBER_LIMIT} members. Upgrade to Pro for unlimited members. (Currently ${current}, trying to add ${additional}.)`,
            { feature: "unlimited_members", limit: FREE_MEMBER_LIMIT, current, additional },
        );
    }
}

/**
 * Require an active Pro entitlement for the caller's (or given) organization.
 * Super-admins always pass.
 */
export async function requireFeature(
    ctx: Ctx,
    feature: ProFeature,
    organizationId?: Id<"organizations"> | string | null,
): Promise<void> {
    const user = await requireUser(ctx);
    if (isSuperAdmin(user)) return;

    const orgId =
        normalizeOrgId(ctx, organizationId) ??
        normalizeOrgId(ctx, user.organization_id);
    if (!orgId) {
        throw forbidden("Organization not set");
    }

    if (await orgIsPro(ctx, orgId)) return;

    throw appError("PLAN_REQUIRED", proFeatureMessage(feature), { feature });
}

function proFeatureMessage(feature: ProFeature): string {
    switch (feature) {
        case "geofenced_check_in":
            return "Geofenced check-in is a Pro feature. Upgrade to enforce location on check-in.";
        case "audit_trail":
            return "Full audit trail is a Pro feature. Upgrade to view and export audit logs.";
        case "advanced_exports":
            return "Advanced CSV/XLSX exports are a Pro feature.";
        case "map":
            return "Member map is a Pro feature.";
        case "automations":
            return "Automations (if-this-then-that rules) are a Pro feature. Upgrade to create and enable rules.";
        case "engagement_scoring":
            return "Engagement/at-risk scoring is a Pro feature. Upgrade to see who needs outreach.";
        case "ai_copilot":
            return "AI assistance is a Pro feature. Upgrade to connect a provider and use drafting and triage.";
        case "unlimited_members":
            return `Free plan is limited to ${FREE_MEMBER_LIMIT} members. Upgrade to Pro for unlimited members.`;
        default:
            return "This feature requires a Pro subscription.";
    }
}

/** Public helper for UI: which paid features the org currently has. */
export async function getEntitlementsForOrg(
    ctx: Ctx,
    organizationId: Id<"organizations">,
) {
    const isPro = await orgIsPro(ctx, organizationId);
    const memberCount = await countOrgMembers(ctx, organizationId);
    return {
        plan: isPro ? ("pro" as const) : ("free" as const),
        isPro,
        memberCount,
        memberLimit: isPro ? null : FREE_MEMBER_LIMIT,
        features: {
            geofenced_check_in: isPro,
            audit_trail: isPro,
            advanced_exports: isPro,
            map: isPro,
            unlimited_members: isPro,
            automations: isPro,
            engagement_scoring: isPro,
            ai_copilot: isPro,
            qr_check_in: true,
            attendance: true,
            financial: true,
        },
    };
}
