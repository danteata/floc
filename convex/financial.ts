import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import {
    isOrgAdmin,
    isSuperAdmin,
    requireFinancialAccess,
    requireOrgAccess,
    requireOrgAdmin,
    requireSuperAdmin,
    requireUser,
    resolveOrgId,
} from "./auth";
import { getLinkedMember, resolveManagedMemberIds } from "./scope";
import { internal } from "./_generated/api";

// Categories that count as "giving" (member-attributed income), as opposed
// to generic income/expense bookkeeping. Mirrors src/lib/financial-utils.ts's
// TRANSACTION_CATEGORIES subset — keep both in sync if this list changes.
export const GIVING_CATEGORIES = ["tithe", "offering", "donation", "mission"] as const;

/** Positive, finite amounts only. No existing convention to reuse — this is
 *  the first amount validation anywhere in the codebase. */
function assertPositiveAmount(amount: number) {
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Amount must be a positive number.");
    }
}

/**
 * An amount for an audit line, in the church's own currency ("GHS 120.00").
 * The app's money formatter (src/lib/money.ts) is a React hook module the
 * backend can't import, so this prints the ISO code rather than a symbol.
 * GHS is the app-wide default when a church hasn't set one.
 */
async function describeAmount(
    ctx: { db: { get: (id: Id<"organizations">) => Promise<{ currency?: string } | null> } },
    orgId: Id<"organizations"> | undefined | null,
    amount: number,
): Promise<string> {
    const org = orgId ? await ctx.db.get(orgId) : null;
    const currency = org?.currency || "GHS";
    return `${currency} ${amount.toFixed(2)}`;
}

function isCompletedGivingRow(row: { type: string; category: string; status?: string }): boolean {
    return (
        row.type === "income" &&
        (GIVING_CATEGORIES as readonly string[]).includes(row.category) &&
        (row.status ?? "completed") === "completed"
    );
}

// --- Transactions ---

export const listTransactions = query({
    args: { organization_id: v.optional(v.id("organizations")) },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx);

        // super_admin: any org (or the whole table with no org filter).
        if (isSuperAdmin(user)) {
            if (args.organization_id) {
                return await ctx.db
                    .query("financial_transactions")
                    .withIndex("by_org", (q) => q.eq("organization_id", args.organization_id!))
                    .order("desc")
                    .collect();
            }
            return await ctx.db.query("financial_transactions").order("desc").collect();
        }

        const orgId = await resolveOrgId(ctx, args.organization_id);
        if (!orgId) return [];

        const orgTransactions = () =>
            ctx.db
                .query("financial_transactions")
                .withIndex("by_org", (q) => q.eq("organization_id", orgId))
                .order("desc")
                .collect();

        // Org admins and treasurers get the full org ledger (including
        // org-level rows with no member_id, e.g. expenses).
        if (isOrgAdmin(user) || user.role === "treasurer") {
            return await orgTransactions();
        }

        // Unit-level admins see only giving attributed to members within
        // their unit scope; org-level (member-less) rows stay hidden from
        // them. Everyone else (plain members) sees nothing here.
        const managed = await resolveManagedMemberIds(ctx);
        if (managed === "all" || managed === "org") return await orgTransactions();
        if (managed.size === 0) return [];
        const rows = await orgTransactions();
        return rows.filter((r) => r.member_id && managed.has(r.member_id));
    },
});

