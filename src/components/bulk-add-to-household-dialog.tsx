"use client"

import { useState } from "react"
import { Home, Loader2, Users } from "lucide-react"
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
import { HouseholdCombobox } from "@/components/household-combobox"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { useOrganization } from "@/hooks/use-organization"
import { Member } from "@/types/database"

interface BulkAddToHouseholdDialogProps {
    selectedMembers: Member[]
    trigger?: React.ReactNode
    onSuccess?: () => void
}

export function BulkAddToHouseholdDialog({
    selectedMembers,
    trigger,
    onSuccess,
}: BulkAddToHouseholdDialogProps) {
    const [open, setOpen] = useState(false)
    const [selectedHouseholdId, setSelectedHouseholdId] = useState<string>("")
    const [isLoading, setIsLoading] = useState(false)
    const { toast } = useToast()
    const { organization } = useOrganization()

    const households = useQuery(
        api.households.list,
        organization?._id ? { organization_id: organization._id } : "skip"
    )

    const bulkAddMembers = useMutation(api.households.bulkAddMembers)

    const handleAddToHousehold = async () => {
        if (!selectedHouseholdId || selectedMembers.length === 0) return

        setIsLoading(true)
        try {
            const result = await bulkAddMembers({
                household_id: selectedHouseholdId as Id<"households">,
                member_ids: selectedMembers.map(m => m.id as Id<"members">),
            })

            toast({
                title: "Members added to household",
                description: `${result.added} member${result.added !== 1 ? 's' : ''} added to ${selectedHousehold?.name ?? "the household"}.${result.skipped > 0 ? ` ${result.skipped} skipped because they're already in a household.` : ''}`,
            })

            setOpen(false)
            setSelectedHouseholdId("")
            onSuccess?.()
        } catch (error) {
            toast({
                title: "Couldn't add members to the household",
                description: error instanceof Error ? error.message : "Something went wrong. Try again.",
                variant: "destructive",
            })
        } finally {
            setIsLoading(false)
        }
    }

    const selectedHousehold = households?.find(h => h._id === selectedHouseholdId)

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="outline" size="sm" className="gap-2">
                        <Home className="w-4 h-4" />
                        Add to household
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        Add to a household
                    </DialogTitle>
                    <DialogDescription>
                        Add {selectedMembers.length} selected member{selectedMembers.length !== 1 ? 's' : ''} to a
                        household. Anyone already in a household is skipped. To move them, remove them from their
                        current household first.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    <div className="space-y-2">
                        <p className="text-sm font-medium">Selected</p>
                        <div className="flex items-center gap-2 rounded-lg bg-muted/40 p-3">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">
                                {selectedMembers.length} member{selectedMembers.length !== 1 ? 's' : ''} selected
                            </span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">
                            Household
                        </label>
                        <HouseholdCombobox
                            households={households}
                            value={selectedHouseholdId}
                            onSelect={setSelectedHouseholdId}
                            placeholder="Choose a household…"
                        />
                    </div>

                    {selectedHousehold && (
                        <div className="rounded-lg p-4 ring-1 ring-foreground/10">
                            <div className="flex items-start gap-3">
                                <div className="pt-0.5">
                                    <Home className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div>
                                    <h4 className="font-semibold text-sm">{selectedHousehold.name}</h4>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {selectedHousehold.members.length} current member
                                        {selectedHousehold.members.length !== 1 ? 's' : ''}
                                    </p>
                                    {selectedHousehold.address && (
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {selectedHousehold.address}
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
                        onClick={handleAddToHousehold}
                        disabled={isLoading || !selectedHouseholdId}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Adding…
                            </>
                        ) : (
                            <>
                                <Home className="h-4 w-4 mr-2" />
                                Add to household
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
