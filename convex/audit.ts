import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { internalMutation, query, QueryCtx } from "./_generated/server";
import { isSuperAdmin, requireOrgAdmin, resolveOrgId } from "./auth";
import { requireFeature } from "./entitlements";

// Log an audit event. Internal-only: writes must go through ctx.runMutation
// (internal.audit.logEvent) so the caller's identity can't be forged by a
// client. Exposing this as a public mutation let anyone inject arbitrary
// action/performed_by/organization_id rows.
export const logEvent = internalMutation({
    args: {
        action: v.string(),
        entity_type: v.string(),
        entity_id: v.optional(v.string()),
        entity_name: v.optional(v.string()),
        performed_by: v.string(),
        performed_by_name: v.string(),
        performed_by_role: v.string(),
        organization_id: v.optional(v.id("organizations")),
        changes: v.optional(v.any()),
        metadata: v.optional(v.any()),
        ip_address: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const timestamp = new Date().toISOString();

        const auditLogId = await ctx.db.insert("audit_logs", {
            action: args.action,
            entity_type: args.entity_type,
            entity_id: args.entity_id,
            entity_name: args.entity_name,
            performed_by: args.performed_by,
            performed_by_name: args.performed_by_name,
            performed_by_role: args.performed_by_role,
            organization_id: args.organization_id,
            changes: args.changes,
            metadata: args.metadata,
            ip_address: args.ip_address,
            timestamp,
        });

        return auditLogId;
    },
});

// The org whose audit trail the caller may read. Org admins (and super
// admins) only: the audit trail records who changed what across the whole
// church, so ordinary members and unit leaders must not see it. Returns null
// only for a super admin with no org selected (they read across orgs).
async function requireAuditReader(
    ctx: QueryCtx,
    organizationId?: Id<"organizations">,
) {
    const user = await requireOrgAdmin(ctx);
    const orgId = await resolveOrgId(ctx, organizationId);
    return { user, orgId };
}

// Newest-first audit rows for one org (or every org for a super admin with no
// org selected).
function orgLogsQuery(ctx: QueryCtx, orgId: Id<"organizations"> | null) {
    return orgId
        ? ctx.db
              .query("audit_logs")
              .withIndex("by_org", (q) => q.eq("organization_id", orgId))
              .order("desc")
        : ctx.db.query("audit_logs").order("desc");
}

/** "2026-09-30" -> "2026-10-01" (the day after a yyyy-mm-dd date). */
function nextDay(date: string): string {
    const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return date;
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
}

// Get audit logs with pagination and filtering
export const getAuditLogs = query({
    args: {
        organization_id: v.optional(v.id("organizations")),
        action: v.optional(v.string()),
        entity_type: v.optional(v.string()),
        // Exact clerk id of the person who made the change.
        performed_by: v.optional(v.string()),
        // Part of the name of the person who made the change (any case).
        performed_by_name: v.optional(v.string()),
        start_date: v.optional(v.string()),
        // Inclusive: a yyyy-mm-dd date keeps the whole of that day.
        end_date: v.optional(v.string()),
        limit: v.optional(v.number()),
        offset: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        // Org admins only, scoped to the caller's org. resolveOrgId throws for
        // non-super-admins without an org, and ignores any client-supplied org
        // except for super_admins (who may pass one, or omit it to read across
        // orgs).
        const { orgId: resolvedOrgId } = await requireAuditReader(ctx, args.organization_id);
        // Full audit trail is a Pro feature (super_admins always pass).
        await requireFeature(ctx, "audit_trail", resolvedOrgId);

        let query = orgLogsQuery(ctx, resolvedOrgId);

        if (args.action) {
            const action = args.action;
            query = query.filter((q) => q.eq(q.field("action"), action));
        }

        if (args.entity_type) {
            const entityType = args.entity_type;
            query = query.filter((q) => q.eq(q.field("entity_type"), entityType));
        }

        if (args.performed_by) {
            const performedBy = args.performed_by;
            query = query.filter((q) => q.eq(q.field("performed_by"), performedBy));
        }

        if (args.start_date) {
            const startDate = args.start_date;
            query = query.filter((q) => q.gte(q.field("timestamp"), startDate));
        }

        if (args.end_date) {
            // Timestamps are full ISO strings, so "<= 2026-09-30" would drop
            // everything after midnight on the 30th. Compare against the start
            // of the next day instead.
            const beforeDate = nextDay(args.end_date);
            query = query.filter((q) => q.lt(q.field("timestamp"), beforeDate));
        }

        let allLogs = await query.collect();

        const nameNeedle = args.performed_by_name?.trim().toLowerCase();
        if (nameNeedle) {
            allLogs = allLogs.filter((log) =>
                (log.performed_by_name ?? "").toLowerCase().includes(nameNeedle),
            );
        }

        // Apply pagination
        const limit = args.limit || 50;
        const offset = args.offset || 0;
        const paginatedLogs = allLogs.slice(offset, offset + limit);

        return {
            logs: paginatedLogs,
            total: allLogs.length,
            hasMore: offset + limit < allLogs.length,
        };
    },
});

