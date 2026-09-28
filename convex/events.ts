
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { requireOrgAccess, requireOrgAdmin, requireUser, resolveOrgId, isSuperAdmin } from "./auth";
import { requireWriteAccess, getAdministeredUnitIds } from "./scope";
import { api, internal } from "./_generated/api";

// Gate event writes by unit scope. Org-wide admins (getAdministeredUnitIds
// === "all") may touch any event. Unit-level admins may only write events
// whose event_type is scoped (via event_types.unit_ids) to a unit they
// administer — never org-wide event types, and never another unit's. Event
// READS stay org-wide on purpose: the calendar isn't sensitive and unit
// leaders need to see org-wide services. Call AFTER requireWriteAccess.
//
// The unit scope checked is the church's own version of the type: an event may
// be filed under the shared default, and once the church edits that default
// (e.g. scopes it to units) it gets its own copy with the same value (see
// event_types.update). `list` reports the same type's unit_ids as
// write_unit_ids so the page offers edit only where this allows it.
async function requireEventTypeWriteAccess(
    ctx: Parameters<typeof getAdministeredUnitIds>[0],
    eventTypeId: Id<"event_types"> | undefined,
    orgId: Id<"organizations"> | null | undefined,
) {
    const scope = await getAdministeredUnitIds(ctx);
    if (scope === "all") return;
    if (!eventTypeId) {
        throw new Error("Forbidden: unit admins cannot manage org-wide events");
    }
    const stored = await ctx.db.get(eventTypeId);
    let eventType = stored;
    if (stored && !stored.organization_id && orgId) {
        const churchCopy = await ctx.db
            .query("event_types")
            .withIndex("by_org_and_value", (q) =>
                q.eq("organization_id", orgId).eq("value", stored.value),
            )
            .first();
        if (churchCopy) eventType = churchCopy;
    }
    const unitIds = eventType?.unit_ids ?? [];
    if (unitIds.length === 0) {
        throw new Error("Forbidden: this event type is org-wide");
    }
    if (!unitIds.some((u) => scope.has(u))) {
        throw new Error("Forbidden: event type is outside your units");
    }
}

type EventTypeDoc = Doc<"event_types">;

/**
 * Resolve each event's type the way its church sees it. An event keeps the id
 * it was filed under, which may be the shared default; once the church edits
 * that default it gets its own copy with the same value (see
 * event_types.update), so the label, colour and time come from that copy.
 * Inactive copies still count, so a renamed-then-hidden type keeps its name.
 */
function makeEventTypeResolver(eventTypes: EventTypeDoc[]) {
    const byId = new Map(eventTypes.map((t) => [t._id, t]));
    const churchCopy = new Map<string, EventTypeDoc>();
    for (const t of eventTypes) {
        if (t.organization_id) churchCopy.set(`${t.organization_id}|${t.value}`, t);
    }
    return (event: { event_type_id?: Id<"event_types">; organization_id?: Id<"organizations"> }) => {
        if (!event.event_type_id) return { stored: undefined, shown: undefined };
        const stored = byId.get(event.event_type_id);
        if (!stored) return { stored: undefined, shown: undefined };
        const orgId = stored.organization_id ?? event.organization_id;
        const shown = (orgId && churchCopy.get(`${orgId}|${stored.value}`)) || stored;
        return { stored, shown };
    };
}

export const list = query({
    args: { organization_id: v.optional(v.id("organizations")) },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx);
        const orgId = isSuperAdmin(user) ? args.organization_id : await resolveOrgId(ctx, args.organization_id);

        const events = orgId
            ? await ctx.db
                .query("events")
                .filter(q => q.eq(q.field("organization_id"), orgId))
                .collect()
            : await ctx.db.query("events").collect();

        const eventTypes = await ctx.db.query("event_types").collect();
        const resolveType = makeEventTypeResolver(eventTypes);

        return events.map(event => {
            const { shown } = resolveType(event);
            return {
                ...event,
                event_type_label: event.event_type_id ? shown?.label : null,
                event_type_color: event.event_type_id ? shown?.color : 'default',
                event_type_value: event.event_type_id ? shown?.value : null,
                event_type_default_time: event.event_type_id ? shown?.default_time : null,
                // Units the church's version of the type is scoped to (empty = church-wide).
                event_type_unit_ids: shown?.unit_ids ?? [],
                // Units requireEventTypeWriteAccess checks (the church's
                // version of the type), so the page can show edit and delete
                // only to someone the server will allow.
                write_unit_ids: shown?.unit_ids ?? [],
            };
        });
    },
});

