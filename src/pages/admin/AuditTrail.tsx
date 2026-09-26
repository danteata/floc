import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LayoutWrapper } from "@/components/layout-wrapper";
import { PageHeader } from "@/components/ui/page-header";
import {
    Shield,
    Search,
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
    "member.created": "bg-green-100 text-green-800",
    "member.updated": "bg-blue-100 text-blue-800",
    "member.deleted": "bg-red-100 text-red-800",
    "user.role_changed": "bg-purple-100 text-purple-800",
    "user.login": "bg-gray-100 text-gray-800",
    "event.created": "bg-emerald-100 text-emerald-800",
    "event.updated": "bg-cyan-100 text-cyan-800",
    "event.deleted": "bg-rose-100 text-rose-800",
    "attendance.recorded": "bg-indigo-100 text-indigo-800",
    "financial.transaction_added": "bg-amber-100 text-amber-800",
    "financial.transaction_updated": "bg-orange-100 text-orange-800",
    "financial.transaction_deleted": "bg-red-100 text-red-800",
    "label.created": "bg-pink-100 text-pink-800",
    "label.assigned": "bg-violet-100 text-violet-800",
    "label.removed": "bg-gray-100 text-gray-800",
    "invitation.sent": "bg-teal-100 text-teal-800",
    "invitation.accepted": "bg-green-100 text-green-800",
    "invitation.revoked": "bg-red-100 text-red-800",
};

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

    const limit = 20;

    useEffect(() => {
        trackEvent(AnalyticsEventType.AUDIT_TRAIL_VIEWED, {});
    }, [trackEvent]);

    // Fetch audit logs
    const auditData = useQuery(api.audit.getAuditLogs, {
        action: filters.action || undefined,
        entity_type: filters.entity_type || undefined,
        performed_by: filters.performed_by || undefined,
        start_date: filters.start_date || undefined,
        end_date: filters.end_date || undefined,
        limit,
        offset: page * limit,
    });

    // Fetch action types and entity types for filters
    const actionTypes = useQuery(api.audit.getActionTypes);
    const entityTypes = useQuery(api.audit.getEntityTypes);

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
            return format(parseISO(timestamp), "MMM dd, yyyy HH:mm:ss");
        } catch {
            return timestamp;
        }
    };

    const getActionColor = (action: string) => {
        return actionColors[action] || "bg-gray-100 text-gray-800";
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

    const exportToCSV = () => {
        if (!auditData?.logs) return;

        const headers = ["Timestamp", "Action", "Entity Type", "Entity Name", "Performed By", "Role", "IP Address"];
        const csvContent = [
            headers.join(","),
            ...auditData.logs.map((log: AuditLog) => [
                log.timestamp,
                log.action,
                log.entity_type,
                log.entity_name || "",
                log.performed_by_name,
                log.performed_by_role,
                log.ip_address || "",
            ].map(cell => `"${cell}"`).join(","))
        ].join("\n");

        const blob = new Blob([csvContent], { type: "text/csv" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `audit-trail-${format(new Date(), "yyyy-MM-dd")}.csv`;
        a.click();

        trackEvent(AnalyticsEventType.REPORT_EXPORTED, {
            report: 'audit_trail',
            row_count: auditData.logs.length,
        });
    };

    return (
        <LayoutWrapper>
            <div className="container mx-auto py-6 space-y-6">
                <PageHeader
                    title="Audit trail"
                    description="Every change made in Floc: who made it, and when."
                    actions={
                        <>
                            <Button variant="outline" onClick={exportToCSV} disabled={!auditData?.logs?.length}>
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
                        <CardTitle className="flex items-center gap-2">
                            <Filter className="h-5 w-5" />
                            Filters
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                            <div className="space-y-2">
                                <Label>Action Type</Label>
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
                                                {action}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Entity Type</Label>
                                <Select
                                    value={filters.entity_type || "all"}
                                    onValueChange={(value) => handleFilterChange("entity_type", value === "all" ? "" : value)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="All entities" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All entities</SelectItem>
                                        {entityTypes?.map((type) => (
                                            <SelectItem key={type} value={type}>
                                                {type}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Performed By</Label>
                                <Input
                                    placeholder="User name or ID"
                                    value={filters.performed_by}
                                    onChange={(e) => handleFilterChange("performed_by", e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Start Date</Label>
                                <Input
                                    type="date"
                                    value={filters.start_date}
                                    onChange={(e) => handleFilterChange("start_date", e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>End Date</Label>
                                <Input
                                    type="date"
                                    value={filters.end_date}
                                    onChange={(e) => handleFilterChange("end_date", e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="mt-4 flex justify-end">
                            <Button variant="ghost" onClick={clearFilters}>
                                Clear Filters
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Audit Logs Table */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2">
                                <Activity className="h-5 w-5" />
                                Activity Log
                            </CardTitle>
                            {auditData && (
                                <Badge variant="secondary">
                                    {auditData.total} total records
                                </Badge>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[600px]">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[180px]">Timestamp</TableHead>
                                        <TableHead className="w-[200px]">Action</TableHead>
                                        <TableHead className="w-[120px]">Entity</TableHead>
                                        <TableHead>Details</TableHead>
                                        <TableHead className="w-[150px]">Performed By</TableHead>
                                        <TableHead className="w-[80px]">Role</TableHead>
                                        <TableHead className="w-[80px]">IP</TableHead>
                                        <TableHead className="w-[60px]">View</TableHead>
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
                                                    {log.action}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    {getEntityIcon(log.entity_type)}
                                                    <span className="capitalize text-sm">{log.entity_type}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="max-w-[300px]">
                                                    <p className="font-medium truncate">
                                                        {log.entity_name || log.entity_id || "—"}
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
                                                    {log.performed_by_role.replace("_", " ")}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                                {log.ip_address || "—"}
                                            </TableCell>
                                            <TableCell>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => viewDetails(log)}
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {(!auditData?.logs || auditData.logs.length === 0) && (
                                        <TableRow>
                                            <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                                No audit logs found. Try adjusting your filters.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </ScrollArea>

                        {/* Pagination */}
                        {auditData && auditData.total > limit && (
                            <div className="flex items-center justify-between mt-4 pt-4 border-t">
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
                            <DialogTitle>Audit Log Details</DialogTitle>
                        </DialogHeader>
                        {selectedLog && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label className="text-muted-foreground">Timestamp</Label>
                                        <p className="font-medium">{formatDate(selectedLog.timestamp)}</p>
                                    </div>
                                    <div>
                                        <Label className="text-muted-foreground">Action</Label>
                                        <Badge className={getActionColor(selectedLog.action)}>
                                            {selectedLog.action}
                                        </Badge>
                                    </div>
                                    <div>
                                        <Label className="text-muted-foreground">Entity Type</Label>
                                        <p className="font-medium capitalize">{selectedLog.entity_type}</p>
                                    </div>
                                    <div>
                                        <Label className="text-muted-foreground">Entity ID</Label>
                                        <p className="font-medium font-mono text-sm">{selectedLog.entity_id || "—"}</p>
                                    </div>
                                    <div>
                                        <Label className="text-muted-foreground">Entity Name</Label>
                                        <p className="font-medium">{selectedLog.entity_name || "—"}</p>
                                    </div>
                                    <div>
                                        <Label className="text-muted-foreground">Performed By</Label>
                                        <p className="font-medium">{selectedLog.performed_by_name}</p>
                                    </div>
                                    <div>
                                        <Label className="text-muted-foreground">Role</Label>
                                        <Badge variant="outline">{selectedLog.performed_by_role.replace("_", " ")}</Badge>
                                    </div>
                                    <div>
                                        <Label className="text-muted-foreground">IP Address</Label>
                                        <p className="font-medium font-mono text-sm">{selectedLog.ip_address || "—"}</p>
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
                                        <Label className="text-muted-foreground">Metadata</Label>
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
