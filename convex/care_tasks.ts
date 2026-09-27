import { v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { getUserSafe, isOrgAdmin, requireUser, resolveOrgId } from "./auth";
import {
    callerOrgId,
    getLinkedMember,
    memberIdInScope,
    resolveManagedMemberIds,
} from "./scope";

type Ctx = QueryCtx | MutationCtx;

const STATUSES = ["pending", "contacted", "resolved"] as const;

/**
 * The at-risk baseline to record on a care task at creation: the member's
 * engagement level right now. Compared against their current level later to
 * attribute recoveries (engagement/impact.ts). Both undefined on Free orgs or
 * members not yet scored — the attribution query treats those as unmeasured.
 */
function engagementSnapshot(member: Doc<"members">): {
    member_score_at_contact?: number;
    member_risk_at_contact?: string;
} {
    return {
        member_score_at_contact: member.engagement_score,
        member_risk_at_contact: member.engagement_risk_level,
    };
}

function isValidStatus(status: string): status is (typeof STATUSES)[number] {
    return (STATUSES as readonly string[]).includes(status);
}

/** Resolve a member's Clerk user id (user_id -> users, falling back to email). */
async function resolveClerkUserIdForMember(
    ctx: Ctx,
    memberId: Id<"members">,
): Promise<string | null> {
    const member = await ctx.db.get(memberId);
    if (!member) return null;
    if (member.user_id) {
        const user = await ctx.db.get(member.user_id);
        if (user) return user.clerk_user_id;
    }
    if (member.email) {
        const email = member.email;
        const user = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", email))
            .first();
        if (user) return user.clerk_user_id;
    }
    return null;
}

async function notifyAssignee(
    ctx: MutationCtx,
    args: {
        orgId: Id<"organizations">;
        assignedTo: Id<"members">;
        memberName: string;
        title: string;
        body: string;
    },
) {
    const clerkUserId = await resolveClerkUserIdForMember(ctx, args.assignedTo);
    if (!clerkUserId) return;
    await ctx.db.insert("notifications", {
        clerk_user_id: clerkUserId,
        organization_id: args.orgId,
        type: "care",
        title: args.title,
        body: args.body,
        created_at: new Date().toISOString(),
    });
}

/** Tasks assigned to the current user's linked member. */
export const listMine = query({
    args: { status: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const user = await getUserSafe(ctx);
        if (!user) return [];
        const member = await getLinkedMember(ctx, user);
        if (!member) return [];

        const status = args.status;
        const tasks = status
            ? await ctx.db
                  .query("care_tasks")
                  .withIndex("by_assigned_to_and_status", (q) =>
                      q.eq("assigned_to", member._id).eq("status", status),
                  )
                  .order("desc")
                  .collect()
            : await ctx.db
                  .query("care_tasks")
                  .withIndex("by_assigned_to_and_status", (q) =>
                      q.eq("assigned_to", member._id),
                  )
                  .order("desc")
                  .collect();

        return await Promise.all(tasks.map((t) => enrichTask(ctx, t)));
    },
});

/** Org-scoped board view: org admins see everyone, unit leaders see their scope. */
export const list = query({
    args: {
        organization_id: v.optional(v.id("organizations")),
        status: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await getUserSafe(ctx);
        if (!user) return [];

        // resolveOrgId forces non-super-admins to their own org even if a
        // different organization_id is passed — the isOrgAdmin bypass below
        // must never see another org's rows. Null only for a super_admin
        // with no organization_id arg and no org of their own.
        let orgId: Id<"organizations"> | null;
        try {
            orgId = await resolveOrgId(ctx, args.organization_id);
        } catch {
            return [];
        }
        if (!orgId) return [];

        let tasks: Doc<"care_tasks">[];
        if (args.status) {
            const status = args.status;
            tasks = await ctx.db
                .query("care_tasks")
                .withIndex("by_org_and_status", (q) =>
                    q.eq("organization_id", orgId).eq("status", status),
                )
                .order("desc")
                .collect();
        } else {
            tasks = await ctx.db
                .query("care_tasks")
                .withIndex("by_org", (q) => q.eq("organization_id", orgId))
                .order("desc")
                .collect();
        }

        if (!isOrgAdmin(user)) {
            const scope = await resolveManagedMemberIds(ctx);
            const callerOrg = callerOrgId(ctx, user);
            tasks = tasks.filter((t) =>
                memberIdInScope(t.member_id, orgId, scope, callerOrg),
            );
        }

        return await Promise.all(tasks.map((t) => enrichTask(ctx, t)));
    },
});

/** A member's tasks + notes, for the profile-dialog "Follow-up History" section. */
export const listForMember = query({
    args: { member_id: v.id("members") },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx);
        const member = await ctx.db.get(args.member_id);
        if (!member) return [];

        if (!isOrgAdmin(user)) {
            const scope = await resolveManagedMemberIds(ctx);
            if (
                !memberIdInScope(
                    args.member_id,
                    member.organization_id,
                    scope,
                    callerOrgId(ctx, user),
                )
            ) {
                throw new Error("Forbidden");
            }
        }

        const tasks = await ctx.db
            .query("care_tasks")
            .withIndex("by_member", (q) => q.eq("member_id", args.member_id))
            .order("desc")
            .collect();

        return await Promise.all(
            tasks.map(async (t) => {
                const notes = await ctx.db
                    .query("care_task_notes")
                    .withIndex("by_task", (q) => q.eq("care_task_id", t._id))
                    .order("asc")
                    .collect();
                const assignee = await ctx.db.get(t.assigned_to);
                return { ...t, assignee_name: assignee?.name ?? "Unknown", notes };
            }),
        );
    },
});

