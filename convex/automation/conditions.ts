// =============================================================================
// Condition evaluator
//
// Evaluates a stored ConditionNode tree against a FactContext. Pure and
// deterministic — no DB access, no I/O. Unknown/disallowed field paths resolve
// to undefined and comparisons against undefined fail closed (return false), so
// a malformed rule never sends by accident.
// =============================================================================

import {
    ALLOWED_FIELDS,
    Comparator,
    ConditionNode,
    FactContext,
    MemberFacts,
} from "./catalog";

function resolveField(ctx: FactContext, path: string): unknown {
    if (!ALLOWED_FIELDS.includes(path)) return undefined;
    const [ns, key] = path.split(".");
    const scope = (ctx as any)[ns];
    if (scope == null) return undefined;
    return scope[key];
}

function compare(op: Comparator, left: unknown, right: string | number | boolean): boolean {
    if (left === undefined || left === null) return false;
    switch (op) {
        case "eq":
            return left === right;
        case "ne":
            return left !== right;
        case "lt":
            return typeof left === "number" && typeof right === "number" && left < right;
        case "lte":
            return typeof left === "number" && typeof right === "number" && left <= right;
        case "gt":
            return typeof left === "number" && typeof right === "number" && left > right;
        case "gte":
            return typeof left === "number" && typeof right === "number" && left >= right;
        default:
            return false;
    }
}

/**
 * Evaluate a condition tree. An undefined/empty condition means "no filter" →
 * always matches (the trigger itself already selected the subject).
 */
export function evaluateCondition(
    condition: ConditionNode | undefined | null,
    ctx: FactContext,
): boolean {
    if (!condition) return true;

    switch (condition.op) {
        case "and":
            return condition.children.every((c) => evaluateCondition(c, ctx));
        case "or":
            return condition.children.some((c) => evaluateCondition(c, ctx));
        case "not":
            return !evaluateCondition(condition.child, ctx);

        case "eq":
        case "ne":
        case "lt":
        case "lte":
        case "gt":
        case "gte":
            return compare(condition.op, resolveField(ctx, condition.field), condition.value);

        case "in":
        case "not_in": {
            const val = resolveField(ctx, condition.field);
            const inList =
                (typeof val === "string" || typeof val === "number") &&
                condition.value.includes(val as string | number);
            return condition.op === "in" ? inList : !inList;
        }

        case "has_label":
            return !!ctx.member?.label_ids.includes(condition.label_id);

        case "in_unit":
            return !!ctx.member?.unit_ids.some((u) => condition.unit_ids.includes(u));

        case "has_contact":
            if (condition.channel === "sms") return !!ctx.member?.has_sms;
            return !!ctx.member?.has_email;

        default:
            // Unknown operator → fail closed.
            return false;
    }
}

/**
 * Is the rule's subject in scope at all, before its trigger or condition tree is
 * looked at? Pure, shared by the scanner, event processing and simulate.
 * - Archived members are out of scope for every rule.
 * - A rule with unit_ids ("Limit to units") only applies to members in at
 *   least one of those units. With no member to check (an org-level event) it
 *   fails closed, so a unit-limited rule never fires for the whole church.
 */
export function isInRuleScope(
    rule: { unit_ids?: readonly string[] | null },
    member: Pick<MemberFacts, "unit_ids" | "archived"> | undefined | null,
): boolean {
    if (member?.archived) return false;
    const limitTo = rule.unit_ids ?? [];
    if (limitTo.length === 0) return true;
    if (!member) return false;
    return member.unit_ids.some((u) => limitTo.includes(u));
}
