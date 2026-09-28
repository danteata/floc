
import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { requireIdentity, requireOrgAdmin, requireOrgAccess, requireSuperAdmin, requireUser, resolveOrgId } from "./auth";
import { getUnitIdsAdministeredBy, addUnitAdminInternal, removeUnitAdminInternal } from "./unit_admins";
import { Id } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";

export const store = mutation({
    args: { invitationToken: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Called storeUser without authentication present");

        const findInvitation = async () => {
            let invitation = null;

            if (args.invitationToken) {
                const token = args.invitationToken;
                invitation = await ctx.db
                    .query("invitations")
                    .withIndex("by_token", (q) => q.eq("invitation_token", token))
                    .filter((q) => q.eq(q.field("status"), "pending"))
                    .first();

                if (invitation && invitation.expires_at && invitation.expires_at < Date.now()) {
                    invitation = null;
                }
            }

            if (!invitation && identity.email) {
                const email = identity.email;
                invitation = await ctx.db
                    .query("invitations")
                    .withIndex("by_email", (q) => q.eq("email", email))
                    .filter((q) => q.eq(q.field("status"), "pending"))
                    .first();

                if (invitation && invitation.expires_at && invitation.expires_at < Date.now()) {
                    invitation = null;
                }
            }

            return invitation;
        };

        // Check if user exists
        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerk_user_id", identity.subject))
            .unique();

        if (user !== null) {
            // Update name/email if changed, but preserve organization_id and role
            const resolvedName = identity.name || identity.nickname || identity.email || "Member";
            if (user.name !== resolvedName || user.email !== identity.email) {
                await ctx.db.patch(user._id, { name: resolvedName, email: identity.email });
            }

            // If user already exists but has no organization, attempt to apply invitation
            if (!user.organization_id) {
                const invitation = await findInvitation();
                if (invitation) {
                    await ctx.db.patch(user._id, {
                        role: invitation.intended_role,
                        organization_id: invitation.organization_id,
                    });

                    if (invitation.member_id) {
                        await ctx.db.patch(invitation.member_id, {
                            user_id: user._id,
                            email: identity.email
                        });

                        if (invitation.intended_units) {
                            for (const unitId of invitation.intended_units) {
                                const uId = ctx.db.normalizeId("units", unitId);
                                if (uId) {
                                    const unit = await ctx.db.get(uId);
                                    if (unit && unit.organization_id === invitation.organization_id) {
                                        await addUnitAdminInternal(ctx, {
                                            unitId: uId,
                                            memberId: invitation.member_id,
                                            organizationId: invitation.organization_id,
                                            addedBy: invitation.invited_by,
                                        });
                                    }
                                }
                            }
                        }
                    }

                    await ctx.db.patch(invitation._id, { status: "accepted" });
                }
            }
            return user._id;
        }

        // Check if this is the first user
        const anyUser = await ctx.db.query("users").first();
        const isFirstUser = !anyUser;

        // Check for pending invitation by token (preferred) or email (fallback)
        const invitation = await findInvitation();

        // Determine role and organization_id
        let role = isFirstUser ? "super_admin" : "member";
        let organization_id: Id<"organizations"> | undefined = undefined;

        if (invitation) {
            role = invitation.intended_role;
            organization_id = invitation.organization_id;
            console.log(`Found pending invitation, applying role: ${role}, org: ${organization_id}`);
        }

        const resolvedName = identity.name || identity.nickname || identity.email || "Member";
        const userId = await ctx.db.insert("users", {
            clerk_user_id: identity.subject,
            name: resolvedName,
            email: identity.email,
            role: role,
            organization_id: organization_id,
            active: true,
        });

        // If invitation found, mark as accepted and apply settings
        if (invitation) {
            // Update member record if linked
            if (invitation.member_id) {
                await ctx.db.patch(invitation.member_id, {
                    user_id: userId,
                    email: identity.email
                });

                // Apply leadership if units provided
                if (invitation.intended_units) {
                    for (const unitId of invitation.intended_units) {
                        const uId = ctx.db.normalizeId("units", unitId);
                        if (uId) {
                            const unit = await ctx.db.get(uId);
                            if (unit && unit.organization_id === invitation.organization_id) {
                                await addUnitAdminInternal(ctx, {
                                    unitId: uId,
                                    memberId: invitation.member_id,
                                    organizationId: invitation.organization_id,
                                    addedBy: invitation.invited_by,
                                });
                            }
                        }
                    }
                }
            }

            // Mark invitation as accepted
            await ctx.db.patch(invitation._id, { status: "accepted" });
            console.log(`Auto-accepted invitation ${invitation._id} for user ${userId}`);
        }

        // Try to link existing member by email
        if (identity.email) {
            const member = await ctx.db
                .query("members")
                .withIndex("by_email", (q) => q.eq("email", identity.email!))
                .first();

            if (member && !member.user_id) {
                await ctx.db.patch(member._id, { user_id: userId });
            }
        }

        return userId;
    },
});

