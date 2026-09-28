import { describe, it, expect } from "vitest"
import type { Doc } from "../_generated/dataModel"
import type { FactContext, MemberFacts } from "./catalog"
import { isInRuleScope } from "./conditions"
import { queueRuleActions } from "./engine"

function memberFacts(overrides: Partial<MemberFacts> = {}): MemberFacts {
  return {
    id: "m1",
    name: "Ama Mensah",
    first_name: "Ama",
    status: "active",
    has_sms: false,
    has_email: false,
    unit_ids: ["unitA"],
    label_ids: [],
    ...overrides,
  }
}

function rule(overrides: Partial<Doc<"automation_rules">> = {}): Doc<"automation_rules"> {
  return {
    _id: "r1",
    _creationTime: 0,
    organization_id: "o1",
    name: "Birthday greeting",
    trigger_key: "member.birthday",
    actions: [{ key: "send_in_app", params: { title: "Hi", template: "Hi {{member.first_name}}" } }],
    status: "enabled",
    created_by: "user_1",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as unknown as Doc<"automation_rules">
}

describe("isInRuleScope", () => {
  it("applies a rule with no unit limit to every active member", () => {
    expect(isInRuleScope({}, memberFacts())).toBe(true)
    expect(isInRuleScope({ unit_ids: [] }, memberFacts({ unit_ids: [] }))).toBe(true)
  })

  it("applies a unit-limited rule only to members of those units", () => {
    expect(isInRuleScope({ unit_ids: ["unitA", "unitB"] }, memberFacts({ unit_ids: ["unitB"] }))).toBe(true)
    expect(isInRuleScope({ unit_ids: ["unitB"] }, memberFacts({ unit_ids: ["unitA"] }))).toBe(false)
    expect(isInRuleScope({ unit_ids: ["unitB"] }, memberFacts({ unit_ids: [] }))).toBe(false)
  })

  it("fails closed for a unit-limited rule with no member", () => {
    expect(isInRuleScope({ unit_ids: ["unitA"] }, undefined)).toBe(false)
    expect(isInRuleScope({}, undefined)).toBe(true)
  })

  it("never applies to archived members", () => {
    expect(isInRuleScope({}, memberFacts({ archived: true }))).toBe(false)
    expect(isInRuleScope({ unit_ids: ["unitA"] }, memberFacts({ archived: true }))).toBe(false)
  })
})

describe("queueRuleActions (simulate)", () => {
  // Simulate never touches the database, so no ctx is needed.
  const ctx = {} as Parameters<typeof queueRuleActions>[0]
  const facts = (m: MemberFacts): FactContext => ({ org: { id: "o1", name: "Grace Chapel" }, member: m })

  it("matches a member inside the rule's units", async () => {
    const r = await queueRuleActions(ctx, {
      rule: rule({ unit_ids: ["unitA"] as never }),
      facts: facts(memberFacts()),
      source: "simulate",
      simulate: true,
    })
    expect(r.matched).toBe(true)
    expect(r.preview?.[0]?.text).toBe("Hi Ama")
  })

  it("skips a member outside the rule's units", async () => {
    const r = await queueRuleActions(ctx, {
      rule: rule({ unit_ids: ["unitB"] as never }),
      facts: facts(memberFacts()),
      source: "simulate",
      simulate: true,
    })
    expect(r.matched).toBe(false)
  })

  it("skips archived members", async () => {
    const r = await queueRuleActions(ctx, {
      rule: rule(),
      facts: facts(memberFacts({ archived: true })),
      source: "simulate",
      simulate: true,
    })
    expect(r.matched).toBe(false)
  })
})