// Get audit log by ID
export const getAuditLogById = query({
    args: { id: v.id("audit_logs") },
    handler: async (ctx, args) => {
        const { user, orgId } = await requireAuditReader(ctx);
        const log = await ctx.db.get(args.id);
        if (!log) return null;
        if (isSuperAdmin(user) && !orgId) return log;
        if (!log.organization_id) return null;
        if (log.organization_id !== orgId) {
            // Org admins may also read their descendant orgs' trails.
            await resolveOrgId(ctx, log.organization_id);
        }
        return log;
    },
});

// Get audit logs for a specific entity
export const getEntityAuditLogs = query({
    args: {
        entity_type: v.string(),
        entity_id: v.string(),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const { orgId } = await requireAuditReader(ctx);
        const limit = args.limit || 20;

        let query = ctx.db
            .query("audit_logs")
            .withIndex("by_entity", (q) =>
                q.eq("entity_type", args.entity_type).eq("entity_id", args.entity_id)
            )
            .order("desc");
        if (orgId) {
            query = query.filter((q) => q.eq(q.field("organization_id"), orgId));
        }

        return await query.take(limit);
    },
});

// Get recent audit logs for an organization
export const getRecentAuditLogs = query({
    args: {
        organization_id: v.optional(v.id("organizations")),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const { orgId } = await requireAuditReader(ctx, args.organization_id);
        const limit = args.limit || 10;
        return await orgLogsQuery(ctx, orgId).take(limit);
    },
});

// Get distinct action types for filtering (the caller's org only)
export const getActionTypes = query({
    args: { organization_id: v.optional(v.id("organizations")) },
    handler: async (ctx, args) => {
        const { orgId } = await requireAuditReader(ctx, args.organization_id);
        const logs = await orgLogsQuery(ctx, orgId).collect();
        const actionTypes = [...new Set(logs.map((log) => log.action))];
        return actionTypes.sort();
    },
});

// Get distinct entity types for filtering (the caller's org only)
export const getEntityTypes = query({
    args: { organization_id: v.optional(v.id("organizations")) },
    handler: async (ctx, args) => {
        const { orgId } = await requireAuditReader(ctx, args.organization_id);
        const logs = await orgLogsQuery(ctx, orgId).collect();
        const entityTypes = [...new Set(logs.map((log) => log.entity_type))];
        return entityTypes.sort();
    },
});

// Delete old audit logs (for cleanup/maintenance). Internal only: a public
// mutation here let anyone, signed in or not, wipe every church's audit trail.
export const deleteOldAuditLogs = internalMutation({
    args: {
        older_than: v.string(), // ISO timestamp
    },
    handler: async (ctx, args) => {
        const oldLogs = await ctx.db
            .query("audit_logs")
            .withIndex("by_timestamp", (q) => q.lt("timestamp", args.older_than))
            .collect();

        for (const log of oldLogs) {
            await ctx.db.delete(log._id);
        }

        return { deleted: oldLogs.length };
    },
});
