"use client"

import { useState, useMemo, useEffect } from "react"
import { Download, Filter, Plus, Upload, Building2, Home, Tag, X, ShieldAlert, Search, Share2, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { useTerminology } from "@/hooks/use-terminology"
import { useQuery, useMutation, useConvex } from "convex/react"
import { useAnalytics } from "@/hooks/useAnalytics"
import { AnalyticsEventType } from "@/services/analytics/types"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MembersTable } from "@/components/members-table"
import { MemberDialog } from "@/components/member-dialog"
import { BulkUploadDialog } from "@/components/bulk-upload-dialog"
import { ShareMembersLinkDialog } from "@/components/share-members-link-dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Member } from "@/types/database"
import { cn } from "@/lib/utils"
import { useOrganization } from "@/hooks/use-organization"
import { useUserRole } from "@/hooks/use-user-role"
import { useToast } from "@/hooks/use-toast"
import { useSubscription } from "@/providers/SubscriptionProvider"
import { useFlag } from "@/hooks/use-flags"

interface MembersContentProps {
  view?: 'active' | 'archived'
  onViewChange?: (view: 'active' | 'archived') => void
}

// Sentinel household-filter value for "not in any household" — distinct from
// any real Id<"households"> so it can sit in the same string[] filter state.
const NO_HOUSEHOLD = "__none__"

const PAGE_SIZE = 50

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