export const createTransaction = mutation({
    args: {
        type: v.string(),
        category: v.string(),
        amount: v.number(),
        description: v.string(),
        date: v.string(),
        payment_method: v.string(),
        member_id: v.optional(v.id("members")),
        member_name: v.optional(v.string()),
        event_id: v.optional(v.id("events")),
        event_name: v.optional(v.string()),
        recorded_by: v.string(),
        recorded_by_name: v.string(),
        notes: v.optional(v.string()),
        receipt_url: v.optional(v.string()),
        organization_id: v.optional(v.id("organizations")),
    },
    handler: async (ctx, args) => {
        assertPositiveAmount(args.amount);
        const user = await requireFinancialAccess(ctx);
        const orgId = await resolveOrgId(ctx, args.organization_id);
        const transactionId = await ctx.db.insert("financial_transactions", {
            ...args,
            organization_id: orgId ?? args.organization_id,
            recorded_by: user.clerk_user_id,
            recorded_by_name: user.name || args.recorded_by_name,
        });

        // Audit log for transaction creation
        await ctx.runMutation(internal.audit.logEvent, {
            action: "financial.transaction_created",
            entity_type: "financial_transaction",
            entity_id: transactionId,
            entity_name: `${args.type}: ${args.description} - ${await describeAmount(ctx, orgId ?? args.organization_id, args.amount)}`,
            performed_by: user.clerk_user_id,
            performed_by_name: user.name || args.recorded_by_name,
            performed_by_role: user.role,
            organization_id: orgId ?? args.organization_id,
            changes: {
                type: args.type,
                category: args.category,
                amount: args.amount,
                description: args.description,
                date: args.date,
                payment_method: args.payment_method,
            },
        });

        return transactionId;
    },
});

export const updateTransaction = mutation({
    args: {
        id: v.id("financial_transactions"),
        type: v.string(),
        category: v.string(),
        amount: v.number(),
        description: v.string(),
        date: v.string(),
        payment_method: v.string(),
        // null clears the link (the member or event was removed on edit);
        // leaving the field out keeps what is stored.
        member_id: v.optional(v.union(v.id("members"), v.null())),
        member_name: v.optional(v.union(v.string(), v.null())),
        event_id: v.optional(v.union(v.id("events"), v.null())),
        event_name: v.optional(v.union(v.string(), v.null())),
        notes: v.optional(v.string()),
        receipt_url: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        assertPositiveAmount(args.amount);
        const user = await requireFinancialAccess(ctx);
        const existing = await ctx.db.get(args.id);
        if (!existing) throw new Error("Transaction not found");
        if (existing.organization_id) {
            await requireOrgAccess(ctx, existing.organization_id);
        }
        if (existing.status === "voided") {
            throw new Error("Cannot edit a voided transaction.");
        }
        const { id, member_id, member_name, event_id, event_name, ...rest } = args;
        // A patch with an undefined field removes it, so null (clear) maps to
        // undefined and an absent field stays absent (keep).
        const data: Partial<Doc<"financial_transactions">> = { ...rest };
        if (member_id !== undefined) data.member_id = member_id ?? undefined;
        if (member_name !== undefined) data.member_name = member_name ?? undefined;
        if (event_id !== undefined) data.event_id = event_id ?? undefined;
        if (event_name !== undefined) data.event_name = event_name ?? undefined;

        // Track changes for audit log
        const changedFields: Record<string, { before: any; after: any }> = {};
        if (existing.type !== args.type) changedFields.type = { before: existing.type, after: args.type };
        if (existing.category !== args.category) changedFields.category = { before: existing.category, after: args.category };
        if (existing.amount !== args.amount) changedFields.amount = { before: existing.amount, after: args.amount };
        if (existing.description !== args.description) changedFields.description = { before: existing.description, after: args.description };
        if (existing.date !== args.date) changedFields.date = { before: existing.date, after: args.date };
        if (existing.payment_method !== args.payment_method) changedFields.payment_method = { before: existing.payment_method, after: args.payment_method };

        await ctx.db.patch(id, data);

        // Audit log for transaction update
        if (Object.keys(changedFields).length > 0) {
            await ctx.runMutation(internal.audit.logEvent, {
                action: "financial.transaction_updated",
                entity_type: "financial_transaction",
                entity_id: args.id,
                entity_name: `${args.type}: ${args.description} - ${await describeAmount(ctx, existing.organization_id, args.amount)}`,
                performed_by: user.clerk_user_id,
                performed_by_name: user.name || "Unknown",
                performed_by_role: user.role,
                organization_id: existing.organization_id,
                changes: changedFields,
            });
        }

        return id;
    },
});

