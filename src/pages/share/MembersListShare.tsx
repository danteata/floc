"use client"

import { useMemo, useState } from "react"
import { useParams } from "react-router-dom"
import { useQuery } from "convex/react"
import { AlertTriangle, Church, Mail, MapPin, Phone, Search } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { MultiSelectFilter } from "@/components/multi-select-filter"
import { BrandProvider } from "@/components/brand-provider"

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

  // The reader returns only the columns the link was created with.
  const shows = (column: (typeof data.columns)[number]) => data.columns.includes(column)

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
            <CardTitle>{data.title}</CardTitle>
            {data.description && <CardDescription>{data.description}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search this list…"
                  className="pl-9 bg-background"
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
              <p className="py-8 text-center text-sm text-muted-foreground">No members found.</p>
            ) : (
              <div className="divide-y rounded-lg border">
                {filteredMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{member.name}</span>
                        {shows("status") && member.status && (
                          <Badge variant="secondary" className="text-xs capitalize">
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
                            <Badge key={unit} variant="outline" className="text-xs">
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
                          Joined {member.joined_date}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 shrink-0 sm:items-end">
                      {shows("phone") &&
                        (member.phone ? (
                          <a
                            href={`tel:${member.phone}`}
                            className="flex items-center gap-1.5 text-sm text-primary hover:underline"
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
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:underline"
                        >
                          <Mail className="h-3 w-3" />
                          {member.email}
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
          Showing {filteredMembers.length} of {data.members.length} member
          {data.members.length !== 1 ? "s" : ""}
        </p>
      </div>
    </div>
    </BrandProvider>
  )
}
