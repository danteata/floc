"use client"

import { useMemo, useState } from "react"
import { useParams } from "react-router-dom"
import { useQuery } from "convex/react"
import { AlertTriangle, Church, Download, Mail, MapPin, Phone, Search, Users } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { api } from "../../../convex/_generated/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MultiSelectFilter } from "@/components/multi-select-filter"
import { BrandProvider } from "@/components/brand-provider"
import { downloadCsv, slugForFilename, todayStamp, toCsv } from "@/lib/csv"
import { formatDay } from '@/lib/display'

export default function MembersListSharePage() {
  const { token } = useParams<{ token: string }>()
  const [unitFilter, setUnitFilter] = useState<string[]>([])
  const [search, setSearch] = useState("")

  const data = useQuery(api.memberShares.getByToken, token ? { token } : "skip")

  const filteredMembers = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    return data.members.filter((member) => {
      if (unitFilter.length > 0 && !(member.unit_names ?? []).some((u) => unitFilter.includes(u))) {
        return false
      }
      if (!q) return true
      return (
        member.name.toLowerCase().includes(q) ||
        (member.phone ?? "").toLowerCase().includes(q) ||
        (member.email ?? "").toLowerCase().includes(q)
      )
    })
  }, [data, unitFilter, search])

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

  // The reader returns only the columns the link was created with.
  const shows = (column: (typeof data.columns)[number]) => data.columns.includes(column)

  // Built from `data.columns` for the same reason the reader projects by it:
  // a column the link was not created with is undefined on every row, so
  // emitting its header would hand the reader an empty field the link's owner
  // deliberately withheld. Name is unconditional: it is never optional.
  const handleExport = () => {
    if (filteredMembers.length === 0) return

    type Member = (typeof filteredMembers)[number]
    const optional: { column: (typeof data.columns)[number]; label: string; cell: (member: Member) => string }[] = [
      { column: "phone", label: "Phone", cell: (m) => m.phone ?? "" },
      { column: "email", label: "Email", cell: (m) => m.email ?? "" },
      { column: "status", label: "Status", cell: (m) => m.status ?? "" },
      { column: "units", label: "Units", cell: (m) => (m.unit_names ?? []).join("; ") },
      { column: "household", label: "Household", cell: (m) => m.household_name ?? "" },
      { column: "address", label: "Address", cell: (m) => m.address ?? "" },
      { column: "gender", label: "Gender", cell: (m) => m.gender ?? "" },
      { column: "joined_date", label: "Joined", cell: (m) => m.joined_date ?? "" },
    ]
    const included = optional.filter(({ column }) => shows(column))

    downloadCsv(
      `${slugForFilename(data.title, "member-list")}-${todayStamp()}.csv`,
      toCsv(
        ["Name", ...included.map(({ label }) => label)],
        filteredMembers.map((member) => [
          member.name,
          ...included.map(({ cell }) => cell(member)),
        ]),
      ),
    )
  }

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
                <CardTitle className="text-lg font-semibold break-words">{data.title}</CardTitle>
                {data.description && <CardDescription>{data.description}</CardDescription>}
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
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, phone or email…"
                  aria-label="Search this list"
                  className="h-11 pl-9 bg-background"
                />
              </div>
              {data.units.length > 0 && (
                <MultiSelectFilter
                  title="Unit"
                  options={data.units.map((unit) => ({ value: unit, label: unit }))}
                  selected={unitFilter}
                  onChange={setUnitFilter}
                  className="w-full sm:w-[220px]"
                />
              )}
            </div>

            {filteredMembers.length === 0 ? (
              <EmptyState
                icon={Users}
                title={search.trim() || unitFilter.length > 0 ? "No one matches" : "This list is empty"}
                description={search.trim() || unitFilter.length > 0 ? "Try a different name, or clear the search and filter." : "There's no one on this list yet."}
                action={
                  search.trim() || unitFilter.length > 0 ? (
                    <Button
                      variant="outline"
                      className="h-10"
                      onClick={() => {
                        setSearch("")
                        setUnitFilter([])
                      }}
                    >
                      Clear search
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="divide-y rounded-lg border">
                {filteredMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium break-words">{member.name}</span>
                        {shows("status") && member.status && (
                          <Badge variant="secondary" className="capitalize">
                            {member.status}
                          </Badge>
                        )}
                        {shows("gender") && member.gender && (
                          <span className="text-xs text-muted-foreground capitalize">
                            {member.gender}
                          </span>
                        )}
                      </div>
                      {shows("units") && (member.unit_names ?? []).length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {member.unit_names!.map((unit) => (
                            <Badge key={unit} variant="outline">
                              {unit}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {shows("household") && member.household_name && (
                        <div className="text-xs text-muted-foreground">{member.household_name}</div>
                      )}
                      {shows("address") && member.address && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{member.address}</span>
                        </div>
                      )}
                      {shows("joined_date") && member.joined_date && (
                        <div className="text-xs text-muted-foreground">
                          Joined {formatDay(member.joined_date)}
                        </div>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-col gap-1 sm:shrink-0 sm:items-end">
                      {shows("phone") &&
                        (member.phone ? (
                          <a
                            href={`tel:${member.phone}`}
                            className="inline-flex min-h-11 items-center gap-1.5 text-sm text-primary hover:underline sm:min-h-0"
                          >
                            <Phone className="h-3.5 w-3.5" />
                            {member.phone}
                          </a>
                        ) : (
                          <span className="text-sm text-muted-foreground">No phone</span>
                        ))}
                      {shows("email") && member.email && (
                        <a
                          href={`mailto:${member.email}`}
                          className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground hover:underline"
                        >
                          <Mail className="h-3 w-3 shrink-0" />
                          <span className="truncate">{member.email}</span>
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Showing {filteredMembers.length} of {data.members.length} {data.members.length === 1 ? "member" : "members"}
        </p>
      </div>
    </div>
    </BrandProvider>
  )
}