/**
 * Hard delete — a rare escape hatch (e.g. a genuine test/mistaken entry with
 * no real money behind it), tightened to super_admin only. For anything that
 * represents real money once recorded, use voidTransaction instead: this
 * table has no reversal/void concept until now, and financial records should
 * never just disappear.
 */
export const removeTransaction = mutation({
    args: { id: v.id("financial_transactions") },
    handler: async (ctx, args) => {
        const user = await requireSuperAdmin(ctx);
        const existing = await ctx.db.get(args.id);
        if (!existing) throw new Error("Transaction not found");
        if (existing.organization_id) {
            await requireOrgAccess(ctx, existing.organization_id);
        }

        // Audit log for transaction deletion
        await ctx.runMutation(internal.audit.logEvent, {
            action: "financial.transaction_deleted",
            entity_type: "financial_transaction",
            entity_id: args.id,
            entity_name: `${existing.type}: ${existing.description} - ${await describeAmount(ctx, existing.organization_id, existing.amount)}`,
            performed_by: user.clerk_user_id,
            performed_by_name: user.name || "Unknown",
            performed_by_role: user.role,
            organization_id: existing.organization_id,
            changes: {
                deleted_transaction: {
                    type: existing.type,
                    category: existing.category,
                    amount: existing.amount,
                    description: existing.description,
                    date: existing.date,
                }
            },
        });

        await ctx.db.delete(args.id);
    },
});

/**
 * Void a transaction: keeps the row (audit-preserving) but marks it excluded
 * from ledger totals via `status: "voided"`. This is the normal way to
 * correct/reverse a financial record — org admins and treasurers both use
 * this day-to-day, unlike removeTransaction above.
 */
export const voidTransaction = mutation({
    args: { id: v.id("financial_transactions"), reason: v.string() },
    handler: async (ctx, args) => {
        const user = await requireFinancialAccess(ctx);
        const existing = await ctx.db.get(args.id);
        if (!existing) throw new Error("Transaction not found");
        if (existing.organization_id) {
            await requireOrgAccess(ctx, existing.organization_id);
        }
        if (existing.status === "voided") {
            throw new Error("Transaction is already voided.");
        }
        const reason = args.reason.trim();
        if (!reason) throw new Error("A reason is required to void a transaction.");

        await ctx.db.patch(args.id, {
            status: "voided",
            voided_at: new Date().toISOString(),
            voided_by: user.clerk_user_id,
            void_reason: reason,
        });

        await ctx.runMutation(internal.audit.logEvent, {
            action: "financial.transaction_voided",
            entity_type: "financial_transaction",
            entity_id: args.id,
            entity_name: `${existing.type}: ${existing.description} - ${await describeAmount(ctx, existing.organization_id, existing.amount)}`,
            performed_by: user.clerk_user_id,
            performed_by_name: user.name || "Unknown",
            performed_by_role: user.role,
            organization_id: existing.organization_id,
            changes: { void_reason: reason, previous_status: existing.status ?? "completed" },
        });
    },
});

// --- Member giving ---

/** A member's own completed giving history — powers the portal view. */
export const getMyGiving = query({
    args: {},
    handler: async (ctx) => {
        const user = await requireUser(ctx);
        const member = await getLinkedMember(ctx, user);
        if (!member) return [];
        const rows = await ctx.db
            .query("financial_transactions")
            .withIndex("by_member", (q) => q.eq("member_id", member._id))
            .order("desc")
            .collect();
        return rows.filter(isCompletedGivingRow);
    },
});

/**
 * A specific member's completed giving history. Org admins and treasurers may
 * view any member's; unit-level admins may view only members within their unit
 * scope. Everyone else is forbidden.
 */