async function enrichTask(ctx: Ctx, task: Doc<"care_tasks">) {
    const [member, assignee] = await Promise.all([
        ctx.db.get(task.member_id),
        ctx.db.get(task.assigned_to),
    ]);
    return {
        ...task,
        member_name: member?.name ?? "Unknown",
        member_avatar_url: member?.avatar_url,
        assignee_name: assignee?.name ?? "Unknown",
    };
}

export const create = mutation({
    args: {
        member_id: v.id("members"),
        assigned_to: v.id("members"),
        note: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx);
        const member = await ctx.db.get(args.member_id);
        if (!member) throw new Error("Member not found");
        if (!member.organization_id) throw new Error("Member has no organization");

        const assignee = await ctx.db.get(args.assigned_to);
        if (!assignee || assignee.organization_id !== member.organization_id) {
            throw new Error("Assignee must be a member of the same organization");
        }

        if (!isOrgAdmin(user)) {
            const scope = await resolveManagedMemberIds(ctx);
            if (
                !memberIdInScope(
                    args.member_id,
                    member.organization_id,
                    scope,
                    callerOrgId(ctx, user),
                )
            ) {
                throw new Error("Forbidden");
            }
        }

        // One open follow-up per member per assignee: assigning the same
        // person again returns the task that is already open.
        const existingTasks = await ctx.db
            .query("care_tasks")
            .withIndex("by_member", (q) => q.eq("member_id", args.member_id))
            .collect();
        const openTask = existingTasks.find(
            (t) => t.assigned_to === args.assigned_to && t.status !== "resolved",
        );
        if (openTask) return { taskId: openTask._id, created: false };

        const now = new Date().toISOString();
        const taskId = await ctx.db.insert("care_tasks", {
            organization_id: member.organization_id,
            member_id: args.member_id,
            assigned_to: args.assigned_to,
            status: "pending",
            source: "manual",
            created_by: user.clerk_user_id,
            created_at: now,
            updated_at: now,
            ...engagementSnapshot(member),
        });

        await ctx.db.insert("care_task_notes", {
            care_task_id: taskId,
            organization_id: member.organization_id,
            status: "pending",
            note: args.note,
            created_by: user.clerk_user_id,
            created_by_name: user.name || user.email || undefined,
            created_at: now,
        });

        await notifyAssignee(ctx, {
            orgId: member.organization_id,
            assignedTo: args.assigned_to,
            memberName: member.name,
            title: "New follow-up assigned",
            body: `You've been asked to follow up with ${member.name}.${args.note ? ` "${args.note}"` : ""}`,
        });

        return { taskId, created: true };
    },
});

async function requireTaskAccess(ctx: MutationCtx, taskId: Id<"care_tasks">) {
    const user = await requireUser(ctx);
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Task not found");

    const linkedMember = await getLinkedMember(ctx, user);
    const isAssignee = !!linkedMember && linkedMember._id === task.assigned_to;

    if (!isAssignee && !isOrgAdmin(user)) {
        const scope = await resolveManagedMemberIds(ctx);
        const member = await ctx.db.get(task.member_id);
        if (
            !memberIdInScope(
                task.member_id,
                member?.organization_id,
                scope,
                callerOrgId(ctx, user),
            )
        ) {
            throw new Error("Forbidden");
        }
    }

    return { user, task };
}

