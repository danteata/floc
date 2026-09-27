import { useState, useEffect } from "react";
import { useConvex, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAnalytics } from "@/hooks/useAnalytics";
import { AnalyticsEventType } from "@/services/analytics/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LayoutWrapper } from "@/components/layout-wrapper";
import { PageHeader } from "@/components/ui/page-header";
import { NoAccess } from "@/components/ui/no-access";
import { LoadingState } from "@/components/ui/loading-state";
import { useUserRole } from "@/hooks/use-user-role";
import { hasCapability } from "@/lib/permissions";
import { toast } from "sonner";
import {
    Shield,
    Filter,
    Calendar,
    User,
    Activity,
    ChevronLeft,
    ChevronRight,
    Eye,
    RefreshCw,
    Download
} from "lucide-react";
import { format, parseISO } from "date-fns";

// Action type colors for badges
const actionColors: Record<string, string> = {
    "member.created": "bg-success/15 text-success-strong",
    "member.updated": "bg-info/15 text-info-strong",
    "member.deleted": "bg-destructive/15 text-destructive-strong",
    "user.role_changed": "bg-primary/15 text-primary",
    "user.login": "bg-muted text-foreground",
    "event.created": "bg-success/15 text-success-strong",
    "event.updated": "bg-info/15 text-info-strong",
    "event.deleted": "bg-destructive/15 text-destructive-strong",
    "attendance.recorded": "bg-primary/15 text-primary",
    "financial.transaction_added": "bg-warning/15 text-warning-strong",
    "financial.transaction_updated": "bg-warning/15 text-warning-strong",
    "financial.transaction_deleted": "bg-destructive/15 text-destructive-strong",
    "label.created": "bg-primary/15 text-primary",
    "label.assigned": "bg-primary/15 text-primary",
    "label.removed": "bg-muted text-foreground",
    "invitation.sent": "bg-success/15 text-success-strong",
    "invitation.accepted": "bg-success/15 text-success-strong",
    "invitation.revoked": "bg-destructive/15 text-destructive-strong",
};

// Readable names for the action keys the backend writes. Anything not listed
// falls back to the key with its dots and underscores turned into spaces.
const actionLabels: Record<string, string> = {
    "member.created": "Member added",
    "member.updated": "Member updated",
    "member.deleted": "Member deleted",
    "member.archived": "Member archived",
    "member.restored": "Member restored",
    "member_list_share.created": "Share link created",
    "member_list_share.revoked": "Share link revoked",
    "user.role_changed": "Role changed",
    "user.removed": "Account removed",
    "user.login": "Signed in",
    "unit.admin_added": "Unit admin added",
    "unit.admin_removed": "Unit admin removed",
    "unit.primary_leader_changed": "Unit leader changed",
    "unit.merged": "Units merged",
    "organization.linked_to_parent": "Linked to a parent church",
    "organization.unlinked_from_parent": "Unlinked from the parent church",
    "organization.sub_org_removed": "Linked church removed",
    "event.created": "Event created",
    "event.updated": "Event updated",
    "event.deleted": "Event deleted",
    "attendance.recorded": "Attendance recorded",
    "financial.transaction_added": "Transaction added",
    "financial.transaction_created": "Transaction added",
    "financial.transaction_updated": "Transaction updated",
    "financial.transaction_deleted": "Transaction deleted",
    "financial.transaction_voided": "Transaction voided",
    "financial.giving_confirmed": "Online gift confirmed",
    "financial.giving_amount_mismatch": "Online gift amount didn't match",
    "financial.giving_webhook_unknown_reference": "Online gift with an unknown reference",
    "label.created": "Label created",
    "label.updated": "Label updated",
    "label.deleted": "Label deleted",
    "label.assigned": "Label added to a member",
    "label.removed": "Label removed from a member",
    "invitation.sent": "Invitation sent",
    "invitation.accepted": "Invitation accepted",
    "invitation.revoked": "Invitation revoked",
    "automation.rule_created": "Automation created",
    "automation.rule_deleted": "Automation deleted",
    "flag.set": "Feature switched",
    "flag.cleared": "Feature reset to default",
    "ai.credential.changed": "AI key changed",
};

const entityLabels: Record<string, string> = {
    member: "Member",
    member_list_share: "Share link",
    user: "Account",
    unit: "Unit",
    organization: "Church",
    event: "Event",
    financial_transaction: "Transaction",
    label: "Label",
    invitation: "Invitation",
    automation_rule: "Automation",
    feature_flag: "Feature",
};