// Internal: resolve a user by email (used by the Paystack webhook to map a
// billing email back to an organization). Returns null when no user matches.
export const getUserByEmail = internalQuery({
    args: { email: v.string() },
    handler: async (ctx, args) => {
        const email = args.email.toLowerCase()
        return await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", email))
            .unique()
    },
})

// Internal: resolve a user by Clerk id. Actions have no `ctx.db` (only
// queries/mutations do), so any action that needs the signed-in user's row
// (e.g. Paystack checkout, which needs organization_id) must go through this
// via ctx.runQuery instead of calling a db-touching helper directly.
export const getUserByClerkId = internalQuery({
    args: { clerkUserId: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerk_user_id", args.clerkUserId))
            .unique()
    },
})

export const getRole = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return null;

        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerk_user_id", identity.subject))
            .unique();

        return user?.role || null;
    },
});

export const current = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return null;

        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerk_user_id", identity.subject))
            .unique();

        if (!user) return null;

        // Find linked member by user_id first, then fallback to email (for transition)
        let member = await ctx.db
            .query("members")
            .withIndex("by_user_id", (q) => q.eq("user_id", user._id))
            .first();

        if (!member) {
            member = await ctx.db
                .query("members")
                .withIndex("by_email", (q) => q.eq("email", user.email))
                .first();
        }

        // Get leadership roles
        let unitLeaderships: any[] = [];

        if (member) {
            // Units this member administers (primary leader or additional admin)
            const adminUnitIds = await getUnitIdsAdministeredBy(ctx, member._id);
            const units = await Promise.all(adminUnitIds.map((id) => ctx.db.get(id)));
            unitLeaderships = units.filter((u): u is NonNullable<typeof u> => u !== null);
        }

        return {
            ...user,
            unitLeaderships
        };
    }
});

export const syncUser = mutation({
    args: {
        email: v.string(),
        name: v.optional(v.string()),
        clerk_user_id: v.string()
    },
    handler: async (ctx, args) => {
        const identity = await requireIdentity(ctx);
        if (identity.subject !== args.clerk_user_id) {
            throw new Error("Forbidden");
        }
        if (identity.email && identity.email !== args.email) {
            throw new Error("Email mismatch");
        }

        const existing = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", q => q.eq("clerk_user_id", args.clerk_user_id))
            .first();

        if (existing) {
            await ctx.db.patch(existing._id, {
                email: args.email,
                name: args.name || existing.name
            });
            return existing;
        } else {
            const newId = await ctx.db.insert("users", {
                clerk_user_id: args.clerk_user_id,
                email: args.email,
                name: args.name,
                role: 'member', // Default
                active: true
            });
            return await ctx.db.get(newId);
        }
    }
});

export const list = query({
    args: {},
    handler: async (ctx) => {
        const user = await requireOrgAdmin(ctx);
        if (user.role === "super_admin") {
            return await ctx.db.query("users").order("desc").collect();
        }

        const orgId = await resolveOrgId(ctx);
        if (!orgId) return [];
        return await ctx.db
            .query("users")
            .filter((q) => q.eq(q.field("organization_id"), orgId))
            .order("desc")
            .collect();
    }
});