export const updateStatus = mutation({
    args: {
        id: v.id("care_tasks"),
        status: v.string(),
        note: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        if (!isValidStatus(args.status)) throw new Error("Invalid status");
        const { user, task } = await requireTaskAccess(ctx, args.id);

        const now = new Date().toISOString();
        await ctx.db.patch(args.id, {
            status: args.status,
            updated_at: now,
            // Stamp the first move to "contacted" as the intervention moment.
            contacted_at:
                args.status === "contacted" && !task.contacted_at ? now : task.contacted_at,
            resolved_at: args.status === "resolved" ? now : task.resolved_at,
        });

        await ctx.db.insert("care_task_notes", {
            care_task_id: args.id,
            organization_id: task.organization_id,
            status: args.status,
            note: args.note,
            created_by: user.clerk_user_id,
            created_by_name: user.name || user.email || undefined,
            created_at: now,
        });

        return { ok: true };
    },
});

export const addNote = mutation({
    args: { id: v.id("care_tasks"), note: v.string() },
    handler: async (ctx, args) => {
        const { user, task } = await requireTaskAccess(ctx, args.id);

        await ctx.db.insert("care_task_notes", {
            care_task_id: args.id,
            organization_id: task.organization_id,
            status: task.status,
            note: args.note,
            created_by: user.clerk_user_id,
            created_by_name: user.name || user.email || undefined,
            created_at: new Date().toISOString(),
        });

        return { ok: true };
    },
});

/**
 * Fan out a follow-up task to every active member of a household, all to the
 * same assignee. Skips members who already have an unresolved task with that
 * assignee, so re-running this on a household already being followed up on
 * doesn't create duplicates.
 */
export const createForHousehold = mutation({
    args: {
        household_id: v.id("households"),
        assigned_to: v.id("members"),
        note: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx);
        const household = await ctx.db.get(args.household_id);
        if (!household) throw new Error("Household not found");

        const assignee = await ctx.db.get(args.assigned_to);
        if (!assignee || assignee.organization_id !== household.organization_id) {
            throw new Error("Assignee must be a member of the same organization");
        }

        const members = await ctx.db
            .query("members")
            .withIndex("by_household", (q) => q.eq("household_id", args.household_id))
            .collect();
        const active = members.filter((m) => !m.archived_at);
        if (active.length === 0) throw new Error("Household has no active members");

        if (!isOrgAdmin(user)) {
            const scope = await resolveManagedMemberIds(ctx);
            const callerOrg = callerOrgId(ctx, user);
            const hasAccess = active.some((m) =>
                memberIdInScope(m._id, m.organization_id, scope, callerOrg),
            );
            if (!hasAccess) throw new Error("Forbidden");
        }

        const now = new Date().toISOString();
        let created = 0;
        for (const member of active) {
            const existing = await ctx.db
                .query("care_tasks")
                .withIndex("by_member", (q) => q.eq("member_id", member._id))
                .collect();
            const hasOpenTask = existing.some(
                (t) => t.assigned_to === args.assigned_to && t.status !== "resolved",
            );
            if (hasOpenTask) continue;

            const taskId = await ctx.db.insert("care_tasks", {
                organization_id: household.organization_id,
                member_id: member._id,
                assigned_to: args.assigned_to,
                status: "pending",
                source: "manual",
                created_by: user.clerk_user_id,
                created_at: now,
                updated_at: now,
                ...engagementSnapshot(member),
            });
            await ctx.db.insert("care_task_notes", {
                care_task_id: taskId,
                organization_id: household.organization_id,
                status: "pending",
                note: args.note,
                created_by: user.clerk_user_id,
                created_by_name: user.name || user.email || undefined,
                created_at: now,
            });
            created++;
        }

        if (created > 0) {
            const label = household.name || "a household";
            await notifyAssignee(ctx, {
                orgId: household.organization_id,
                assignedTo: args.assigned_to,
                memberName: label,
                title: "New household follow-up assigned",
                body: `You've been asked to follow up with ${created} member${created === 1 ? "" : "s"} of ${label}.${args.note ? ` "${args.note}"` : ""}`,
            });
        }

        return { created, skipped: active.length - created };
    },
});
