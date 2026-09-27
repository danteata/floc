
import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { useAnalytics } from "@/hooks/useAnalytics"
import { AnalyticsEventType } from "@/services/analytics/types"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useOrganization } from "@/hooks/use-organization"
import { toast } from "sonner"
import { Building2, Loader2 } from "lucide-react"
import { useConvexAuth } from "convex/react"

export function SetupOrganizationDialog() {
    const { organization, isLoading: isOrgLoading } = useOrganization()
    const createOrg = useMutation(api.organizations.create)
    const { trackEvent } = useAnalytics()
    const [name, setName] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isOpen, setIsOpen] = useState(true)
    const { isAuthenticated } = useConvexAuth()

    // Get user role to check if super_admin
    const user = useQuery(api.users.current, isAuthenticated ? undefined : "skip")

    // Don't show if:
    // 1. Still loading
    // 2. Has organization
    // 3. Is super_admin (they manage all orgs, don't need to create one)
    // 4. User data still loading
    if (isOrgLoading || organization || user === undefined || user?.role === "super_admin") {
        return null
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim()) return

        setIsSubmitting(true)
        try {
            await createOrg({ name })
            trackEvent(AnalyticsEventType.ORGANIZATION_CREATED, { name_length: name.length })
            trackEvent(AnalyticsEventType.ORGANIZATION_SETUP_COMPLETED, {})
            toast.success("Your church is set up")
            setIsOpen(false)
            window.location.reload()
        } catch (error) {
            toast.error("Couldn't set up your church", { description: error instanceof Error ? error.message : undefined })
            console.error(error)
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={() => { }}>
            <DialogContent className="sm:max-w-[480px] rounded-xl">
                <DialogHeader className="space-y-4">
                    <Building2 className="mx-auto h-8 w-8 text-muted-foreground" />
                    <DialogTitle className="font-serif text-2xl font-medium text-center text-foreground">
                        Set up your church
                    </DialogTitle>
                    <DialogDescription className="text-center text-sm text-muted-foreground">
                        Welcome to Floc. Start by giving your church its name.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-6 pt-4">
                    <div className="space-y-3">
                        <Label htmlFor="org-name" className="text-sm font-semibold text-foreground">
                            Church name
                        </Label>
                        <Input
                            id="org-name"
                            placeholder="e.g. First Baptist Church"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="h-11 text-base rounded-lg"
                            autoFocus
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            type="submit"
                            className="w-full h-11 rounded-lg"
                            disabled={isSubmitting || !name.trim()}
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Setting up…
                                </>
                            ) : (
                                "Create church"
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