export const updateRole = mutation({
    args: { id: v.id("users"), role: v.string() },
    handler: async (ctx, args) => {
        const user = await requireOrgAdmin(ctx);
        const target = await ctx.db.get(args.id);
        if (!target) throw new Error("User not found");

        // Keep in step with the roles in permissions.ts.
        const allowedRoles = new Set([
            "super_admin",
            "organization_admin",
            "admin",
            "division_admin",
            "unit_admin",
            "sub_unit_admin",
            "treasurer",
            "member",
        ]);
        if (!allowedRoles.has(args.role)) throw new Error("Invalid role");

        // Nobody changes their own role (an admin could lock themselves out).
        if (target._id === user._id) throw new Error("You can't change your own role");

        if (user.role !== "super_admin") {
            const orgId = await resolveOrgId(ctx);
            if (!orgId || target.organization_id !== orgId) throw new Error("Forbidden");
            if (args.role === "super_admin") throw new Error("Only a super admin can make someone a super admin");
            if (target.role === "super_admin") throw new Error("Only a super admin can change a super admin's role");
        }

        const previousRole = target.role;
        await ctx.db.patch(args.id, { role: args.role });

        // A plain member leads no units: drop any unit-admin access their
        // member profile still has, so the role and their access agree.
        const removedUnitIds: Id<"units">[] = [];
        if (args.role === "member" && previousRole !== "member") {
            const linkedMembers = await ctx.db
                .query("members")
                .withIndex("by_user_id", (q) => q.eq("user_id", args.id))
                .collect();
            for (const m of linkedMembers) {
                const rows = await ctx.db
                    .query("unit_admins")
                    .withIndex("by_member", (q) => q.eq("member_id", m._id))
                    .collect();
                for (const row of rows) {
                    await removeUnitAdminInternal(ctx, { unitId: row.unit_id, memberId: m._id });
                    removedUnitIds.push(row.unit_id);
                }
            }
        }

        // Audit log for role change
        const normalizedOrgId = target.organization_id ? ctx.db.normalizeId("organizations", target.organization_id) : null;
        await ctx.runMutation(internal.audit.logEvent, {
            action: "user.role_changed",
            entity_type: "user",
            entity_id: args.id,
            entity_name: target.name || target.email,
            performed_by: user.clerk_user_id,
            performed_by_name: user.name || user.email || "Unknown",
            performed_by_role: user.role,
            organization_id: normalizedOrgId || undefined,
            changes: {
                role: {
                    before: previousRole,
                    after: args.role
                },
                ...(removedUnitIds.length > 0 ? { unit_admin_removed: removedUnitIds } : {}),
            },
        });
    }
});

// Deactivate or reactivate a user account (reversible). Deactivated users can
// no longer use the app (requireUser rejects inactive accounts).
export const setActive = mutation({
    args: { id: v.id("users"), active: v.boolean() },
    handler: async (ctx, args) => {
        const actor = await requireOrgAdmin(ctx);
        const target = await ctx.db.get(args.id);
        if (!target) throw new Error("User not found");
        if (target._id === actor._id) throw new Error("You cannot change your own account status");

        if (actor.role !== "super_admin") {
            const orgId = await resolveOrgId(ctx);
            if (!orgId || target.organization_id !== orgId) throw new Error("Forbidden");
            if (target.role === "super_admin") throw new Error("Forbidden");
        }

        await ctx.db.patch(args.id, { active: args.active });

        await ctx.runMutation(internal.audit.logEvent, {
            action: args.active ? "user.reactivated" : "user.deactivated",
            entity_type: "user",
            entity_id: args.id,
            entity_name: target.name || target.email,
            performed_by: actor.clerk_user_id,
            performed_by_name: actor.name || actor.email || "Unknown",
            performed_by_role: actor.role,
            organization_id: target.organization_id ? ctx.db.normalizeId("organizations", target.organization_id) || undefined : undefined,
            changes: { active: { before: target.active, after: args.active } },
        });
    },
});

