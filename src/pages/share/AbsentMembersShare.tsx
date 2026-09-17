"use client"

import { useState, useMemo } from "react"
import { useParams } from "react-router-dom"
import { useQuery } from "convex/react"
import { Church, Phone, AlertTriangle, Download } from "lucide-react"
import { format } from "date-fns"
import { api } from "../../../convex/_generated/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MultiSelectFilter } from "@/components/multi-select-filter"
import { BrandProvider } from "@/components/brand-provider"

export default function AbsentMembersSharePage() {
  const { token } = useParams<{ token: string }>()
  const [unitFilter, setUnitFilter] = useState<string[]>([])

  const data = useQuery(api.absentShares.getByToken, token ? { token } : "skip")

  const filteredMembers = useMemo(() => {
    if (!data) return []
    if (unitFilter.length === 0) return data.members
    return data.members.filter((member) => member.unit_names.some((unit) => unitFilter.includes(unit)))
  }, [data, unitFilter])

  const handleExport = () => {
    if (filteredMembers.length === 0) return

    const headers = ["Name", "Phone", "Units", "Consecutive Absences"]
    const csvContent = [
      headers.join(","),
      ...filteredMembers.map((member) =>
        [
          `"${member.name}"`,
          `"${member.phone || ''}"`,
          `"${member.unit_names.join('; ') || 'None'}"`,
          member.consecutive_absences,
        ].join(",")
      ),
    ].join("\n")

    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `absent-members-${data?.event_type_label ?? "event"}-${data?.date ?? "export"}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  if (data === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (data === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-muted/30 px-4">
        <AlertTriangle className="h-10 w-10 text-muted-foreground" />
        <div className="text-center">
          <h1 className="text-xl font-medium">Link unavailable</h1>
          <p className="text-sm text-muted-foreground">
            This link is invalid, has expired, or has been revoked. Ask for a new link.
          </p>
        </div>
      </div>
    )
  }

  return (
    <BrandProvider brandHex={data.brand_hex}>
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center gap-2">
          <Church className="h-6 w-6 text-primary" />
          <span className="text-lg font-medium">{data.organization_name}</span>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>Absent Members</CardTitle>
                <CardDescription>
                  {data.event_type_label} &middot; {format(new Date(data.date), "PPP")}
                </CardDescription>
              </div>
              {filteredMembers.length > 0 && (
                <Button variant="outline" size="sm" onClick={handleExport}>
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.units.length > 0 && (
              <MultiSelectFilter
                title="Unit"
                options={data.units.map((unit) => ({ value: unit, label: unit }))}
                selected={unitFilter}
                onChange={setUnitFilter}
                className="w-full sm:w-[240px]"
              />
            )}

            {filteredMembers.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No absent members found.
              </p>
            ) : (
              <div className="divide-y rounded-lg border">
                {filteredMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between gap-4 p-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{member.name}</div>
                      {member.unit_names.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {member.unit_names.map((unit) => (
                            <Badge key={unit} variant="outline" className="text-xs">
                              {unit}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {member.consecutive_absences > 0 && (
                        <Badge
                          variant={member.consecutive_absences >= 3 ? "destructive" : "secondary"}
                        >
                          {member.consecutive_absences} in a row
                        </Badge>
                      )}
                      {member.phone ? (
                        <a
                          href={`tel:${member.phone}`}
                          className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                        >
                          <Phone className="h-3.5 w-3.5" />
                          {member.phone}
                        </a>
                      ) : (
                        <span className="text-sm text-muted-foreground">No phone</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Showing {filteredMembers.length} of {data.members.length} absent member{data.members.length !== 1 ? "s" : ""}
        </p>
      </div>
    </div>
    </BrandProvider>
  )
}