export const getByDate = query({
    args: {
        date: v.string(),
        organization_id: v.optional(v.id("organizations")),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx);
        const orgId = isSuperAdmin(user) ? args.organization_id : await resolveOrgId(ctx, args.organization_id);

        const events = await ctx.db
            .query("events")
            .withIndex("by_date", q => q.eq("date", args.date))
            .collect();

        const orgEvents = orgId
            ? events.filter(e => e.organization_id === orgId)
            : events;

        const eventTypes = await ctx.db.query("event_types").collect();
        const resolveType = makeEventTypeResolver(eventTypes);

        return orgEvents.map(event => {
            const { shown } = resolveType(event);
            return {
                ...event,
                id: event._id,
                event_type_label: event.event_type_id ? shown?.label : null,
                event_type_color: event.event_type_id ? shown?.color : 'default',
                event_type_value: event.event_type_id ? shown?.value : null,
            };
        });
    },
});

export const getById = query({
    args: { id: v.id("events") },
    handler: async (ctx, args) => {
        const event = await ctx.db.get(args.id);
        if (event?.organization_id) {
            await requireOrgAccess(ctx, event.organization_id);
        }
        return event;
    },
});

export const create = mutation({
    args: {
        title: v.string(),
        date: v.string(),
        description: v.optional(v.string()),
        event_type_id: v.optional(v.id("event_types")),
        time: v.optional(v.string()),
        location: v.optional(v.string()),
        organization_id: v.id("organizations"),
        active: v.boolean(),
    },
    handler: async (ctx, args) => {
        const user = await requireWriteAccess(ctx);
        const orgId = await resolveOrgId(ctx, args.organization_id);
        await requireEventTypeWriteAccess(ctx, args.event_type_id, orgId ?? args.organization_id);
        const eventId = await ctx.db.insert("events", {
            ...args,
            organization_id: orgId ?? args.organization_id,
        });

        // Log audit event
        await ctx.runMutation(internal.audit.logEvent, {
            action: "event.created",
            entity_type: "event",
            entity_id: eventId,
            entity_name: args.title,
            performed_by: user._id,
            performed_by_name: user.name || "Unknown",
            performed_by_role: user.role,
            organization_id: orgId ?? args.organization_id,
            changes: {
                title: args.title,
                date: args.date,
                time: args.time,
                location: args.location,
                description: args.description,
            },
        });

        return eventId;
    },
});