export const listMemberGiving = query({
    args: { member_id: v.id("members") },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx);
        const member = await ctx.db.get(args.member_id);
        if (!member) return [];
        if (member.organization_id) {
            await requireOrgAccess(ctx, member.organization_id);
        }
        if (!isOrgAdmin(user) && user.role !== "treasurer") {
            const managed = await resolveManagedMemberIds(ctx);
            const inScope =
                managed === "all" ||
                managed === "org" ||
                (managed instanceof Set && managed.has(args.member_id));
            if (!inScope) throw new Error("Forbidden");
        }
        const rows = await ctx.db
            .query("financial_transactions")
            .withIndex("by_member", (q) => q.eq("member_id", args.member_id))
            .order("desc")
            .collect();
        return rows.filter(isCompletedGivingRow);
    },
});

// --- Online giving (Paystack) ---
//
// initializeGivingCheckout (convex/paystack.ts) inserts the pending row via
// createPendingGivingTransaction BEFORE calling Paystack, so there's always a
// local record even if the Paystack call itself fails. The webhook
// (convex/http.ts) then calls applyDonationEvent, which is idempotent by
// payment_reference — a retried webhook for an already-completed gift is a
// no-op, never a double-count.

export const createPendingGivingTransaction = internalMutation({
    args: {
        organization_id: v.id("organizations"),
        amount: v.number(),
        category: v.string(),
        member_id: v.optional(v.id("members")),
        member_name: v.optional(v.string()),
        giver_name: v.optional(v.string()),
        giver_email: v.optional(v.string()),
        giver_phone: v.optional(v.string()),
        notes: v.optional(v.string()),
        payment_reference: v.string(),
        recorded_by: v.string(),
        recorded_by_name: v.string(),
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert("financial_transactions", {
            type: "income",
            category: args.category,
            amount: args.amount,
            description: args.giver_name
                ? `Online gift from ${args.giver_name}`
                : "Online gift",
            date: new Date().toISOString().slice(0, 10),
            payment_method: "online",
            member_id: args.member_id,
            member_name: args.member_name,
            giver_name: args.giver_name,
            giver_email: args.giver_email,
            giver_phone: args.giver_phone,
            recorded_by: args.recorded_by,
            recorded_by_name: args.recorded_by_name,
            notes: args.notes,
            organization_id: args.organization_id,
            status: "pending",
            payment_reference: args.payment_reference,
        });
    },
});

export const markGivingTransactionFailed = internalMutation({
    args: { id: v.id("financial_transactions"), reason: v.string() },
    handler: async (ctx, args) => {
        const existing = await ctx.db.get(args.id);
        if (!existing) return;
        const note = `Checkout initialization failed: ${args.reason}`;
        await ctx.db.patch(args.id, {
            status: "failed",
            notes: existing.notes ? `${existing.notes}\n${note}` : note,
        });
    },
});

/**
 * Apply a donation webhook event. Idempotent by payment_reference: a Paystack
 * retry for an already-resolved (completed/failed) reference is a no-op, so
 * this is safe to call more than once for the same event. Never throws —
 * mirrors the webhook's "always 200, log anomalies instead of failing" contract.
 */
export const applyDonationEvent = internalMutation({
    args: {
        reference: v.string(),
        outcome: v.union(v.literal("success"), v.literal("failed")),
        chargedAmountMinorUnits: v.optional(v.number()),
        paidAt: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("financial_transactions")
            .withIndex("by_payment_reference", (q) => q.eq("payment_reference", args.reference))
            .first();

        if (!existing) {
            await ctx.runMutation(internal.audit.logEvent, {
                action: "financial.giving_webhook_unknown_reference",
                entity_type: "financial_transaction",
                entity_id: args.reference,
                performed_by: "paystack_webhook",
                performed_by_name: "Paystack",
                performed_by_role: "system",
                metadata: { reference: args.reference, outcome: args.outcome },
            });
            return;
        }

        // Idempotent: already resolved, a retried webhook is a no-op.
        if (existing.status === "completed" || existing.status === "failed") return;

        if (args.outcome === "failed") {
            await ctx.db.patch(existing._id, { status: "failed" });
            return;
        }

        // Paystack's reported charge is authoritative for what actually
        // moved; flag (never silently swallow) any mismatch against what we
        // initialized the checkout with.
        const chargedAmount =
            args.chargedAmountMinorUnits != null ? args.chargedAmountMinorUnits / 100 : existing.amount;
        if (Math.abs(chargedAmount - existing.amount) > 0.01) {
            await ctx.runMutation(internal.audit.logEvent, {
                action: "financial.giving_amount_mismatch",
                entity_type: "financial_transaction",
                entity_id: existing._id,
                performed_by: "paystack_webhook",
                performed_by_name: "Paystack",
                performed_by_role: "system",
                organization_id: existing.organization_id,
                changes: { initialized_amount: existing.amount, charged_amount: chargedAmount },
            });
        }

        await ctx.db.patch(existing._id, {
            status: "completed",
            amount: chargedAmount,
            date: (args.paidAt ?? new Date().toISOString()).slice(0, 10),
        });

        await ctx.runMutation(internal.audit.logEvent, {
            action: "financial.giving_confirmed",
            entity_type: "financial_transaction",
            entity_id: existing._id,
            entity_name: `${existing.category}: ${chargedAmount}`,
            performed_by: "paystack_webhook",
            performed_by_name: "Paystack",
            performed_by_role: "system",
            organization_id: existing.organization_id,
            changes: { amount: chargedAmount, status: "completed" },
        });
    },
});

