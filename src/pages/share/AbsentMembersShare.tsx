"use client"

import { useState, useMemo } from "react"
import { useParams } from "react-router-dom"
import { useQuery } from "convex/react"
import { Church, Phone, AlertTriangle, Download, UserCheck } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { api } from "../../../convex/_generated/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MultiSelectFilter } from "@/components/multi-select-filter"
import { BrandProvider } from "@/components/brand-provider"
import { downloadCsv, slugForFilename, toCsv } from "@/lib/csv"
import { describeStatuses, formatDay, titleCase } from '@/lib/display'

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

    const label = slugForFilename(data?.event_type_label ?? "", "event")
    downloadCsv(
      `absent-members-${label}-${data?.date ?? "export"}.csv`,
      toCsv(
        ["Name", "Phone", "Units", "Consecutive absences"],
        filteredMembers.map((member) => [
          member.name,
          member.phone || "",
          member.unit_names.join("; ") || "None",
          member.consecutive_absences,
        ]),
      ),
    )
  }

  if (data === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-muted/30" role="status" aria-label="Loading">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (data === null) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-muted/30 px-4">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <div className="max-w-sm space-y-1 text-center">
          <h1 className="text-lg font-semibold">This link isn't working</h1>
          <p className="text-sm text-muted-foreground">
            It may have expired or been turned off. Ask the person who sent it for a new link.
          </p>
        </div>
      </div>
    )
  }

  const scopeText = [
    data.scope.unit_name ?? "All units",
    describeStatuses(data.scope.statuses),
    data.scope.min_consecutive ? `missed ${data.scope.min_consecutive} or more in a row` : null,
  ].filter(Boolean).join(" · ")
  // A link made for one unit is already that unit; offer the filter only when there is a choice.
  const showUnitFilter = !data.scope.unit_name && data.units.length > 1

  return (
    <BrandProvider brandHex={data.brand_hex}>
    <div className="min-h-dvh bg-muted/30 py-6 px-4 sm:py-8">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center gap-2">
          <Church className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate text-base font-semibold">{data.organization_name}</span>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-lg font-semibold">Who was missing</CardTitle>
                <CardDescription>
                  {[titleCase(data.event_type_label), formatDay(data.date)].filter(Boolean).join(" · ")}
                </CardDescription>
                <p className="mt-3 text-2xl font-semibold tabular-nums text-foreground">
                  {data.members.length} {data.members.length === 1 ? "person" : "people"}
                </p>
                <p className="text-sm text-muted-foreground">{scopeText}</p>
              </div>
              {filteredMembers.length > 0 && (
                <Button variant="outline" className="h-10" onClick={handleExport}>
                  <Download className="mr-2 h-4 w-4" />
                  Download CSV
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {showUnitFilter && (
              <MultiSelectFilter
                title="Unit"
                options={data.units.map((unit) => ({ value: unit, label: unit }))}
                selected={unitFilter}
                onChange={setUnitFilter}
                className="w-full sm:w-[240px]"
              />
            )}

            {filteredMembers.length === 0 ? (
              <EmptyState
                icon={UserCheck}
                title={!data.attendance_taken ? "Attendance hasn't been taken yet" : unitFilter.length > 0 ? "No one missing from these units" : "No one was missing"}
                description={!data.attendance_taken ? "This list fills in once attendance for this service is recorded." : unitFilter.length > 0 ? "Clear the unit filter to see everyone who was absent." : "Everyone on this list was there."}
                action={
                  unitFilter.length > 0 ? (
                    <Button variant="outline" className="h-10" onClick={() => setUnitFilter([])}>
                      Clear filter
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="divide-y rounded-lg border">
                {filteredMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{member.name}</div>
                      {member.unit_names.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {member.unit_names.map((unit) => (
                            <Badge key={unit} variant="outline">
                              {unit}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 sm:shrink-0">
                      {member.consecutive_absences > 0 && (
                        <Badge
                          variant={member.consecutive_absences >= 3 ? "destructive" : "secondary"}
                        >
                          Missed {member.consecutive_absences} in a row
                        </Badge>
                      )}
                      {member.phone ? (
                        <a
                          href={`tel:${member.phone}`}
                          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-primary hover:underline sm:min-h-0"
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

        {unitFilter.length > 0 && (
          <p className="text-center text-xs text-muted-foreground">
            Showing {filteredMembers.length} of {data.members.length}
          </p>
        )}
      </div>
    </div>
    </BrandProvider>
  )
}

