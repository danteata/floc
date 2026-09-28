import { describe, it, expect } from "vitest"
import {
  dayLabel,
  monthLabel,
  percentChange,
  recentMonths,
  recentWeekStarts,
  resolveToday,
  weekOnWeekChanges,
  shiftDay,
  weekBounds,
  weekStart,
} from "./weeks"

describe("weekStart", () => {
  it("treats a Sunday as the start of its own week", () => {
    expect(weekStart("2026-09-27")).toBe("2026-09-27") // Sunday
  })

  it("walks back to the Sunday for any other day", () => {
    expect(weekStart("2026-09-26")).toBe("2026-09-20") // Saturday
    expect(weekStart("2026-09-30")).toBe("2026-09-27") // Wednesday
  })

  it("crosses month and year boundaries", () => {
    expect(weekStart("2026-01-01")).toBe("2025-12-28")
  })
})

describe("weekBounds", () => {
  it("includes today when today is Sunday", () => {
    expect(weekBounds("2026-09-27")).toEqual({
      start: "2026-09-27",
      end: "2026-10-03",
      prevStart: "2026-09-20",
      prevEnd: "2026-09-26",
    })
  })
})

describe("recentWeekStarts", () => {
  it("returns every week, oldest first, ending with the current one", () => {
    expect(recentWeekStarts("2026-09-30", 3)).toEqual(["2026-09-13", "2026-09-20", "2026-09-27"])
  })
})

describe("recentMonths", () => {
  it("returns months oldest first, across a year boundary", () => {
    expect(recentMonths("2026-02-10", 3)).toEqual(["2025-12", "2026-01", "2026-02"])
  })
})

describe("labels and helpers", () => {
  it("formats days and months for chart axes", () => {
    expect(dayLabel("2026-09-27")).toBe("27 Sep")
    expect(monthLabel("2026-09")).toBe("Sep")
  })

  it("shifts days across DST-free calendar arithmetic", () => {
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28")
  })

  it("uses the client's day when valid, otherwise the server's", () => {
    expect(resolveToday("2026-09-27")).toBe("2026-09-27")
    expect(resolveToday("nonsense", new Date(2026, 8, 1))).toBe("2026-09-01")
    expect(resolveToday(undefined, new Date(2026, 8, 1))).toBe("2026-09-01")
  })

  it("has no percentage change without an earlier figure", () => {
    expect(percentChange(10, null)).toBeNull()
    expect(percentChange(10, 0)).toBeNull()
    expect(percentChange(15, 10)).toBe(50)
    expect(percentChange(9, 12)).toBe(-25)
  })
})

describe("weekOnWeekChanges", () => {
  it("skips weeks with no record and weeks after a zero", () => {
    const weeks = [
      { name: "a", count: 10, recorded: true },
      { name: "b", count: 0, recorded: false },
      { name: "c", count: 12, recorded: true },
      { name: "d", count: 15, recorded: true },
      { name: "e", count: 0, recorded: true },
      { name: "f", count: 5, recorded: true },
    ]
    expect(weekOnWeekChanges(weeks)).toEqual([
      { name: "d", growth: 25 },
      { name: "e", growth: -100 },
    ])
  })
})