export function MembersContent({ view = 'active', onViewChange }: MembersContentProps) {
  const { trackEvent } = useAnalytics()
  const [statusFilters, setStatusFilters] = useState<string[]>([])
  const [unitFilters, setUnitFilters] = useState<string[]>([])
  const [labelFilters, setLabelFilters] = useState<string[]>([])
  const [householdFilters, setHouseholdFilters] = useState<string[]>([])
  const [riskFilters, setRiskFilters] = useState<string[]>([])
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false)
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false)
  const [isShareOpen, setIsShareOpen] = useState(false)
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [searchInput, setSearchInput] = useState("")
  const search = useDebouncedValue(searchInput.trim(), 250)
  const [loadedCount, setLoadedCount] = useState(PAGE_SIZE)

  const { organization } = useOrganization()
  const convex = useConvex()
  const unitsData = useQuery(api.units.listByOrg, organization?._id ? { organization_id: organization._id } : "skip");
  const labelsData = useQuery(api.labels.list, {});
  const householdsData = useQuery(api.households.list, organization?._id ? { organization_id: organization._id } : "skip");
  const mergeDuplicates = useMutation(api.members.mergeDuplicatesByNamePhone)
  const { isAdmin } = useUserRole()
  const { toast } = useToast()
  const { isPro } = useSubscription()
  const canShareList = useFlag("release.member_list_share")

  // Households can include the "no household" sentinel; split it out so the
  // server receives real household ids plus a boolean.
  const householdIds = useMemo(
    () => householdFilters.filter(h => h !== NO_HOUSEHOLD),
    [householdFilters],
  )
  const noHousehold = householdFilters.includes(NO_HOUSEHOLD)

  // All facet filters are applied server-side (in members.listPage) across the
  // whole scoped set before slicing, so "Load more" grows the page over the
  // filtered result instead of forcing the user to load every page first.
  const filterKey = [
    organization?._id ?? "",
    view,
    search,
    [...statusFilters].sort().join(","),
    [...unitFilters].sort().join(","),
    [...labelFilters].sort().join(","),
    [...householdFilters].sort().join(","),
    [...riskFilters].sort().join(","),
  ].join("|")
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey)
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey)
    setLoadedCount(PAGE_SIZE)
    // A different result set means the checked rows may no longer be in it;
    // "Load more" deliberately doesn't change filterKey, so growing the page
    // keeps the selection.
    setSelectedMemberIds([])
  }

  const page = useQuery(
    api.members.listPage,
    organization?._id
      ? {
          organization_id: organization._id,
          filter: view,
          search: search || undefined,
          pageSize: loadedCount,
          statuses: statusFilters.length ? statusFilters : undefined,
          unit_ids: unitFilters.length ? (unitFilters as Id<"units">[]) : undefined,
          label_ids: labelFilters.length ? (labelFilters as Id<"labels">[]) : undefined,
          household_ids: householdIds.length ? (householdIds as Id<"households">[]) : undefined,
          no_household: noHousehold || undefined,
          risk_levels: riskFilters.length ? riskFilters : undefined,
        }
      : "skip",
  )

  // useQuery goes back to `undefined` while a bigger pageSize is in flight, so
  // "Load more" used to unmount the whole table mid-refetch. Hold on to the
  // last result for the same filters and keep rendering it — otherwise the
  // remount wipes row selection and the list jumps to a spinner.
  const [lastResult, setLastResult] = useState<{ key: string; data: NonNullable<typeof page> } | null>(null)
  if (page !== undefined && (lastResult?.data !== page || lastResult.key !== filterKey)) {
    setLastResult({ key: filterKey, data: page })
  }
  const shownPage = page ?? (lastResult?.key === filterKey ? lastResult.data : undefined)

  const isLoading = shownPage === undefined
  const isLoadingMore = page === undefined && shownPage !== undefined
  const isDone = shownPage?.isDone ?? true
  const totalCount = shownPage?.totalCount
  const filteredMembers = useMemo(() => (shownPage?.page ?? []) as unknown as Member[], [shownPage])

  // Filter helpers
  const addFilter = (setter: React.Dispatch<React.SetStateAction<string[]>>, value: string) =>
    setter(prev => (prev.includes(value) ? prev : [...prev, value]))
  const removeFilter = (setter: React.Dispatch<React.SetStateAction<string[]>>, value: string) =>
    setter(prev => prev.filter(v => v !== value))
  const resetFilters = () => {
    setStatusFilters([])
    setUnitFilters([])
    setLabelFilters([])
    setHouseholdFilters([])
    setRiskFilters([])
  }

  const unitName = (id: string) => unitsData?.find(u => u._id === id)?.name ?? id
  const labelName = (id: string) => (labelsData as any)?.find((l: any) => l._id === id)?.name ?? id
  const householdName = (id: string) =>
    id === NO_HOUSEHOLD ? "No household" : (householdsData?.find(h => h._id === id)?.name ?? id)
  const RISK_LABELS: Record<string, string> = { low: "Low risk", medium: "Medium risk", high: "High risk", new: "New member" }
  const riskLabel = (level: string) => RISK_LABELS[level] ?? level
  const activeFilterCount =
    statusFilters.length + unitFilters.length + labelFilters.length + householdFilters.length + riskFilters.length

  // Sentence describing the current filters, stored on a share link so the
  // public page can say what the list is ("Active · Unit: Youth").
  const filterSummary = useMemo(() => {
    const parts: string[] = [view === 'archived' ? "Archived" : "Active"]
    if (search) parts.push(`Search: "${search}"`)
    if (statusFilters.length) parts.push(`Status: ${statusFilters.join(", ")}`)
    if (unitFilters.length) parts.push(`Unit: ${unitFilters.map(unitName).join(", ")}`)
    if (labelFilters.length) parts.push(`Label: ${labelFilters.map(labelName).join(", ")}`)
    if (householdFilters.length) parts.push(`Household: ${householdFilters.map(householdName).join(", ")}`)
    if (riskFilters.length) parts.push(`Risk: ${riskFilters.map(riskLabel).join(", ")}`)
    return parts.join(" · ")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, search, statusFilters, unitFilters, labelFilters, householdFilters, riskFilters, unitsData, labelsData, householdsData])

  // Export the whole filtered result, not just the rows "Load more" happens to
  // have pulled in — the CSV silently stopped at the loaded page before, so a
  // filtered directory of 300 exported as 50 with no indication.
  const handleExport = async () => {
    if (!organization?._id) return
    const exportLimit = 2000 // listPage's server-side cap
    let rowsToExport = filteredMembers
    try {
      const full = await convex.query(api.members.listPage, {
        organization_id: organization._id,
        filter: view,
        search: search || undefined,
        pageSize: exportLimit,
        statuses: statusFilters.length ? statusFilters : undefined,
        unit_ids: unitFilters.length ? (unitFilters as Id<"units">[]) : undefined,
        label_ids: labelFilters.length ? (labelFilters as Id<"labels">[]) : undefined,
        household_ids: householdIds.length ? (householdIds as Id<"households">[]) : undefined,
        no_household: noHousehold || undefined,
        risk_levels: riskFilters.length ? riskFilters : undefined,
      })
      rowsToExport = full.page as unknown as Member[]
      if (!full.isDone) {
        toast({
          title: "Export truncated",
          description: `Only the first ${exportLimit.toLocaleString()} of ${full.totalCount.toLocaleString()} matches were exported. Narrow the filters to export the rest.`,
        })
      }
    } catch (err) {
      console.error("Full export query failed, falling back to loaded rows:", err)
      toast({
        variant: "destructive",
        title: "Exported loaded rows only",
        description: "Could not fetch the full filtered list; the CSV contains the rows currently loaded.",
      })
    }

    const headers = [
      "Name",
      "Email",
      "Phone",
      "Status",
      "Units",
      "Labels",
      "Address",
      "Date of Birth",
      "Gender",
      "Marital Status",
      "Join Date",
    ]

    const escape = (val: unknown) => {
      if (val === null || val === undefined) return ""
      const str = String(val)
      if (str.includes(",") || str.includes("\"") || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    const rows = rowsToExport.map((m: any) => [
      m.name ?? "",
      m.email ?? "",
      m.phone ?? "",
      m.status ?? "",
      (m.unit_names || []).join("; "),
      (m.labels || []).map((l: any) => l.name).join("; "),
      m.address ?? "",
      m.dob ?? "",
      m.gender ?? "",
      m.marital_status ?? "",
      m.joined_date ?? "",
    ])

    const csv = [headers, ...rows]
      .map((row) => row.map(escape).join(","))
      .join("\n")

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `members-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)

    trackEvent(AnalyticsEventType.REPORT_EXPORTED, {
      report: "members",
      row_count: rowsToExport.length,
    })
  }

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in slide-in-from-bottom-4 duration-700">
      <PageHeader
        title="Members"
        description="Everyone in your church, their households, units and labels."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="shadow-sm hover:shadow-md transition-all rounded-lg"
            >
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            {canShareList && organization?._id && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsShareOpen(true)}
                className="shadow-sm hover:shadow-md transition-all rounded-lg"
              >
                <Share2 className="mr-2 h-4 w-4" />
                Share list
                {selectedMemberIds.length > 0 && (
                  <Badge variant="secondary" className="ml-2 h-5 px-1.5 font-normal">
                    {selectedMemberIds.length}
                  </Badge>
                )}
              </Button>
            )}
            {view === 'active' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsBulkUploadOpen(true)}
                className="shadow-sm hover:shadow-md transition-all rounded-lg"
              >
                <Upload className="mr-2 h-4 w-4" />
                Bulk Upload
              </Button>
            )}
            {view === 'active' && isAdmin && organization?._id && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (!window.confirm("Merge duplicates by name + phone? This will merge members with matching first & last names. If a member has a real phone number, phones must also match. This cannot be undone.")) return
                  try {
                    const result = await mergeDuplicates({ organization_id: organization._id })
                    alert(`✅ Deduplication Complete!\n\n📊 Groups merged: ${result.mergedGroups}\n🗑️ Duplicates removed: ${result.removed}\n\nThe member list has been updated.`)
                    window.location.reload() // Refresh to show updated data
                  } catch (err: any) {
                    alert(`❌ Deduplication Failed\n\n${err.message || "Unable to merge duplicates."}`)
                  }
                }}
                className="shadow-sm hover:shadow-md transition-all rounded-lg"
              >
                Merge Duplicates
              </Button>
            )}
            {view === 'active' && (
              <Button
                size="sm"
                onClick={() => setIsAddMemberOpen(true)}
                className="bg-primary text-primary-foreground shadow-soft hover:shadow-soft-lg transition-all rounded-lg"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Member
              </Button>
            )}
          </>
        }
      />

      {/* Active / Archived tabs */}
      {onViewChange && (
        <div className="flex items-center gap-2">
          <Button
            variant={view === 'active' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onViewChange('active')}
            className="rounded-lg"
          >
            Active
          </Button>
          <Button
            variant={view === 'archived' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onViewChange('archived')}
            className="rounded-lg"
          >
            Archived
          </Button>
        </div>
      )}

      {/* Filters and Search */}
      <Card className="shadow-soft hover:shadow-soft-lg transition-all rounded-xl border border-border/50">
        <CardHeader className="bg-muted/30 pb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            Filter Directory
          </CardTitle>
          <div className="flex items-center gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search name, email, or phone…"
                className="pl-9 bg-background"
              />
            </div>
            {typeof totalCount === "number" && (
              <span className="hidden sm:inline text-sm text-muted-foreground whitespace-nowrap">
                {totalCount.toLocaleString()} member{totalCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className={cn("grid grid-cols-1 md:grid-cols-2 gap-4", isPro ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
            {/* key remounts the trigger after each pick so it resets to placeholder */}
            <Select key={`status-${statusFilters.length}`} onValueChange={(v) => addFilter(setStatusFilters, v)}>
              <SelectTrigger className="rounded-lg w-full">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="rounded-lg shadow-lg border-border/50">
                {["active", "inactive", "visitor"].filter(s => !statusFilters.includes(s)).map(s => (
                  <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                ))}
                {statusFilters.length === 3 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">All statuses selected</div>
                )}
              </SelectContent>
            </Select>
            <Select key={`unit-${unitFilters.length}`} onValueChange={(v) => addFilter(setUnitFilters, v)}>
              <SelectTrigger className="rounded-lg w-full">
                <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Unit" />
              </SelectTrigger>
              <SelectContent className="rounded-lg shadow-lg border-border/50 max-h-[300px]">
                {unitsData?.filter(u => !unitFilters.includes(u._id)).map((unit) => (
                  <SelectItem key={unit._id} value={unit._id}>
                    {unit.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select key={`label-${labelFilters.length}`} onValueChange={(v) => addFilter(setLabelFilters, v)}>
              <SelectTrigger className="rounded-lg w-full">
                <Tag className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Label" />
              </SelectTrigger>
              <SelectContent className="rounded-lg shadow-lg border-border/50 max-h-[300px]">
                {labelsData?.filter((l: any) => !labelFilters.includes(l._id)).map((label: any) => (
                  <SelectItem key={label._id} value={label._id}>
                    {label.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select key={`household-${householdFilters.length}`} onValueChange={(v) => addFilter(setHouseholdFilters, v)}>
              <SelectTrigger className="rounded-lg w-full">
                <Home className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Household" />
              </SelectTrigger>
              <SelectContent className="rounded-lg shadow-lg border-border/50 max-h-[300px]">
                {!householdFilters.includes(NO_HOUSEHOLD) && (
                  <SelectItem value={NO_HOUSEHOLD} className="italic text-muted-foreground">
                    No household
                  </SelectItem>
                )}
                {householdsData?.filter(h => !householdFilters.includes(h._id)).map((h) => (
                  <SelectItem key={h._id} value={h._id}>
                    {h.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isPro && (
              <Select key={`risk-${riskFilters.length}`} onValueChange={(v) => addFilter(setRiskFilters, v)}>
                <SelectTrigger className="rounded-lg w-full">
                  <ShieldAlert className="w-4 h-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Risk level" />
                </SelectTrigger>
                <SelectContent className="rounded-lg shadow-lg border-border/50">
                  {Object.keys(RISK_LABELS).filter(l => !riskFilters.includes(l)).map(level => (
                    <SelectItem key={level} value={level}>{riskLabel(level)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Active filters + count */}
          <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
            <div className="flex flex-wrap items-center gap-2">
              {statusFilters.map(s => (
                <Badge key={`s-${s}`} variant="secondary" className="gap-1 pl-2.5 capitalize font-normal">
                  {s}
                  <button type="button" onClick={() => removeFilter(setStatusFilters, s)} className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {unitFilters.map(id => (
                <Badge key={`u-${id}`} variant="secondary" className="gap-1 pl-2.5 font-normal">
                  {unitName(id)}
                  <button type="button" onClick={() => removeFilter(setUnitFilters, id)} className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {labelFilters.map(id => (
                <Badge key={`l-${id}`} variant="secondary" className="gap-1 pl-2.5 font-normal">
                  {labelName(id)}
                  <button type="button" onClick={() => removeFilter(setLabelFilters, id)} className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {householdFilters.map(id => (
                <Badge key={`h-${id}`} variant="secondary" className="gap-1 pl-2.5 font-normal">
                  {householdName(id)}
                  <button type="button" onClick={() => removeFilter(setHouseholdFilters, id)} className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {riskFilters.map(level => (
                <Badge key={`r-${level}`} variant="secondary" className="gap-1 pl-2.5 font-normal">
                  {riskLabel(level)}
                  <button type="button" onClick={() => removeFilter(setRiskFilters, level)} className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={resetFilters} className="h-7 px-2 text-muted-foreground hover:text-foreground">
                  Reset all
                </Button>
              )}
            </div>
            {/* Filters run server-side across the whole scoped set, so this is
                the authoritative match count, not just the loaded page. */}
            {activeFilterCount > 0 && typeof totalCount === "number" && (
              <span className="text-sm text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full shrink-0">
                {totalCount.toLocaleString()} match{totalCount === 1 ? '' : 'es'} filter{totalCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table and dialogs */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <>
          <div className="rounded-xl overflow-hidden shadow-soft border border-border/50 bg-card">
            <MembersTable
              members={filteredMembers}
              isArchivedView={view === 'archived'}
              selectedMembers={selectedMemberIds}
              onSelectedMembersChange={setSelectedMemberIds}
            />
          </div>

          {!isDone && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                disabled={isLoadingMore}
                onClick={() => setLoadedCount((c) => c + PAGE_SIZE)}
              >
                {isLoadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Load more
              </Button>
            </div>
          )}
        </>
      )}

      <MemberDialog
        open={isAddMemberOpen}
        onOpenChange={setIsAddMemberOpen}
      />
      <BulkUploadDialog
        open={isBulkUploadOpen}
        onOpenChange={setIsBulkUploadOpen}
      />
      {canShareList && organization?._id && (
        <ShareMembersLinkDialog
          open={isShareOpen}
          onOpenChange={setIsShareOpen}
          filters={{
            organization_id: organization._id,
            filter: view,
            search: search || undefined,
            statuses: statusFilters.length ? statusFilters : undefined,
            unit_ids: unitFilters.length ? (unitFilters as Id<"units">[]) : undefined,
            label_ids: labelFilters.length ? (labelFilters as Id<"labels">[]) : undefined,
            household_ids: householdIds.length ? (householdIds as Id<"households">[]) : undefined,
            no_household: noHousehold || undefined,
            risk_levels: riskFilters.length ? riskFilters : undefined,
          }}
          filterSummary={filterSummary}
          totalCount={totalCount}
          selectedMemberIds={selectedMemberIds}
        />
      )}
    </div>
  )
}