const roleLabels: Record<string, string> = {
    super_admin: "Super admin",
    organization_admin: "Organization admin",
    division_admin: "Division admin",
    unit_admin: "Unit admin",
    member: "Member",
};

/** "member_list_share.created" -> "Member list share created". */
function humanize(key: string | undefined | null): string {
    if (!key) return "";
    const words = key.replace(/[._]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1);
}

const actionLabel = (action: string) => actionLabels[action] ?? humanize(action);
const entityLabel = (entityType: string) => entityLabels[entityType] ?? humanize(entityType);
const roleLabel = (role: string) => roleLabels[role] ?? humanize(role);

// Entity type icons
const entityIcons: Record<string, React.ReactNode> = {
    member: <User className="h-4 w-4" />,
    user: <Shield className="h-4 w-4" />,
    event: <Calendar className="h-4 w-4" />,
    financial_transaction: <Activity className="h-4 w-4" />,
    label: <Activity className="h-4 w-4" />,
    invitation: <User className="h-4 w-4" />,
};

interface AuditLog {
    _id: string;
    action: string;
    entity_type: string;
    entity_id?: string;
    entity_name?: string;
    performed_by: string;
    performed_by_name: string;
    performed_by_role: string;
    organization_id?: string;
    changes?: any;
    metadata?: any;
    ip_address?: string;
    timestamp: string;
}