// --- Service Summaries ---

export const listServiceSummaries = query({
    args: { organization_id: v.optional(v.id("organizations")) },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx);
        // Only a super admin with no church chosen sees every church's rows;
        // anyone else without a resolvable church sees none.
        if (isSuperAdmin(user) && !args.organization_id) {
            return await ctx.db.query("service_financial_summaries").order("desc").collect();
        }
        const orgId = isSuperAdmin(user) ? args.organization_id : await resolveOrgId(ctx, args.organization_id);
        if (!orgId) return [];
        return await ctx.db
            .query("service_financial_summaries")
            .withIndex("by_org", (q) => q.eq("organization_id", orgId))
            .order("desc")
            .collect();
    },
});

export const createServiceSummary = mutation({
    args: {
        service_date: v.string(),
        service_type: v.string(),
        service_name: v.optional(v.string()),
        event_id: v.optional(v.id("events")),
        total_attendance: v.number(),
        tithe_payers: v.number(),
        total_tithes: v.number(),
        total_offerings: v.number(),
        total_donations: v.number(),
        special_offerings: v.optional(v.number()),
        special_offering_description: v.optional(v.string()),
        tithes_cash: v.number(),
        tithes_electronic: v.number(),
        offerings_cash: v.number(),
        offerings_electronic: v.number(),
        donations_cash: v.number(),
        donations_electronic: v.number(),
        special_offerings_cash: v.optional(v.number()),
        special_offerings_electronic: v.optional(v.number()),
        currency: v.string(),
        recorded_by: v.string(),
        recorded_by_name: v.string(),
        witnessed_by: v.optional(v.string()),
        witnessed_by_name: v.optional(v.string()),
        notes: v.optional(v.string()),
        organization_id: v.optional(v.id("organizations")),
    },
    handler: async (ctx, args) => {
        const user = await requireOrgAdmin(ctx);
        const orgId = await resolveOrgId(ctx, args.organization_id);
        return await ctx.db.insert("service_financial_summaries", {
            ...args,
            organization_id: orgId ?? args.organization_id,
            recorded_by: user.clerk_user_id,
            recorded_by_name: user.name || args.recorded_by_name,
        });
    },
});

