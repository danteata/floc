'use client'

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { Input } from "@/components/ui/input"
import { Label as FormLabel } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogDescription,
} from "@/components/ui/dialog"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useUserRole } from "@/hooks/use-user-role"
import { useToast } from "@/hooks/use-toast"
import { Plus, Edit, Trash2, Users, Palette, Shield, Tag } from "lucide-react"
import { cn } from "@/lib/utils"
import { useQuery, useMutation } from "convex/react"
import { api } from "../../convex/_generated/api"
import { Id } from "../../convex/_generated/dataModel"
import { useOrganization } from "@/hooks/use-organization"
import { NoAccess } from "@/components/ui/no-access"
import { LoadingState } from "@/components/ui/loading-state"

interface LabelManagementProps {
    onLabelsChange?: () => void
}

export function LabelManagement({ onLabelsChange }: LabelManagementProps) {
    const { user, isAdmin, isLoading: roleLoading } = useUserRole()
    const { toast } = useToast()
    const { context } = useOrganization()

    // Convex Queries
    const labels = useQuery(api.labels.list, {
        organization_id: context?.organization?._id as Id<"organizations">
    }) || []

    // Convex Mutations
    const createLabel = useMutation(api.labels.create)
    const updateLabel = useMutation(api.labels.update)
    const removeLabel = useMutation(api.labels.remove)

    const [loading, setLoading] = useState(false)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editingLabel, setEditingLabel] = useState<any | null>(null)
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        color: "#3B82F6",
        category: "custom",
    })

    const predefinedColors = [
        "#EF4444", "#F97316", "#F59E0B", "#EAB308", "#84CC16",
        "#22C55E", "#10B981", "#14B8A6", "#06B6D4", "#0EA5E9",
        "#3B82F6", "#6366F1", "#8B5CF6", "#A855F7", "#D946EF",
        "#EC4899", "#F43F5E", "#000000", "#6B7280", "#374151"
    ]

    const categories = [
        "status",
        "ministry",
        "demographic",
        "leadership",
        "skill",
        "interest",
        "custom"
    ]

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!isAdmin) return
        setLoading(true)

        try {
            if (editingLabel) {
                await updateLabel({
                    id: editingLabel._id,
                    updates: {
                        name: formData.name.trim(),
                        description: formData.description.trim(),
                        color: formData.color,
                        category: formData.category,
                    }
                })
                toast({ title: "Label updated" })
            } else {
                await createLabel({
                    name: formData.name.trim(),
                    description: formData.description.trim(),
                    color: formData.color,
                    category: formData.category,
                    is_system_label: false,
                    organization_id: context?.organization?._id as Id<"organizations">,
                    created_by: user?.clerk_user_id,
                    created_by_name: user?.name,
                })
                toast({ title: "Label created" })
            }

            onLabelsChange?.()
            resetForm()
            setDialogOpen(false)
        } catch (error: any) {
            toast({ title: "Couldn't save the label", description: error.message, variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (label: any) => {
        if (!isAdmin) return
        try {
            await removeLabel({ id: label._id })
            toast({ title: "Label deleted" })
            onLabelsChange?.()
        } catch (error: any) {
            toast({ title: "Couldn't delete the label", description: error.message, variant: "destructive" })
        }
    }

    const handleEdit = (label: any) => {
        setEditingLabel(label)
        setFormData({
            name: label.name,
            description: label.description || "",
            color: label.color,
            category: label.category || "custom",
        })
        setDialogOpen(true)
    }

    const resetForm = () => {
        setFormData({
            name: "",
            description: "",
            color: "#3B82F6",
            category: "custom",
        })
        setEditingLabel(null)
    }

    const groupedLabels = labels.reduce((acc, label: any) => {
        const category = label.category || 'other'
        if (!acc[category]) acc[category] = []
        acc[category].push(label)
        return acc
    }, {} as Record<string, any[]>)

    if (roleLoading) return <LoadingState message="Checking your access…" />
    if (!isAdmin) {
        return <NoAccess what="manage labels" who="administrators" />
    }

    return (
        <div className="space-y-8">
            <PageHeader
                title="Labels"
                description="Tags for grouping members, such as visitors to follow up."
                actions={
                    <>
                        <Dialog open={dialogOpen} onOpenChange={(open) => {
                            setDialogOpen(open)
                            if (!open) resetForm()
                        }}>
                            <DialogTrigger asChild>
                                <Button
                                    className="rounded-lg"
                                >
                                    <Plus className="w-4 h-4 mr-2" />
                                    New label
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[550px] p-0 rounded-xl overflow-hidden">
                                <DialogHeader className="p-6 pb-2">
                                    <DialogTitle className="text-lg font-semibold flex items-center gap-2">
                                        {editingLabel ? <Edit className="h-4 w-4 text-muted-foreground" /> : <Plus className="h-4 w-4 text-muted-foreground" />}
                                        {editingLabel ? 'Edit label' : 'New label'}
                                    </DialogTitle>
                                    <DialogDescription className="text-muted-foreground text-sm">
                                        Give the label a name, a category and a colour so it's easy to spot on a member.
                                    </DialogDescription>
                                </DialogHeader>
                                <form onSubmit={handleSubmit} className="p-6 pt-2 space-y-5">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <FormLabel className="text-sm font-medium">Name</FormLabel>
                                            <Input
                                                value={formData.name}
                                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                placeholder="e.g. Core team"
                                                className="rounded-lg border-border h-10"
                                                required
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <FormLabel className="text-sm font-medium">Category</FormLabel>
                                            <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                                                <SelectTrigger className="rounded-lg border-border h-10">
                                                    <SelectValue placeholder="Choose a category" />
                                                </SelectTrigger>
                                                <SelectContent className="border border-border/50 shadow-soft rounded-xl">
                                                    {categories.map(category => (
                                                        <SelectItem key={category} value={category} className="text-sm">
                                                            {categoryName(category)}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <FormLabel className="text-sm font-medium">Description</FormLabel>
                                        <Textarea
                                            value={formData.description}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                            placeholder="Who should have this label?"
                                            rows={3}
                                            className="rounded-lg border-border text-sm resize-none"
                                        />
                                    </div>

                                    <div className="space-y-4">
                                        <FormLabel className="text-sm font-medium">Colour</FormLabel>
                                        <div className="p-4 border border-border rounded-xl bg-muted/50">
                                            <div className="flex flex-wrap gap-2 justify-center">
                                                {predefinedColors.map(color => (
                                                    <button
                                                        key={color}
                                                        type="button"
                                                        onClick={() => setFormData({ ...formData, color })}
                                                        className={cn(
                                                            "w-10 h-10 rounded-lg border-4 transition-all",
                                                            formData.color === color ? "border-foreground scale-110 shadow-sm" : "border-transparent hover:border-border"
                                                        )}
                                                        style={{ backgroundColor: color }}
                                                        aria-label={`Colour ${color}`}
                                                        aria-pressed={formData.color === color}
                                                    />
                                                ))}
                                                <div className="relative">
                                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                        <Palette className="h-4 w-4 text-white drop-shadow-md" />
                                                    </div>
                                                    <Input
                                                        type="color"
                                                        value={formData.color}
                                                        onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                                                        className="w-10 h-10 p-0 border-0 rounded-lg cursor-pointer overflow-hidden"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-3 pt-4">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            onClick={() => setDialogOpen(false)}
                                            className="rounded-lg text-muted-foreground"
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            type="submit"
                                            disabled={loading}
                                            className="rounded-lg"
                                        >
                                            {loading ? "Saving…" : editingLabel ? 'Save changes' : 'Create label'}
                                        </Button>
                                    </div>
                                </form>
                            </DialogContent>
                        </Dialog>
                    </>
                }
            />

            <Tabs defaultValue="all" className="w-full space-y-6">
                <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
                    <TabsList className="bg-muted p-1 rounded-xl w-max">
                        <TabsTrigger value="all" className="rounded-lg px-4 md:px-6">All</TabsTrigger>
                        <TabsTrigger value="system" className="rounded-lg px-4 md:px-6">Built-in</TabsTrigger>
                        <TabsTrigger value="custom" className="rounded-lg px-4 md:px-6">Custom</TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="all" className="space-y-10 animate-in fade-in duration-500 outline-none">
                    {Object.entries(groupedLabels).length === 0 ? (
                        <EmptyState
                            icon={Tag}
                            title="No labels yet"
                            description="Create a label to group members, such as visitors to follow up."
                            className="rounded-xl border border-dashed border-border"
                        />
                    ) : (
                        Object.entries(groupedLabels).map(([category, categoryLabels]) => (
                            <section key={category} className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <h3 className="text-base font-semibold text-foreground">{categoryName(category)}</h3>
                                    <div className="flex-1 h-px bg-border" />
                                    <Badge variant="secondary" className="bg-muted text-muted-foreground border-0 px-2">{categoryLabels.length}</Badge>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {categoryLabels.map(label => (
                                        <LabelCard
                                            key={label._id}
                                            label={label}
                                            showUsage
                                            onEdit={() => handleEdit(label)}
                                            deleteAction={!label.is_system_label && (
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            aria-label={`Delete ${label.name}`}
                                                            className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive-strong transition-all rounded-lg"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle className="text-lg font-semibold">Delete this label?</AlertDialogTitle>
                                                            <AlertDialogDescription className="text-sm text-muted-foreground">
                                                                <span className="font-medium text-foreground">"{label.name}"</span> will be removed from every member who has it. This can't be undone.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter className="gap-2">
                                                            <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
                                                            <AlertDialogAction
                                                                onClick={() => handleDelete(label)}
                                                                className="bg-destructive text-white hover:bg-destructive/90 rounded-lg"
                                                            >
                                                                Delete label
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            )}
                                        />
                                    ))}
                                </div>
                            </section>
                        ))
                    )}
                </TabsContent>

                <TabsContent value="system" className="animate-in fade-in duration-500 outline-none">
                    {labels.filter((l) => l.is_system_label).length === 0 ? (
                        <EmptyState
                            icon={Tag}
                            title="No built-in labels"
                            description="Labels Floc provides will show here."
                            className="rounded-xl border border-dashed border-border"
                        />
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {labels.filter((l) => l.is_system_label).map((label) => (
                                <LabelCard key={label._id} label={label} note="Built in" />
                            ))}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="custom" className="animate-in fade-in duration-500 outline-none">
                    {labels.filter((l) => !l.is_system_label).length === 0 ? (
                        <EmptyState
                            icon={Tag}
                            title="No custom labels yet"
                            description="Labels you create with New label show here."
                            className="rounded-xl border border-dashed border-border"
                        />
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {labels.filter((l) => !l.is_system_label).map((label) => (
                                <LabelCard key={label._id} label={label} onEdit={() => handleEdit(label)} />
                            ))}
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    )
}

/** "demographic" reads "Demographic". */
function categoryName(category: string): string {
    const words = category.replace(/[_-]+/g, " ").trim()
    return words.charAt(0).toUpperCase() + words.slice(1)
}

/** One label: its own colour as a small swatch, name, description and actions. */
interface LabelCardData {
    _id: string
    name: string
    color: string
    description?: string
    category?: string
    usage_count?: number
    is_system_label?: boolean
}

function LabelCard({ label, showUsage, note, onEdit, deleteAction }: {
    label: LabelCardData
    showUsage?: boolean
    note?: string
    onEdit?: () => void
    deleteAction?: React.ReactNode
}) {
    return (
        <Card className="rounded-xl group">
            <CardContent className="p-4 flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span
                            className="h-3 w-3 shrink-0 rounded-full ring-1 ring-foreground/10"
                            style={{ backgroundColor: label.color }}
                            aria-hidden="true"
                        />
                        <span className="font-medium text-sm truncate text-foreground">{label.name}</span>
                        {label.is_system_label && <Shield className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Built in" />}
                    </div>
                    {label.description && (
                        <p className="text-xs text-muted-foreground leading-normal line-clamp-2">
                            {label.description}
                        </p>
                    )}
                    {note && <p className="text-xs text-muted-foreground">{note}</p>}
                    {showUsage && (
                        <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                                <Users className="h-3 w-3" /> {label.usage_count || 0} {(label.usage_count || 0) === 1 ? "member" : "members"}
                            </span>
                            {label.category && <span>· {categoryName(label.category)}</span>}
                        </div>
                    )}
                </div>
                {(onEdit || deleteAction) && (
                    <div className="flex flex-col gap-1 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
                        {onEdit && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={onEdit}
                                aria-label={`Edit ${label.name}`}
                                className="h-8 w-8 hover:bg-muted transition-all rounded-lg"
                            >
                                <Edit className="w-3.5 h-3.5 text-muted-foreground" />
                            </Button>
                        )}
                        {deleteAction}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
