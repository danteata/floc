"use client"

import { useState, useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { X, Tag, Plus, Check } from "lucide-react"
import { useUserRole } from "@/hooks/use-user-role"
import { useQuery, useMutation } from "convex/react"
import { api } from "../../convex/_generated/api"
import { Id } from "../../convex/_generated/dataModel"

interface LabelType {
    _id: Id<"labels">;
    name: string;
    description?: string;
    color?: string;
    category?: string;
    is_active: boolean;
}

interface LabelSelectorProps {
    memberId: string
    currentLabels?: LabelType[]
    onLabelsChange?: (labels: LabelType[]) => void
    variant?: 'compact' | 'full'
    showDialog?: boolean
}

export function LabelSelector({
    memberId,
    variant = 'compact',
    onLabelsChange
}: LabelSelectorProps) {
    const { user } = useUserRole()
    const [isOpen, setIsOpen] = useState(false)
    const [searchValue, setSearchValue] = useState("")

    // Convex Queries & Mutations
    const availableLabels = useQuery(api.labels.list, {}) || []
    const selectedLabels = useQuery(api.labels.getByMember, { member_id: memberId as Id<"members"> }) || []
    const toggleLabel = useMutation(api.labels.toggleMemberLabel)

    const handleLabelToggle = async (label: LabelType) => {
        try {
            await toggleLabel({
                member_id: memberId as Id<"members">,
                label_id: label._id,
                assigned_by: user?.id,
                assigned_by_name: user?.name
            });
            // Convex will automatically update the selectedLabels query
        } catch (error) {
            console.error('Error toggling label:', error)
        }
    }

    const filteredLabels = useMemo(() =>
        availableLabels.filter((label: LabelType) =>
            label.name.toLowerCase().includes(searchValue.toLowerCase())
        )
        , [availableLabels, searchValue])

    const groupedLabels = useMemo(() =>
        filteredLabels.reduce((acc: Record<string, LabelType[]>, label: LabelType) => {
            const category = label.category || 'other'
            if (!acc[category]) acc[category] = []
            acc[category].push(label)
            return acc
        }, {} as Record<string, LabelType[]>)
        , [filteredLabels])

    if (variant === 'compact') {
        return (
            <div className="flex flex-wrap gap-1">
                {selectedLabels.slice(0, 3).map((label) => (
                    <Badge
                        key={label._id}
                        variant="secondary"
                        className="text-xs"
                        style={{ backgroundColor: `${label.color}20`, borderColor: label.color }}
                    >
                        <Tag className="w-3 h-3 mr-1" style={{ color: label.color }} />
                        {label.name}
                        <button
                            onClick={() => handleLabelToggle(label)}
                            className="ml-1 hover:bg-muted rounded-full p-0.5"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </Badge>
                ))}
                {selectedLabels.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                        +{selectedLabels.length - 3} more
                    </Badge>
                )}
                <Popover open={isOpen} onOpenChange={setIsOpen}>
                    <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-6 px-2">
                            <Plus className="w-3 h-3" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0" align="start">
                        <Command>
                            <CommandInput
                                placeholder="Search labels..."
                                value={searchValue}
                                onValueChange={setSearchValue}
                            />
                            <CommandList>
                                <CommandEmpty>No labels found.</CommandEmpty>
                                {Object.entries(groupedLabels).map(([category, labels]: [string, any]) => (
                                    <CommandGroup key={category} heading={category.charAt(0).toUpperCase() + category.slice(1)}>
                                        {(labels as LabelType[]).map((label: LabelType) => {
                                            const isSelected = selectedLabels.some((l: LabelType) => l._id === label._id)
                                            return (
                                                <CommandItem
                                                    key={label._id}
                                                    onSelect={() => handleLabelToggle(label)}
                                                    className="flex items-center gap-2"
                                                >
                                                    <div
                                                        className="w-3 h-3 rounded-full flex-shrink-0"
                                                        style={{ backgroundColor: label.color }}
                                                    />
                                                    <span className="flex-1">{label.name}</span>
                                                    {isSelected && <Check className="w-4 h-4 text-success-strong" />}
                                                </CommandItem>
                                            )
                                        })}
                                    </CommandGroup>
                                ))}
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
            </div>
        )
    }

    // Full variant for dialog
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
                {selectedLabels.map((label) => (
                    <Badge
                        key={label._id}
                        variant="secondary"
                        className="text-sm py-1 px-3"
                        style={{ backgroundColor: `${label.color}20`, borderColor: label.color }}
                    >
                        <Tag className="w-4 h-4 mr-2" style={{ color: label.color }} />
                        {label.name}
                        <button
                            onClick={() => handleLabelToggle(label)}
                            className="ml-2 hover:bg-muted rounded-full p-0.5"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </Badge>
                ))}
            </div>

            <div className="border rounded-lg p-4">
                <Label className="text-sm mb-2 block">Available Labels</Label>
                <Input
                    placeholder="Search labels..."
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    className="mb-3"
                />

                <div className="max-h-60 overflow-y-auto space-y-3">
                    {Object.entries(groupedLabels).map(([category, labels]: [string, any]) => (
                        <div key={category}>
                            <h4 className="text-sm text-foreground mb-2 capitalize">
                                {category}
                            </h4>
                            <div className="grid grid-cols-1 gap-2">
                                {(labels as LabelType[]).map((label: LabelType) => {
                                    const isSelected = selectedLabels.some((l: LabelType) => l._id === label._id)
                                    return (
                                        <button
                                            key={label._id}
                                            onClick={() => handleLabelToggle(label)}
                                            className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${isSelected
                                                ? 'border-info/30 bg-info/10'
                                                : 'border-border hover:border-border'
                                                }`}
                                        >
                                            <div
                                                className="w-4 h-4 rounded-full flex-shrink-0"
                                                style={{ backgroundColor: label.color }}
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-sm">{label.name}</div>
                                                {label.description && (
                                                    <div className="text-xs text-muted-foreground truncate">
                                                        {label.description}
                                                    </div>
                                                )}
                                            </div>
                                            {isSelected && <Check className="w-4 h-4 text-info-strong" />}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

// Compact version for use in tables/lists
export function MemberLabels({ labels }: { labels: LabelType[] }) {
    if (!labels || labels.length === 0) {
        return <span className="text-muted-foreground/70 text-sm">No labels</span>
    }

    return (
        <div className="flex flex-wrap gap-1">
            {labels.slice(0, 2).map((label) => (
                <Badge
                    key={label._id}
                    variant="secondary"
                    className="text-xs px-2 py-0.5"
                    style={{ backgroundColor: `${label.color}20`, borderColor: label.color }}
                >
                    <Tag className="w-3 h-3 mr-1" style={{ color: label.color }} />
                    {label.name}
                </Badge>
            ))}
            {labels.length > 2 && (
                <Badge variant="outline" className="text-xs px-2 py-0.5">
                    +{labels.length - 2}
                </Badge>
            )}
        </div>
    )
}
