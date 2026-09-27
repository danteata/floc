
import { format } from "date-fns"
import { Calendar, Mail, Phone, MapPin, Award, Loader2, Shield, Hash, Crown, CheckCircle2, XCircle, AlertTriangle, HeartHandshake, Home, Star, Activity, CircleDollarSign, Info } from "lucide-react"
import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { Id } from "../../convex/_generated/dataModel"

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { MemberAvatar } from "@/components/ui/member-avatar"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { MemberLabels } from "./label-selector"
import type { Member } from "@/types/database"
import { useUserRole } from "@/hooks/use-user-role"
import { hasCapability } from "@/lib/permissions"
import { useMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import { titleCase } from '@/lib/display'

interface MemberProfileDialogProps {
  member: Member | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const STATUS_TONE: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-success/15 text-success-strong" },
  inactive: { label: "Inactive", className: "bg-warning/15 text-warning-strong" },
  visitor: { label: "Visitor", className: "bg-info/15 text-info-strong" },
}


/** "resolved" → "Resolved". */
function sentenceCase(value?: string | null): string {
  const text = (value ?? "").replace(/[_-]+/g, " ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** "26 Sep 2026" for a readable date, or the raw value if it isn't one. */
function formatDay(value?: string | number | null): string {
  if (value === null || value === undefined || value === "") return ""
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? String(value) : format(d, "d MMM yyyy")
}

function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? { label: sentenceCase(status), className: "bg-muted text-muted-foreground" }
  return <Badge className={tone.className}>{tone.label}</Badge>
}

function RiskBadge({ level }: { level: string }) {
  switch (level) {
    case "low":
      return <Badge className="bg-success/15 text-success-strong">Low risk</Badge>
    case "medium":
      return <Badge className="bg-warning/15 text-warning-strong">Medium risk</Badge>
    case "high":
      return <Badge className="bg-destructive/15 text-destructive-strong">High risk</Badge>
    case "new":
      return <Badge className="bg-muted text-muted-foreground">New member</Badge>
    default:
      return null
  }
}

type EngagementBreakdown = {
  recency: number
  trend: number
  consistency: number
  involvement: number
  giving: number | null
  days_since_last?: number
  is_new_member: boolean
}

function parseEngagementBreakdown(raw?: string): EngagementBreakdown | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as EngagementBreakdown
  } catch {
    return null
  }
}

function SectionLabel({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
      <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> {children}
    </h3>
  )
}

const ENGAGEMENT_METRICS = {
  Recency: { weight: "35%", description: "Days since the member last attended." },
  Trend: { weight: "30%", description: "Attendance in the last 8 weeks compared with the 8 weeks before. It spots a member slipping from weekly to monthly before they miss 3 in a row." },
  Consistency: { weight: "20%", description: "Attendance rate over roughly the last 12 weeks." },
  Involvement: { weight: "15%", description: "How many active units the member belongs to." },
} as const

/** A metric label with a click-to-open (works on touch too, unlike a hover-only
 *  tooltip) info icon explaining what it measures and how much it's weighted. */
function MetricLabel({ metric }: { metric: keyof typeof ENGAGEMENT_METRICS }) {
  const { weight, description } = ENGAGEMENT_METRICS[metric]
  return (
    <span className="inline-flex items-center gap-1">
      {metric}
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="text-muted-foreground/50 hover:text-foreground transition-colors">
            <Info className="h-3 w-3" />
            <span className="sr-only">What does {metric} mean?</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 text-xs space-y-1" align="start">
          <p className="font-medium text-foreground">{metric} <span className="text-muted-foreground font-normal">({weight} of score)</span></p>
          <p className="text-muted-foreground">{description}</p>
        </PopoverContent>
      </Popover>
    </span>
  )
}

