import { describe, it, expect } from "vitest"
import { slugForFilename, toCsv } from "./csv"

describe("toCsv", () => {
  it("quotes every cell and doubles embedded quotes", () => {
    const csv = toCsv(["Name"], [['Ama "Maa" Mensah']])
    expect(csv).toBe('"Name"\r\n"Ama ""Maa"" Mensah"')
  })

  it("keeps a value containing a comma in one field", () => {
    const csv = toCsv(["Name", "Address"], [["Kwame Owusu", "12 Oxford St, Osu"]])
    expect(csv.split("\r\n")[1]).toBe('"Kwame Owusu","12 Oxford St, Osu"')
  })

  it("neutralises values a spreadsheet would evaluate as a formula", () => {
    // A phone number is the realistic case: "+233..." is otherwise evaluated
    // and arrives as a bare number with the leading + gone.
    const csv = toCsv(["Phone"], [["+233244000000"]])
    expect(csv.split("\r\n")[1]).toBe(`"'+233244000000"`)

    expect(toCsv(["X"], [["=1+1"]]).split("\r\n")[1]).toBe(`"'=1+1"`)
    expect(toCsv(["X"], [["@SUM(A1)"]]).split("\r\n")[1]).toBe(`"'@SUM(A1)"`)
  })

  it("leaves ordinary text untouched", () => {
    expect(toCsv(["X"], [["Ushering"]]).split("\r\n")[1]).toBe('"Ushering"')
  })

  it("renders null and undefined as empty fields", () => {
    expect(toCsv(["A", "B"], [[null, undefined]]).split("\r\n")[1]).toBe('"",""')
  })

  it("stringifies non-string cells", () => {
    expect(toCsv(["Absences"], [[3]]).split("\r\n")[1]).toBe('"3"')
  })
})

describe("slugForFilename", () => {
  it("reduces a title to a filesystem-safe slug", () => {
    expect(slugForFilename("Youth Ministry — Q1 List")).toBe("youth-ministry-q1-list")
  })

  it("falls back when nothing usable survives", () => {
    expect(slugForFilename("///", "member-list")).toBe("member-list")
    expect(slugForFilename("")).toBe("export")
  })
})