export default function AuditTrail() {
    const { trackEvent } = useAnalytics();
    const [page, setPage] = useState(0);
    const [filters, setFilters] = useState({
        action: "",
        entity_type: "",
        performed_by: "",
        start_date: "",
        end_date: "",
    });
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    // On phones the filters sit behind a button so the log shows first.
    const [showFilters, setShowFilters] = useState(false);

    const limit = 20;
    const convex = useConvex();
    const { role, isLoading: roleLoading } = useUserRole();
    const canView = !roleLoading && hasCapability(role, "audit_trail");
    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        trackEvent(AnalyticsEventType.AUDIT_TRAIL_VIEWED, {});
    }, [trackEvent]);

    // Fetch audit logs
    const filterArgs = {
        action: filters.action || undefined,
        entity_type: filters.entity_type || undefined,
        // "Changed by" is a typed name, so match on the recorded name.
        performed_by_name: filters.performed_by.trim() || undefined,
        start_date: filters.start_date || undefined,
        end_date: filters.end_date || undefined,
    };
    const auditData = useQuery(
        api.audit.getAuditLogs,
        canView ? { ...filterArgs, limit, offset: page * limit } : "skip",
    );

    // Fetch action types and entity types for filters
    const actionTypes = useQuery(api.audit.getActionTypes, canView ? {} : "skip");
    const entityTypes = useQuery(api.audit.getEntityTypes, canView ? {} : "skip");

    const handleFilterChange = (key: string, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        setPage(0); // Reset to first page when filtering
    };

    const clearFilters = () => {
        setFilters({
            action: "",
            entity_type: "",
            performed_by: "",
            start_date: "",
            end_date: "",
        });
        setPage(0);
    };

    const formatDate = (timestamp: string) => {
        try {
            return format(parseISO(timestamp), "d MMM yyyy, HH:mm");
        } catch {
            return timestamp;
        }
    };

    const getActionColor = (action: string) => {
        return actionColors[action] || "bg-muted text-foreground";
    };

    const getEntityIcon = (entityType: string) => {
        return entityIcons[entityType] || <Activity className="h-4 w-4" />;
    };

    const viewDetails = (log: AuditLog) => {
        setSelectedLog(log);
        setIsDetailOpen(true);
        trackEvent(AnalyticsEventType.AUDIT_LOG_VIEWED, {
            action: log.action,
            entity_type: log.entity_type,
        });
    };

    const exportToCSV = async () => {
        if (!auditData?.total) return;

        // Export every change that matches the filters, not just this page.
        setIsExporting(true);
        let logs: AuditLog[];
        try {
            const all = await convex.query(api.audit.getAuditLogs, {
                ...filterArgs,
                limit: auditData.total,
                offset: 0,
            });
            logs = all.logs as AuditLog[];
        } catch (error) {
            toast.error("Couldn't export the audit trail", {
                description: error instanceof Error ? error.message : undefined,
            });
            return;
        } finally {
            setIsExporting(false);
        }

        const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;
        const headers = ["When", "Action", "Record type", "Name", "Changed by", "Role", "IP address"];
        const csvContent = [
            headers.map(csvCell).join(","),
            ...logs.map((log) => [
                formatDate(log.timestamp),
                actionLabel(log.action),
                entityLabel(log.entity_type),
                log.entity_name || "",
                log.performed_by_name,
                roleLabel(log.performed_by_role),
                log.ip_address || "",
            ].map(csvCell).join(","))
        ].join("\n");

        const blob = new Blob([csvContent], { type: "text/csv" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `audit-trail-${format(new Date(), "yyyy-MM-dd")}.csv`;
        a.click();

        trackEvent(AnalyticsEventType.REPORT_EXPORTED, {
            report: 'audit_trail',
            row_count: logs.length,
        });
    };

    if (roleLoading) {
        return <LayoutWrapper><LoadingState message="Checking your access…" /></LayoutWrapper>;
    }
    if (!canView) {
        return (
            <LayoutWrapper>
                <div className="container py-10">
                    <NoAccess what="view the audit trail" who="church administrators" />
                </div>
            </LayoutWrapper>
        );
    }

    return (
        <LayoutWrapper>
            <div className="container mx-auto py-6 space-y-6">
                <PageHeader
                    title="Audit trail"
                    description="Key changes to members, accounts, roles, money, events, labels and links between churches: who made them, and when. Not every setting change is recorded yet."
                    actions={
                        <>
                            <Button variant="outline" onClick={exportToCSV} disabled={!auditData?.total || isExporting}>
                                <Download className="h-4 w-4 mr-2" />
                                Export CSV
                            </Button>
                            <Button variant="outline" onClick={() => setPage(0)}>
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Refresh
                            </Button>
                        </>
                    }
                />

                {/* Filters */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between gap-2">
                            <CardTitle className="flex items-center gap-2 text-base font-semibold">
                                <Filter className="h-4 w-4 text-muted-foreground" />
                                Filters
                            </CardTitle>
                            <Button
                                variant="outline"
                                size="sm"
                                className="md:hidden"
                                onClick={() => setShowFilters((v) => !v)}
                                aria-expanded={showFilters}
                            >
                                {showFilters ? "Hide" : "Show"}
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className={showFilters ? undefined : "hidden md:block"}>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                            <div className="space-y-2">
                                <Label>Action</Label>
                                <Select
                                    value={filters.action || "all"}
                                    onValueChange={(value) => handleFilterChange("action", value === "all" ? "" : value)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="All actions" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All actions</SelectItem>
                                        {actionTypes?.map((action) => (
                                            <SelectItem key={action} value={action}>
                                                {actionLabel(action)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Record type</Label>
                                <Select
                                    value={filters.entity_type || "all"}
                                    onValueChange={(value) => handleFilterChange("entity_type", value === "all" ? "" : value)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="All records" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All records</SelectItem>
                                        {entityTypes?.map((type) => (
                                            <SelectItem key={type} value={type}>
                                                {entityLabel(type)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Changed by</Label>
                                <Input
                                    placeholder="Part of a name"
                                    value={filters.performed_by}
                                    onChange={(e) => handleFilterChange("performed_by", e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>From</Label>
                                <Input
                                    type="date"
                                    value={filters.start_date}
                                    onChange={(e) => handleFilterChange("start_date", e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>To</Label>
                                <Input
                                    type="date"
                                    value={filters.end_date}
                                    onChange={(e) => handleFilterChange("end_date", e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="mt-4 flex justify-end">
                            <Button variant="ghost" onClick={clearFilters}>
                                Clear filters
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Audit Logs Table */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between gap-2">
                            <CardTitle className="flex items-center gap-2 text-base font-semibold">
                                <Activity className="h-4 w-4 text-muted-foreground" />
                                Changes
                            </CardTitle>
                            {auditData && (
                                <Badge variant="secondary">
                                    {auditData.total} {auditData.total === 1 ? "change" : "changes"}
                                </Badge>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[600px] max-w-full">
                            <Table className="min-w-[760px]">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[160px]">When</TableHead>
                                        <TableHead className="w-[200px]">Action</TableHead>
                                        <TableHead className="w-[130px]">Record</TableHead>
                                        <TableHead>Details</TableHead>
                                        <TableHead className="w-[150px]">Changed by</TableHead>
                                        <TableHead className="w-[140px]">Role</TableHead>
                                        <TableHead className="w-[80px]">IP</TableHead>
                                        <TableHead className="w-[60px]"><span className="sr-only">View</span></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {auditData?.logs?.map((log: AuditLog) => (
                                        <TableRow key={log._id}>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {formatDate(log.timestamp)}
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={getActionColor(log.action)}>
                                                    {actionLabel(log.action)}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    {getEntityIcon(log.entity_type)}
                                                    <span className="text-sm">{entityLabel(log.entity_type)}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="max-w-[300px]">
                                                    <p className="font-medium truncate">
                                                        {log.entity_name || log.entity_id || <span className="text-muted-foreground">Not recorded</span>}
                                                    </p>
                                                    {log.changes && (
                                                        <p className="text-xs text-muted-foreground truncate">
                                                            Changes recorded
                                                        </p>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {log.performed_by_name}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="text-xs">
                                                    {roleLabel(log.performed_by_role)}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                                {log.ip_address || ""}
                                            </TableCell>
                                            <TableCell>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => viewDetails(log)}
                                                    aria-label="View details"
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {(!auditData?.logs || auditData.logs.length === 0) && (
                                        <TableRow>
                                            <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                                No changes found. Try different filters.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </ScrollArea>

                        {/* Pagination */}
                        {auditData && auditData.total > limit && (
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mt-4 pt-4 border-t">
                                <p className="text-sm text-muted-foreground">
                                    Showing {page * limit + 1} to {Math.min((page + 1) * limit, auditData.total)} of {auditData.total}
                                </p>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setPage(p => Math.max(0, p - 1))}
                                        disabled={page === 0}
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                        Previous
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setPage(p => p + 1)}
                                        disabled={!auditData.hasMore}
                                    >
                                        Next
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Detail Dialog */}
                <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
                        <DialogHeader>
                            <DialogTitle>Change details</DialogTitle>
                        </DialogHeader>
                        {selectedLog && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <Label className="text-muted-foreground">When</Label>
                                        <p className="font-medium">{formatDate(selectedLog.timestamp)}</p>
                                    </div>
                                    <div>
                                        <Label className="text-muted-foreground">Action</Label>
                                        <Badge className={getActionColor(selectedLog.action)}>
                                            {actionLabel(selectedLog.action)}
                                        </Badge>
                                    </div>
                                    <div>
                                        <Label className="text-muted-foreground">Record type</Label>
                                        <p className="font-medium">{entityLabel(selectedLog.entity_type)}</p>
                                    </div>
                                    <div>
                                        <Label className="text-muted-foreground">Record ID</Label>
                                        <p className="font-medium font-mono text-sm break-all">{selectedLog.entity_id || "Not recorded"}</p>
                                    </div>
                                    <div>
                                        <Label className="text-muted-foreground">Name</Label>
                                        <p className="font-medium">{selectedLog.entity_name || "Not recorded"}</p>
                                    </div>
                                    <div>
                                        <Label className="text-muted-foreground">Changed by</Label>
                                        <p className="font-medium">{selectedLog.performed_by_name}</p>
                                    </div>
                                    <div>
                                        <Label className="text-muted-foreground">Role</Label>
                                        <Badge variant="outline">{roleLabel(selectedLog.performed_by_role)}</Badge>
                                    </div>
                                    <div>
                                        <Label className="text-muted-foreground">IP address</Label>
                                        <p className="font-medium font-mono text-sm">{selectedLog.ip_address || "Not recorded"}</p>
                                    </div>
                                </div>

                                {selectedLog.changes && (
                                    <div>
                                        <Label className="text-muted-foreground">Changes</Label>
                                        <pre className="mt-2 p-4 bg-muted rounded-lg text-sm overflow-auto">
                                            {JSON.stringify(selectedLog.changes, null, 2)}
                                        </pre>
                                    </div>
                                )}

                                {selectedLog.metadata && (
                                    <div>
                                        <Label className="text-muted-foreground">More details</Label>
                                        <pre className="mt-2 p-4 bg-muted rounded-lg text-sm overflow-auto">
                                            {JSON.stringify(selectedLog.metadata, null, 2)}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        )}
                    </DialogContent>
                </Dialog>
            </div>
        </LayoutWrapper>
    );
}
