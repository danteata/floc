import { describe, it, expect } from "vitest"
import { isValidTimeZone, localDayBoundsIso, localDayIn, zonedTimeToUtcMs } from "./timezone"

describe("isValidTimeZone", () => {
  it("accepts IANA zones and rejects anything else", () => {
    expect(isValidTimeZone("Africa/Accra")).toBe(true)
    expect(isValidTimeZone("America/New_York")).toBe(true)
    expect(isValidTimeZone("UTC")).toBe(true)
    expect(isValidTimeZone("Mars/Olympus")).toBe(false)
    expect(isValidTimeZone("")).toBe(false)
  })
})

describe("zonedTimeToUtcMs", () => {
  it("is the naive UTC instant for UTC", () => {
    expect(zonedTimeToUtcMs("2026-09-27", "09:00", "UTC")).toBe(Date.parse("2026-09-27T09:00:00Z"))
  })
  it("applies the zone offset, DST included", () => {
    // Lagos is UTC+1 all year.
    expect(zonedTimeToUtcMs("2026-09-27", "09:00", "Africa/Lagos")).toBe(Date.parse("2026-09-27T08:00:00Z"))
    // New York is UTC-4 in September (EDT), UTC-5 in January (EST).
    expect(zonedTimeToUtcMs("2026-09-27", "09:00", "America/New_York")).toBe(Date.parse("2026-09-27T13:00:00Z"))
    expect(zonedTimeToUtcMs("2026-01-11", "09:00", "America/New_York")).toBe(Date.parse("2026-01-11T14:00:00Z"))
  })
  it("falls back to UTC for an unknown zone and NaN for bad input", () => {
    expect(zonedTimeToUtcMs("2026-09-27", "09:00", "Nope/Nowhere")).toBe(Date.parse("2026-09-27T09:00:00Z"))
    expect(Number.isNaN(zonedTimeToUtcMs("not-a-date", "09:00", "UTC"))).toBe(true)
  })
})

describe("localDayIn", () => {
  const instant = new Date("2026-09-28T02:30:00Z")
  it("is the UTC day without a zone", () => {
    expect(localDayIn(instant)).toBe("2026-09-28")
    expect(localDayIn(instant, "Africa/Accra")).toBe("2026-09-28")
  })
  it("is the local day in a zone behind UTC", () => {
    expect(localDayIn(instant, "America/Los_Angeles")).toBe("2026-09-27")
  })
})

describe("localDayBoundsIso", () => {
  it("is exactly the UTC day when no zone is set (Ghana unchanged)", () => {
    expect(localDayBoundsIso("2026-09-27")).toEqual({
      start: "2026-09-27T00:00:00.000Z",
      end: "2026-09-27T23:59:59.999Z",
    })
    expect(localDayBoundsIso("2026-09-27", "Africa/Accra")).toEqual({
      start: "2026-09-27T00:00:00.000Z",
      end: "2026-09-27T23:59:59.999Z",
    })
  })
  it("shifts to the church's local midnight", () => {
    expect(localDayBoundsIso("2026-09-27", "America/New_York")).toEqual({
      start: "2026-09-27T04:00:00.000Z",
      end: "2026-09-28T03:59:59.999Z",
    })
  })
  it("covers a 23-hour day when the clocks go forward", () => {
    // London springs forward on 29 Mar 2026.
    expect(localDayBoundsIso("2026-03-29", "Europe/London")).toEqual({
      start: "2026-03-29T00:00:00.000Z",
      end: "2026-03-29T22:59:59.999Z",
    })
  })
})