export function MemberProfileDialog({
  member,
  open,
  onOpenChange,
}: MemberProfileDialogProps) {
  // Convex Queries
  const attendanceSummary = useQuery(api.attendance.getMemberSummary,
    open && member?._id ? { memberId: member._id as any } : "skip"
  )

  const memberLabels = useQuery(api.labels.getByMember,
    open && member?._id ? { member_id: member._id } : "skip"
  )

  const allUnits = useQuery(api.units.list, open ? {} : "skip")

  const households = useQuery(api.households.list,
    open && member?.organization_id
      ? { organization_id: member.organization_id }
      : "skip"
  )
  const memberIdForHousehold = member ? (member._id ?? (member as { id?: string }).id) : undefined
  const household = households?.find((h) =>
    h.members.some((m) => m._id === memberIdForHousehold),
  )

  const careTasks = useQuery(api.care_tasks.listForMember,
    open && member?._id ? { member_id: member._id as Id<"members"> } : "skip"
  )

  const { role } = useUserRole()
  const money = useMoney()
  const canViewGiving = hasCapability(role, "financial")
  const giving = useQuery(api.financial.listMemberGiving,
    open && member?._id && canViewGiving ? { member_id: member._id as Id<"members"> } : "skip"
  )

  const loading = attendanceSummary === undefined || memberLabels === undefined

  const memberUnits = allUnits?.filter(u => member?.unit_ids?.includes(u._id)) || []

  // Filter units led by this member - handle both string and Id comparison
  const ledUnits = allUnits?.filter(u => {
    if (!u.leader_id) return false;
    const memberId = (member as any)._id || (member as any).id;
    if (!memberId) return false;
    // Handle Id object comparison
    if (typeof u.leader_id === 'object' && u.leader_id !== null) {
      return String(u.leader_id) === String(memberId);
    }
    return u.leader_id === memberId;
  }) || []

  if (!member) return null

  const consecutiveAbsences = (attendanceSummary as any)?.consecutive_absences || 0
  const hasAbsenceStreak = !loading && consecutiveAbsences > 0

  const engagementBreakdown = parseEngagementBreakdown(member.engagement_breakdown)
  const lastResolvedCareContact = careTasks
    ?.filter((t) => t.status === "resolved" && t.resolved_at)
    .reduce<string | undefined>((latest, t) => (!latest || t.resolved_at! > latest ? t.resolved_at! : latest), undefined)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-x-hidden overflow-y-auto p-0">
        <div className="px-4 pt-6 pb-8 space-y-6 sm:px-6">
          {/* Header Section */}
          <div className="flex items-center gap-4 pr-8">
            <MemberAvatar name={member.name} src={member.avatar_url || member.avatar} size="lg" className="size-16 text-lg" />

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <DialogTitle className="text-xl text-foreground tracking-tight font-semibold break-words">{member.name}</DialogTitle>
                <StatusBadge status={member.status} />
              </div>
              <div className="flex flex-col gap-1">
                {member.email && (
                  <p
                    className="text-sm text-muted-foreground flex items-center gap-2 min-w-0"
                    title={member.email}
                  >
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{member.email}</span>
                  </p>
                )}
                {member.phone && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2 min-w-0">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{member.phone}</span>
                  </p>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Activity summary */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-xl bg-card p-3 ring-1 ring-foreground/10 sm:p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xl font-semibold text-foreground tabular-nums">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : attendanceSummary?.total_attendance || 0}
                </span>
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </div>
              <div className="text-xs text-muted-foreground">Times present</div>
            </div>
            <div className="rounded-xl bg-card p-3 ring-1 ring-foreground/10 sm:p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xl font-semibold text-foreground truncate">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> :
                    attendanceSummary?.last_attendance_date ? format(new Date(attendanceSummary.last_attendance_date), 'd MMM') : 'Never'}
                </span>
                <Calendar className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </div>
              <div className="text-xs text-muted-foreground">Last attended</div>
            </div>
            <div className={cn(
              "rounded-xl p-3 ring-1 sm:p-4",
              hasAbsenceStreak ? "bg-warning/10 ring-warning/30" : "bg-card ring-foreground/10",
            )}>
              <div className="flex items-center justify-between mb-1">
                <span className={cn("text-xl font-semibold tabular-nums", hasAbsenceStreak ? "text-warning-strong" : "text-foreground")}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : consecutiveAbsences}
                </span>
                <AlertTriangle className={cn("h-4 w-4", hasAbsenceStreak ? "text-warning-strong" : "text-muted-foreground")} aria-hidden="true" />
              </div>
              <div className={cn("text-xs", hasAbsenceStreak ? "text-warning-strong" : "text-muted-foreground")}>Missed in a row</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column: Demographics & Groups */}
            <div className="space-y-6">
              <section>
                <SectionLabel icon={Award}>About</SectionLabel>
                <div className="space-y-3 rounded-xl bg-muted/30 p-4 ring-1 ring-foreground/10">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Gender</span>
                    <span className="font-medium text-foreground capitalize">{member.gender || 'Not specified'}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Joined</span>
                    <span className="font-medium text-foreground">
                      {member.joined_date ? format(new Date(member.joined_date), 'd MMM yyyy') : 'Not recorded'}
                    </span>
                  </div>
                  {member.dob && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Birthday</span>
                      <span className="font-medium text-foreground">{format(new Date(member.dob), 'd MMMM')}</span>
                    </div>
                  )}
                  {member.title && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Title</span>
                      <span className="font-medium text-foreground">{member.title}</span>
                    </div>
                  )}
                  {(member as any).skills && (
                    <div className="flex flex-col text-sm">
                      <span className="text-muted-foreground">Skills and talents</span>
                      <span className="font-medium text-foreground">{(member as any).skills}</span>
                    </div>
                  )}
                </div>
              </section>

              <section>
                <SectionLabel icon={Shield}>Units and labels</SectionLabel>
                <div className="space-y-3">
                  <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
                    <p className="text-xs text-muted-foreground mb-2">Units</p>
                    <div className="flex flex-wrap gap-1.5">
                      {memberUnits.length > 0 ? (
                        memberUnits.map(unit => (
                          <Badge key={unit._id} variant="outline">
                            {unit.name}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">Not in any unit yet</span>
                      )}
                    </div>
                  </div>

                  {ledUnits.length > 0 && (
                    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
                      <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                        <Crown className="h-3 w-3" aria-hidden="true" /> Leads
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {ledUnits.map(unit => (
                          <Badge key={unit._id} className="bg-primary text-primary-foreground border-primary hover:bg-primary/90">
                            {unit.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
                    <p className="text-xs text-muted-foreground mb-2">Labels</p>
                    <MemberLabels labels={(memberLabels || []) as any} />
                  </div>
                </div>
              </section>

              {member.engagement_score !== undefined && (
                <section>
                  <SectionLabel icon={Activity}>Engagement</SectionLabel>
                  <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-semibold text-foreground tabular-nums">{member.engagement_score}</span>
                      {member.engagement_risk_level && <RiskBadge level={member.engagement_risk_level} />}
                    </div>
                    {engagementBreakdown && (
                      <>
                        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                          <div className="flex justify-between"><MetricLabel metric="Recency" /><span className="font-medium text-foreground">{engagementBreakdown.recency}</span></div>
                          <div className="flex justify-between"><MetricLabel metric="Trend" /><span className="font-medium text-foreground">{engagementBreakdown.trend}</span></div>
                          <div className="flex justify-between"><MetricLabel metric="Consistency" /><span className="font-medium text-foreground">{engagementBreakdown.consistency}</span></div>
                          <div className="flex justify-between"><MetricLabel metric="Involvement" /><span className="font-medium text-foreground">{engagementBreakdown.involvement}</span></div>
                        </div>
                        {typeof engagementBreakdown.days_since_last === "number" && (
                          <p className="text-xs text-muted-foreground">
                            Last attended {engagementBreakdown.days_since_last} day{engagementBreakdown.days_since_last === 1 ? "" : "s"} ago
                          </p>
                        )}
                      </>
                    )}
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <HeartHandshake className="h-3 w-3" />
                      Last care contact: {lastResolvedCareContact ? format(new Date(lastResolvedCareContact), 'd MMM yyyy') : 'none yet'}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <CircleDollarSign className="h-3 w-3" />
                      Giving isn't part of this score yet
                    </p>
                  </div>
                </section>
              )}

              {canViewGiving && (
                <section>
                  <SectionLabel icon={CircleDollarSign}>Giving</SectionLabel>
                  <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
                    {giving === undefined ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : giving.length === 0 ? (
                      <span className="text-xs text-muted-foreground">No gifts recorded yet</span>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-foreground">
                          {money(giving.reduce((sum, g) => sum + g.amount, 0))} in total
                        </p>
                        <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
                          {giving.slice(0, 10).map((g) => (
                            <div key={g._id} className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground capitalize">
                                {g.category} &middot; {formatDay(g.date)}
                              </span>
                              <span className="font-medium text-foreground tabular-nums">{money(g.amount)}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </section>
              )}

              {households !== undefined && (
                <section>
                  <SectionLabel icon={Home}>Household</SectionLabel>
                  <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
                    {household ? (
                      <>
                        <p className="text-sm font-medium text-foreground">
                          {household.name || "Unnamed household"}
                        </p>
                        {household.address && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {household.address}{household.city ? `, ${household.city}` : ""}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {household.members.map((m) => (
                            <Badge key={m._id} variant="outline" className="gap-1 font-normal">
                              {m._id === household.head_of_household_id && (
                                <Star className="h-3 w-3 text-muted-foreground" aria-label="Head of household" />
                              )}
                              {m.name}
                            </Badge>
                          ))}
                        </div>
                        {household.head_anniversary && (
                          <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
                            <HeartHandshake className="h-3 w-3" />
                            Anniversary: {formatDay(household.head_anniversary)}
                          </p>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Not in a household yet
                      </span>
                    )}
                  </div>
                </section>
              )}
            </div>

            {/* Right Column: Contact & Attendance History */}
            <div className="space-y-6">
              <section>
                <SectionLabel icon={MapPin}>Contact</SectionLabel>
                <div className="space-y-3 rounded-xl bg-muted/30 p-4 ring-1 ring-foreground/10">
                  <div className="flex items-start gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">Phone</p>
                      <p className="text-sm text-foreground">{member.phone || 'No phone number'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">Address</p>
                      <p className="text-sm text-foreground leading-snug">
                        {member.address ? (
                          <>
                            {member.address}<br />
                            {[member.city, [member.state, member.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
                            {member.country && <><br />{member.country}</>}
                          </>
                        ) : 'No address on file'}
                      </p>
                    </div>
                  </div>
                  {member.plus_code && (
                    <div className="flex items-start gap-3">
                      <Hash className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-xs text-muted-foreground">Plus code</p>
                        <p className="text-xs font-mono text-muted-foreground">{member.plus_code}</p>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* Attendance History */}
              <section>
                <SectionLabel icon={Calendar}>Attendance history</SectionLabel>
                <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
                  {loading ? (
                    <div className="p-4 flex items-center justify-center">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : (attendanceSummary as any)?.attendance_history?.length > 0 ? (
                    <div className="max-h-64 overflow-y-auto divide-y divide-border">
                      {(attendanceSummary as any).attendance_history.map((record: any, index: number) => {
                        const isPresent = record.status === 'present'
                        return (
                          <div key={index} className="px-4 py-2.5 flex items-center justify-between hover:bg-muted/50 transition-colors">
                            <div className="flex items-center gap-3">
                              {isPresent ? (
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-success-strong" aria-hidden="true" />
                              ) : (
                                <XCircle className="h-4 w-4 shrink-0 text-destructive-strong" aria-hidden="true" />
                              )}
                              <div>
                                <p className="text-sm font-medium text-foreground">{titleCase(record.event_type_label)}</p>
                                <p className="text-xs text-muted-foreground">{format(new Date(record.date), 'd MMM yyyy')}</p>
                              </div>
                            </div>
                            <Badge className={isPresent ? "bg-success/15 text-success-strong" : "bg-destructive/15 text-destructive-strong"}>
                              {isPresent ? 'Present' : 'Absent'}
                            </Badge>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="p-4 text-center">
                      <Calendar className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" aria-hidden="true" />
                      <p className="text-sm text-muted-foreground">No attendance records yet</p>
                    </div>
                  )}
                </div>
              </section>

              {/* Follow-up History */}
              <section>
                <SectionLabel icon={HeartHandshake}>Follow-up history</SectionLabel>
                <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
                  {careTasks === undefined ? (
                    <div className="p-4 flex items-center justify-center">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : careTasks.length > 0 ? (
                    <div className="max-h-64 overflow-y-auto divide-y divide-border">
                      {careTasks.map((task) => (
                        <div key={task._id} className="px-4 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-foreground">
                              Assigned to {task.assignee_name}
                              {task.source === "automation" && (
                                <span className="text-xs text-muted-foreground"> · automated</span>
                              )}
                            </p>
                            <Badge
                              className={
                                task.status === "resolved"
                                  ? "bg-success/15 text-success-strong"
                                  : task.status === "contacted"
                                    ? "bg-info/15 text-info-strong"
                                    : "bg-muted text-muted-foreground"
                              }
                            >
                              {sentenceCase(task.status)}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {format(new Date(task.created_at), 'd MMM yyyy')}
                          </p>
                          {task.notes?.length > 0 && (
                            <div className="mt-2 space-y-1.5 pl-3 border-l border-border">
                              {task.notes.map((n) => (
                                <div key={n._id} className="text-xs">
                                  {n.note && <p className="text-foreground">{n.note}</p>}
                                  <p className="text-muted-foreground">
                                    {n.created_by_name || "Someone"} · {format(new Date(n.created_at), 'd MMM yyyy')}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center">
                      <HeartHandshake className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" aria-hidden="true" />
                      <p className="text-sm text-muted-foreground">No follow-ups yet</p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
