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
    DialogFooter,
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useUserRole } from "@/hooks/use-user-role"
import { useToast } from "@/hooks/use-toast"
import { Plus, Edit, Trash2, Tag, Users, Palette, Info, Check, Shield } from "lucide-react"
import { cn } from "@/lib/utils"
import { useQuery, useMutation } from "convex/react"
import { api } from "../../convex/_generated/api"
import { Id } from "../../convex/_generated/dataModel"
import { useOrganization } from "@/hooks/use-organization"

interface LabelManagementProps {
    onLabelsChange?: () => void
}

export function LabelManagement({ onLabelsChange }: LabelManagementProps) {
    const { user, isAdmin } = useUserRole()
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
                toast({ title: "Success", description: "Label updated successfully" })
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
                toast({ title: "Success", description: "Label created successfully" })
            }

            onLabelsChange?.()
            resetForm()
            setDialogOpen(false)
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (label: any) => {
        if (!isAdmin) return
        try {
            await removeLabel({ id: label._id })
            toast({ title: "Success", description: "Label deleted successfully" })
            onLabelsChange?.()
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" })
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

    if (!isAdmin) {
        return (
            <div className="text-center py-20 bg-muted/50 border border-dashed border-border rounded-[32px]">
                <Tag className="mx-auto h-16 w-16 mb-6 text-muted-foreground/40" />
                <h3 className="text-xl tracking-tight mb-2">Access Denied</h3>
                <p className="font-medium text-muted-foreground/70 text-sm">You need administrator privileges to manage member labels</p>
            </div>
        )
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
                                    className="h-12 px-6 bg-primary text-primary-foreground hover:bg-primary/90 shadow-soft-xl rounded-xl transition-all"
                                >
                                    <Plus className="w-5 h-5 mr-2 stroke-[3px]" />
                                    Create New Label
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[550px] p-0 border border-border/50 shadow-soft-2xl rounded-3xl overflow-hidden">
                                <DialogHeader className="p-8 pb-4">
                                    <DialogTitle className="text-2xl tracking-tight flex items-center gap-3">
                                        {editingLabel ? <Edit className="h-6 w-6 text-muted-foreground/70" /> : <Plus className="h-6 w-6 text-muted-foreground/70" />}
                                        {editingLabel ? 'Update Label' : 'New Label Identity'}
                                    </DialogTitle>
                                    <DialogDescription className="text-muted-foreground text-sm">
                                        Configure labels to categorize and track member engagement
                                    </DialogDescription>
                                </DialogHeader>
                                <form onSubmit={handleSubmit} className="p-8 pt-4 space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <FormLabel className="text-[10px] text-muted-foreground/70 tracking-wider pl-1">Label Name</FormLabel>
                                            <Input
                                                value={formData.name}
                                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                placeholder="e.g. Core Team"
                                                className="rounded-xl border-border h-11"
                                                required
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <FormLabel className="text-[10px] text-muted-foreground/70 tracking-wider pl-1">Category</FormLabel>
                                            <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                                                <SelectTrigger className="rounded-xl border-border h-11 capitalize">
                                                    <SelectValue placeholder="Select Category" />
                                                </SelectTrigger>
                                                <SelectContent className="border border-border/50 shadow-soft rounded-xl">
                                                    {categories.map(category => (
                                                        <SelectItem key={category} value={category} className="font-medium capitalize text-sm">
                                                            {category}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <FormLabel className="text-[10px] text-muted-foreground/70 tracking-wider pl-1">Description</FormLabel>
                                        <Textarea
                                            value={formData.description}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                            placeholder="Briefly explain the criteria for this label"
                                            rows={3}
                                            className="rounded-xl border-border text-sm resize-none"
                                        />
                                    </div>

                                    <div className="space-y-4">
                                        <FormLabel className="text-[10px] text-muted-foreground/70 tracking-wider pl-1">Visual Identity</FormLabel>
                                        <div className="p-4 border border-border rounded-2xl bg-muted/50">
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
                                            className="rounded-xl text-muted-foreground"
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            type="submit"
                                            disabled={loading}
                                            className="px-8 h-11 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl shadow-soft"
                                        >
                                            {loading ? "Processing..." : editingLabel ? 'Update Label' : 'Save Label'}
                                        </Button>
                                    </div>
                                </form>
                            </DialogContent>
                        </Dialog>
                    </>
                }
            />

            <Tabs defaultValue="all" className="w-full space-y-6">
                <TabsList className="bg-muted p-1 rounded-xl h-11">
                    <TabsTrigger value="all" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm text-xs px-6 capitalize">All Inventory</TabsTrigger>
                    <TabsTrigger value="system" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm text-xs px-6 capitalize">System Labels</TabsTrigger>
                    <TabsTrigger value="custom" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm text-xs px-6 capitalize">Custom Labels</TabsTrigger>
                </TabsList>

                <TabsContent value="all" className="space-y-10 animate-in fade-in duration-500 outline-none">
                    {Object.entries(groupedLabels).length === 0 ? (
                        <div className="text-center py-24 border border-dashed border-border rounded-[32px] bg-muted/50">
                            <Info className="mx-auto h-12 w-12 mb-4 text-muted-foreground/40" />
                            <p className="font-bold text-muted-foreground/70 text-sm">No labels detected in central registry</p>
                        </div>
                    ) : (
                        Object.entries(groupedLabels).map(([category, categoryLabels]) => (
                            <section key={category} className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <h3 className="text-lg tracking-tight text-foreground">{category}</h3>
                                    <div className="flex-1 h-px bg-muted" />
                                    <Badge variant="secondary" className="bg-muted text-muted-foreground border-0 px-2">{categoryLabels.length}</Badge>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {categoryLabels.map(label => (
                                        <Card key={label._id} className="border-border/50 shadow-soft hover:shadow-soft-xl hover:-translate-y-1 transition-all overflow-hidden rounded-2xl group border">
                                            <CardHeader className="p-0 border-b border-border/50">
                                                <div className="h-2 w-full" style={{ backgroundColor: label.color }} />
                                            </CardHeader>
                                            <CardContent className="p-5 flex items-center justify-between">
                                                <div className="space-y-1 min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-sm truncate text-foreground">{label.name}</span>
                                                        {label.is_system_label && <ShieldIcon className="h-3 w-3 text-muted-foreground/70" />}
                                                    </div>
                                                    {label.description && (
                                                        <p className="text-[11px] text-muted-foreground leading-normal line-clamp-2">
                                                            {label.description}
                                                        </p>
                                                    )}
                                                    <div className="flex items-center gap-2 pt-2">
                                                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full border border-border">
                                                            <Users className="h-2.5 w-2.5" /> {label.usage_count || 0}
                                                        </div>
                                                        <Badge variant="outline" className="text-[9px] border-border text-muted-foreground/70 tracking-widest bg-transparent px-1.5">{label.category}</Badge>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col gap-1 pl-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleEdit(label)}
                                                        className="h-8 w-8 hover:bg-muted transition-all rounded-lg"
                                                    >
                                                        <Edit className="w-3.5 h-3.5 text-muted-foreground/70" />
                                                    </Button>
                                                    {!label.is_system_label && (
                                                        <AlertDialog>
                                                            <AlertDialogTrigger asChild>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive-strong transition-all rounded-lg"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </Button>
                                                            </AlertDialogTrigger>
                                                            <AlertDialogContent className="border border-border/50 shadow-soft-2xl rounded-3xl">
                                                                <AlertDialogHeader>
                                                                    <AlertDialogTitle className="font-black tracking-tight text-xl">Delete Label?</AlertDialogTitle>
                                                                    <AlertDialogDescription className="font-medium text-muted-foreground text-sm">
                                                                        You are about to delete <span className="font-bold text-foreground">"{label.name}"</span>.
                                                                        This will detach the label from all assigned members. This action cannot be undone.
                                                                    </AlertDialogDescription>
                                                                </AlertDialogHeader>
                                                                <AlertDialogFooter className="gap-2">
                                                                    <AlertDialogCancel className="font-bold rounded-xl border-border">Cancel</AlertDialogCancel>
                                                                    <AlertDialogAction
                                                                        onClick={() => handleDelete(label)}
                                                                        className="bg-destructive text-white hover:bg-destructive rounded-xl shadow-sm px-6 h-10"
                                                                    >
                                                                        Delete Permanently
                                                                    </AlertDialogAction>
                                                                </AlertDialogFooter>
                                                            </AlertDialogContent>
                                                        </AlertDialog>
                                                    )}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            </section>
                        ))
                    )}
                </TabsContent>

                <TabsContent value="system" className="animate-in fade-in duration-500 outline-none">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {labels.filter((l: any) => l.is_system_label).map((label: any) => (
                            <Card key={label._id} className="border-border/50 shadow-soft hover:shadow-soft-xl hover:-translate-y-1 transition-all overflow-hidden rounded-2xl group border">
                                <CardHeader className="p-0 border-b border-border/50">
                                    <div className="h-1.5 w-full" style={{ backgroundColor: label.color }} />
                                </CardHeader>
                                <CardContent className="p-5 flex items-center justify-between">
                                    <div className="space-y-1 min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-sm truncate text-foreground">{label.name}</span>
                                            <ShieldIcon className="h-3 w-3 text-muted-foreground/70" />
                                        </div>
                                        <p className="text-[10px] text-muted-foreground">System Integrated Protocol</p>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </TabsContent>

                <TabsContent value="custom" className="animate-in fade-in duration-500 outline-none">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {labels.filter((l: any) => !l.is_system_label).map((label: any) => (
                            <Card key={label._id} className="border-border/50 shadow-soft hover:shadow-soft-xl hover:-translate-y-1 transition-all overflow-hidden rounded-2xl group border">
                                <CardHeader className="p-0 border-b border-border/50">
                                    <div className="h-1.5 w-full" style={{ backgroundColor: label.color }} />
                                </CardHeader>
                                <CardContent className="p-5 flex items-center justify-between">
                                    <div className="space-y-1 min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-sm truncate text-foreground">{label.name}</span>
                                        </div>
                                        {label.description && (
                                            <p className="text-[11px] text-muted-foreground leading-normal line-clamp-2">
                                                {label.description}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex flex-col gap-1 pl-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleEdit(label)}
                                            className="h-8 w-8 hover:bg-muted transition-all rounded-lg"
                                        >
                                            <Edit className="w-3.5 h-3.5 text-muted-foreground/70" />
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    )
}

function ShieldIcon({ className }: { className?: string }) {
    return (
        <Shield className={cn("h-4 w-4", className)} />
    )
}