export const update = mutation({
    args: {
        id: v.id("events"),
        updates: v.object({
            title: v.optional(v.string()),
            date: v.optional(v.string()),
            description: v.optional(v.string()),
            event_type_id: v.optional(v.id("event_types")),
            time: v.optional(v.string()),
            location: v.optional(v.string()),
            active: v.optional(v.boolean()),
        }),
    },
    handler: async (ctx, args) => {
        const user = await requireWriteAccess(ctx);
        const event = await ctx.db.get(args.id);
        if (!event) throw new Error("Event not found");
        if (event.organization_id) {
            await requireOrgAccess(ctx, event.organization_id);
        }
        // A unit admin may only edit an event of a type they administer, and
        // may not move it onto a type outside their units.
        await requireEventTypeWriteAccess(ctx, event.event_type_id, event.organization_id);
        if (args.updates.event_type_id !== undefined) {
            await requireEventTypeWriteAccess(ctx, args.updates.event_type_id, event.organization_id);
        }

        // Capture changes for audit
        const changes: Record<string, any> = {};
        if (args.updates.title !== undefined && args.updates.title !== event.title) {
            changes.title = { from: event.title, to: args.updates.title };
        }
        if (args.updates.date !== undefined && args.updates.date !== event.date) {
            changes.date = { from: event.date, to: args.updates.date };
        }
        if (args.updates.time !== undefined && args.updates.time !== event.time) {
            changes.time = { from: event.time, to: args.updates.time };
        }
        if (args.updates.location !== undefined && args.updates.location !== event.location) {
            changes.location = { from: event.location, to: args.updates.location };
        }
        if (args.updates.description !== undefined && args.updates.description !== event.description) {
            changes.description = { from: event.description, to: args.updates.description };
        }
        if (args.updates.active !== undefined && args.updates.active !== event.active) {
            changes.active = { from: event.active, to: args.updates.active };
        }
        if (args.updates.event_type_id !== undefined && args.updates.event_type_id !== event.event_type_id) {
            changes.event_type_id = { from: event.event_type_id, to: args.updates.event_type_id };
        }

        await ctx.db.patch(args.id, args.updates);

        // The linked attendance record's event_type_id/date are only ever set
        // together with the event's at creation time (ensureAttendanceRecord)
        // — nothing previously kept them in sync afterward. Since member
        // attendance history/streak calculations read attendance.event_type_id
        // and attendance.date directly (never the linked event's own fields —
        // see getMemberSummary/computeStreak), editing an event here would
        // otherwise silently stop reflecting anywhere a member-facing view
        // actually looks, or worse, leave the attendance record's date
        // pointing at a different day than the event it's linked to.
        const eventTypeChanged =
            args.updates.event_type_id !== undefined && args.updates.event_type_id !== event.event_type_id;
        const dateChanged = args.updates.date !== undefined && args.updates.date !== event.date;
        if (eventTypeChanged || dateChanged) {
            const linkedAttendance = await ctx.db
                .query("attendance")
                .filter((q) => q.eq(q.field("event_id"), args.id))
                .first();
            if (linkedAttendance) {
                const attendancePatch: Record<string, unknown> = {};
                if (eventTypeChanged) attendancePatch.event_type_id = args.updates.event_type_id;
                if (dateChanged) attendancePatch.date = args.updates.date;
                await ctx.db.patch(linkedAttendance._id, attendancePatch);
            }
        }

        // Log audit event if there were changes
        if (Object.keys(changes).length > 0) {
            await ctx.runMutation(internal.audit.logEvent, {
                action: "event.updated",
                entity_type: "event",
                entity_id: args.id,
                entity_name: event.title,
                performed_by: user._id,
                performed_by_name: user.name || "Unknown",
                performed_by_role: user.role,
                organization_id: event.organization_id,
                changes,
            });
        }
    },
});

export const remove = mutation({
    args: { id: v.id("events") },
    handler: async (ctx, args) => {
        const user = await requireWriteAccess(ctx);
        const event = await ctx.db.get(args.id);
        if (!event) throw new Error("Event not found");
        if (event.organization_id) {
            await requireOrgAccess(ctx, event.organization_id);
        }
        await requireEventTypeWriteAccess(ctx, event.event_type_id, event.organization_id);

        // Block deletion once real attendance has been recorded against this
        // event — attendance/check-in history is more valuable than the
        // calendar entry, and events.remove has no cascade, so deleting
        // freely would silently orphan the event_id reference (harmless,
        // since nothing reads it back — see attendance.getMemberSummary/
        // check_ins.getMyAttendanceHistory, which only join to event_types)
        // but leaves the admin thinking they removed something they didn't.
        // An empty auto-created attendance shell (opened check-in, nobody
        // checked in yet) doesn't count — only a real headcount does.
        const attendanceRecords = await ctx.db
            .query("attendance")
            .filter((q) => q.eq(q.field("event_id"), args.id))
            .collect();
        for (const record of attendanceRecords) {
            if (record.count > 0) {
                throw new Error(
                    "This event already has attendance recorded against it and can't be deleted.",
                );
            }
            const anyMemberAttendance = await ctx.db
                .query("member_attendance")
                .withIndex("by_attendance", (q) => q.eq("attendance_id", record._id))
                .first();
            if (anyMemberAttendance) {
                throw new Error(
                    "This event already has attendance recorded against it and can't be deleted.",
                );
            }
        }

        // Log audit event before deletion
        await ctx.runMutation(internal.audit.logEvent, {
            action: "event.deleted",
            entity_type: "event",
            entity_id: args.id,
            entity_name: event.title,
            performed_by: user._id,
            performed_by_name: user.name || "Unknown",
            performed_by_role: user.role,
            organization_id: event.organization_id,
            changes: {
                deleted_event: {
                    title: event.title,
                    date: event.date,
                    time: event.time,
                    location: event.location,
                    description: event.description,
                }
            },
        });

        await ctx.db.delete(args.id);
    },
});