export const updateServiceSummary = mutation({
    args: {
        id: v.id("service_financial_summaries"),
        service_date: v.string(),
        service_type: v.string(),
        service_name: v.optional(v.string()),
        // null unlinks the event; leaving it out keeps what is stored.
        event_id: v.optional(v.union(v.id("events"), v.null())),
        total_attendance: v.number(),
        tithe_payers: v.number(),
        total_tithes: v.number(),
        total_offerings: v.number(),
        total_donations: v.number(),
        special_offerings: v.optional(v.number()),
        special_offering_description: v.optional(v.string()),
        tithes_cash: v.number(),
        tithes_electronic: v.number(),
        offerings_cash: v.number(),
        offerings_electronic: v.number(),
        donations_cash: v.number(),
        donations_electronic: v.number(),
        special_offerings_cash: v.optional(v.number()),
        special_offerings_electronic: v.optional(v.number()),
        currency: v.string(),
        witnessed_by: v.optional(v.string()),
        witnessed_by_name: v.optional(v.string()),
        notes: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await requireOrgAdmin(ctx);
        const existing = await ctx.db.get(args.id);
        if (!existing) throw new Error("Summary not found");
        if (existing.organization_id) {
            await requireOrgAccess(ctx, existing.organization_id);
        }
        const { id, event_id, ...rest } = args;
        const data: Partial<Doc<"service_financial_summaries">> = { ...rest };
        if (event_id !== undefined) data.event_id = event_id ?? undefined;
        await ctx.db.patch(id, data);
        return id;
    },
});

// --- Metadata Summaries ---

export const listMetadataSummaries = query({
    args: { organization_id: v.optional(v.id("organizations")) },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx);
        // Only a super admin with no church chosen sees every church's rows;
        // anyone else without a resolvable church sees none.
        if (isSuperAdmin(user) && !args.organization_id) {
            return await ctx.db.query("service_metadata_summaries").order("desc").collect();
        }
        const orgId = isSuperAdmin(user) ? args.organization_id : await resolveOrgId(ctx, args.organization_id);
        if (!orgId) return [];
        return await ctx.db
            .query("service_metadata_summaries")
            .withIndex("by_org", (q) => q.eq("organization_id", orgId))
            .order("desc")
            .collect();
    },
});

export const createMetadataSummary = mutation({
    args: {
        service_date: v.string(),
        service_type: v.string(),
        service_name: v.optional(v.string()),
        event_id: v.optional(v.id("events")),
        message_title: v.optional(v.string()),
        message_category: v.optional(v.string()),
        preacher_id: v.optional(v.id("members")),
        preacher_name: v.optional(v.string()),
        attendance_adults: v.number(),
        attendance_children: v.number(),
        attendance_total: v.number(),
        first_timers: v.number(),
        new_converts: v.number(),
        tithe_payers: v.number(),
        verified_by_id: v.optional(v.string()),
        verified_by_name: v.optional(v.string()),
        verification_date: v.optional(v.string()),
        notes: v.optional(v.string()),
        recorded_by: v.string(),
        recorded_by_name: v.string(),
        organization_id: v.optional(v.id("organizations")),
    },
    handler: async (ctx, args) => {
        const user = await requireOrgAdmin(ctx);
        const orgId = await resolveOrgId(ctx, args.organization_id);
        return await ctx.db.insert("service_metadata_summaries", {
            ...args,
            organization_id: orgId ?? args.organization_id,
            recorded_by: user.clerk_user_id,
            recorded_by_name: user.name || args.recorded_by_name,
        });
    },
});

export const updateMetadataSummary = mutation({
    args: {
        id: v.id("service_metadata_summaries"),
        service_date: v.string(),
        service_type: v.string(),
        service_name: v.optional(v.string()),
        event_id: v.optional(v.id("events")),
        message_title: v.optional(v.string()),
        message_category: v.optional(v.string()),
        preacher_id: v.optional(v.id("members")),
        preacher_name: v.optional(v.string()),
        attendance_adults: v.number(),
        attendance_children: v.number(),
        attendance_total: v.number(),
        first_timers: v.number(),
        new_converts: v.number(),
        tithe_payers: v.number(),
        verified_by_id: v.optional(v.string()),
        verified_by_name: v.optional(v.string()),
        verification_date: v.optional(v.string()),
        notes: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await requireOrgAdmin(ctx);
        const existing = await ctx.db.get(args.id);
        if (!existing) throw new Error("Summary not found");
        if (existing.organization_id) {
            await requireOrgAccess(ctx, existing.organization_id);
        }
        const { id, ...data } = args;
        await ctx.db.patch(id, data);
        return id;
    },
});