// Permanently remove a user account. The linked member profile (if any) is
// unlinked but preserved, so church membership data isn't lost.
export const remove = mutation({
    args: { id: v.id("users") },
    handler: async (ctx, args) => {
        const actor = await requireOrgAdmin(ctx);
        const target = await ctx.db.get(args.id);
        if (!target) throw new Error("User not found");
        if (target._id === actor._id) throw new Error("You cannot remove your own account");

        if (actor.role !== "super_admin") {
            const orgId = await resolveOrgId(ctx);
            if (!orgId || target.organization_id !== orgId) throw new Error("Forbidden");
            if (target.role === "super_admin") throw new Error("Forbidden");
        }

        // Unlink any member profiles that pointed at this account (keep the member).
        const linkedMembers = await ctx.db
            .query("members")
            .withIndex("by_user_id", (q) => q.eq("user_id", args.id))
            .collect();
        for (const m of linkedMembers) {
            await ctx.db.patch(m._id, { user_id: undefined });
        }

        await ctx.db.delete(args.id);

        await ctx.runMutation(internal.audit.logEvent, {
            action: "user.removed",
            entity_type: "user",
            entity_id: args.id,
            entity_name: target.name || target.email,
            performed_by: actor.clerk_user_id,
            performed_by_name: actor.name || actor.email || "Unknown",
            performed_by_role: actor.role,
            organization_id: target.organization_id ? ctx.db.normalizeId("organizations", target.organization_id) || undefined : undefined,
            changes: { removed_user: { name: target.name, email: target.email, role: target.role } },
        });
    },
});

export const switchOrganization = mutation({
    args: { organization_id: v.string() },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx);
        const orgId = ctx.db.normalizeId("organizations", args.organization_id);
        if (!orgId) throw new Error("Invalid organization");

        if (user.role !== "super_admin") {
            const userOrg = ctx.db.normalizeId("organizations", user.organization_id as string);
            if (!userOrg || userOrg !== orgId) {
                throw new Error("Forbidden");
            }
        }

        await ctx.db.patch(user._id, {
            organization_id: orgId,
        });
    },
});

// Browse into another org's data without changing the caller's home
// `organization_id` — e.g. a parent-org admin viewing one of their
// sub-organizations. Pass `organization_id: null` to return to the home org.
// `requireOrgAccess` enforces the same boundary as every other query: the
// caller's own org, any descendant if they're org-admin-tier, or any org for
// super_admin.
export const setViewingOrganization = mutation({
    args: { organization_id: v.union(v.id("organizations"), v.null()) },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx);

        if (args.organization_id === null) {
            await ctx.db.patch(user._id, { viewing_organization_id: undefined });
            return true;
        }

        await requireOrgAccess(ctx, args.organization_id);
        await ctx.db.patch(user._id, {
            viewing_organization_id: args.organization_id,
        });
        return true;
    },
});

// Maintenance-only: restore a user's role from the CLI when it was changed
// incorrectly (e.g. an admin who accidentally consumed someone else's invite
// link before the email guard existed). Internal — not exposed to clients.
// Run: npx convex run users:adminRestoreRole '{"email":"you@example.com","role":"super_admin"}'
export const adminRestoreRole = internalMutation({
    args: {
        email: v.optional(v.string()),
        clerk_user_id: v.optional(v.string()),
        role: v.string(),
    },
    handler: async (ctx, args) => {
        let user = null;
        if (args.clerk_user_id) {
            const clerkId = args.clerk_user_id;
            user = await ctx.db
                .query("users")
                .withIndex("by_clerk_id", (q) => q.eq("clerk_user_id", clerkId))
                .first();
        }
        if (!user && args.email) {
            const target = args.email.trim().toLowerCase();
            const all = await ctx.db.query("users").collect();
            user = all.find((u) => (u.email || "").trim().toLowerCase() === target) || null;
        }
        if (!user) throw new Error("User not found");

        const before = user.role;
        await ctx.db.patch(user._id, { role: args.role });
        return { user_id: user._id, email: user.email, before, after: args.role };
    },
});

export const migrateMemberLinks = mutation({
    args: {},
    handler: async (ctx) => {
        await requireSuperAdmin(ctx);
        const users = await ctx.db.query("users").collect();
        let migratedCount = 0;

        for (const user of users) {
            const member = await ctx.db
                .query("members")
                .withIndex("by_email", q => q.eq("email", user.email))
                .first();

            if (member && !member.user_id) {
                await ctx.db.patch(member._id, { user_id: user._id });
                migratedCount++;
            }
        }

        return { migratedCount };
    }
});
