"use client"

import { useState } from "react"
import { Loader2, Users, ShieldAlert } from "lucide-react"
import { useMutation } from "convex/react"
import { api } from "../../convex/_generated/api"
import { Id } from "../../convex/_generated/dataModel"

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { Member } from "@/types/database"

interface BulkStatusDialogProps {
    selectedMembers: Member[]
    trigger?: React.ReactNode
    onSuccess?: () => void
}

const STATUS_OPTIONS = [
    { value: "active", label: "Active", tone: "bg-success/15 text-success-strong", hint: "Attending and part of church life." },
    { value: "inactive", label: "Inactive", tone: "bg-warning/15 text-warning-strong", hint: "Still a member, but not attending at the moment." },
    { value: "visitor", label: "Visitor", tone: "bg-info/15 text-info-strong", hint: "Visiting and not yet a member." },
]

export function BulkStatusDialog({
    selectedMembers,
    trigger,
    onSuccess,
}: BulkStatusDialogProps) {
    const [open, setOpen] = useState(false)
    const [selectedStatus, setSelectedStatus] = useState<string>("")
    const [isLoading, setIsLoading] = useState(false)
    const { toast } = useToast()

    const bulkUpdateStatus = useMutation(api.members.bulkUpdateStatus)

    const handleUpdateStatus = async () => {
        if (!selectedStatus || selectedMembers.length === 0) return

        setIsLoading(true)
        try {
            const result = await bulkUpdateStatus({
                member_ids: selectedMembers.map(m => m.id as Id<"members">),
                status: selectedStatus,
            })

            toast({
                title: "Status updated",
                description: `${result.updated} member${result.updated !== 1 ? "s are" : " is"} now ${(selectedStatusMeta?.label ?? selectedStatus).toLowerCase()}.`,
            })

            setOpen(false)
            setSelectedStatus("")
            onSuccess?.()
        } catch (error) {
            toast({
                title: "Couldn't update the status",
                description: error instanceof Error ? error.message : "Something went wrong. Try again.",
                variant: "destructive",
            })
        } finally {
            setIsLoading(false)
        }
    }

    const selectedStatusMeta = STATUS_OPTIONS.find(s => s.value === selectedStatus)

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="outline" size="sm" className="gap-2">
                        <ShieldAlert className="w-4 h-4" />
                        Set status
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        Set status
                    </DialogTitle>
                    <DialogDescription>
                        Apply a status to {selectedMembers.length} selected member{selectedMembers.length !== 1 ? "s" : ""}.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    <div className="space-y-2">
                        <p className="text-sm font-medium">Selected</p>
                        <div className="flex items-center gap-2 rounded-lg bg-muted/40 p-3">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">
                                {selectedMembers.length} member{selectedMembers.length !== 1 ? "s" : ""} selected
                            </span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">
                            New status
                        </label>
                        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Choose a status…" />
                            </SelectTrigger>
                            <SelectContent>
                                {STATUS_OPTIONS.map((status) => (
                                    <SelectItem key={status.value} value={status.value}>
                                        <Badge className={status.tone}>{status.label}</Badge>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {selectedStatusMeta && (
                        <div className="rounded-lg p-4 ring-1 ring-foreground/10">
                            <h4 className="font-semibold text-sm">{selectedStatusMeta.label}</h4>
                            <p className="text-xs text-muted-foreground mt-1">
                                {selectedStatusMeta.hint} Every selected member will be set to this.
                            </p>
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2">
                    <Button
                        variant="ghost"
                        onClick={() => setOpen(false)}
                        disabled={isLoading}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleUpdateStatus}
                        disabled={isLoading || !selectedStatus}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Updating…
                            </>
                        ) : (
                            <>
                                Set status
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
