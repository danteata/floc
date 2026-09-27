"use client"

import { useState } from "react"
import { Loader2, Users, Building2 } from "lucide-react"
import { useMutation, useQuery } from "convex/react"
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
import { useOrganization } from "@/hooks/use-organization"
import { Member } from "@/types/database"

/** "functional" → "Functional". */
function sentenceCase(value?: string | null): string {
    const text = (value ?? "").replace(/[_-]+/g, " ")
    return text.charAt(0).toUpperCase() + text.slice(1)
}

interface BulkAddToUnitDialogProps {
    selectedMembers: Member[]
    trigger?: React.ReactNode
    onSuccess?: () => void
}

export function BulkAddToUnitDialog({
    selectedMembers,
    trigger,
    onSuccess,
}: BulkAddToUnitDialogProps) {
    const [open, setOpen] = useState(false)
    const [selectedUnitId, setSelectedUnitId] = useState<string>("")
    const [isLoading, setIsLoading] = useState(false)
    const { toast } = useToast()
    const { organization } = useOrganization()

    const units = useQuery(
        api.units.listByOrg,
        organization?._id ? { organization_id: organization._id } : "skip"
    )

    const bulkAddToUnit = useMutation(api.members.bulkAddToUnit)

    const handleAddToUnit = async () => {
        if (!selectedUnitId || selectedMembers.length === 0) return

        setIsLoading(true)
        try {
            const result = await bulkAddToUnit({
                member_ids: selectedMembers.map(m => m.id as Id<"members">),
                unit_id: selectedUnitId as Id<"units">,
            })

            toast({
                title: "Members added to unit",
                description: `${result.added} member${result.added !== 1 ? 's' : ''} added to ${selectedUnit?.name ?? "the unit"}.${result.skipped > 0 ? ` ${result.skipped} ${result.skipped === 1 ? "was" : "were"} already in it.` : ''}`,
            })

            setOpen(false)
            setSelectedUnitId("")
            onSuccess?.()
        } catch (error) {
            toast({
                title: "Couldn't add members to the unit",
                description: error instanceof Error ? error.message : "Something went wrong. Try again.",
                variant: "destructive",
            })
        } finally {
            setIsLoading(false)
        }
    }

    const selectedUnit = units?.find(u => u._id === selectedUnitId)

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="outline" size="sm" className="gap-2">
                        <Building2 className="w-4 h-4" />
                        Add to unit
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        Add to a unit
                    </DialogTitle>
                    <DialogDescription>
                        Add {selectedMembers.length} selected member{selectedMembers.length !== 1 ? 's' : ''} to a unit.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Selected members summary */}
                    <div className="space-y-2">
                        <p className="text-sm font-medium">Selected</p>
                        <div className="flex items-center gap-2 rounded-lg bg-muted/40 p-3">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">
                                {selectedMembers.length} member{selectedMembers.length !== 1 ? 's' : ''} selected
                            </span>
                        </div>
                    </div>

                    {/* Unit selection */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium">
                            Unit
                        </label>
                        <Select value={selectedUnitId} onValueChange={setSelectedUnitId}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Choose a unit…" />
                            </SelectTrigger>
                            <SelectContent className="max-h-[300px]">
                                {units?.map((unit) => (
                                    <SelectItem key={unit._id} value={unit._id}>
                                        <div className="flex items-center gap-2">
                                            <span>{unit.name}</span>
                                            <Badge variant="outline" className="ml-2 font-normal">
                                                {sentenceCase(unit.type)}
                                            </Badge>
                                        </div>
                                    </SelectItem>
                                ))}
                                {(!units || units.length === 0) && (
                                    <div className="p-4 text-center text-sm text-muted-foreground">
                                        No units yet. Create one on the units page.
                                    </div>
                                )}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Selected unit preview */}
                    {selectedUnit && (
                        <div className="rounded-lg p-4 ring-1 ring-foreground/10">
                            <div className="flex items-start gap-3">
                                <div className="pt-0.5">
                                    <Building2 className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div>
                                    <h4 className="font-semibold text-sm">{selectedUnit.name}</h4>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {sentenceCase(selectedUnit.type)}
                                    </p>
                                    {selectedUnit.description && (
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {selectedUnit.description}
                                        </p>
                                    )}
                                </div>
                            </div>
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
                        onClick={handleAddToUnit}
                        disabled={isLoading || !selectedUnitId}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Adding…
                            </>
                        ) : (
                            <>
                                <Building2 className="h-4 w-4 mr-2" />
                                Add to unit
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
