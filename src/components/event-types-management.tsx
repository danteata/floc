"use client"

import { useState } from "react"
import { titleCase } from "@/lib/display"
import { Plus, Edit, Trash2, RotateCcw, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { useEventTypes, EventType } from "@/hooks/use-event-types"
import { useUserRole } from "@/hooks/use-user-role"
import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"

const eventTypeSchema = z.object({
  label: z.string().min(1, "Label is required"),
  value: z.string().min(1, "Value is required").regex(/^[a-z0-9-]+$/, "Value must be lowercase letters, numbers, and hyphens only"),
  color: z.enum(['default', 'secondary', 'outline', 'destructive']),
  icon: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  default_time: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Time must be in HH:MM format").optional().or(z.literal("")),
  unit_ids: z.array(z.string()).optional(),
})

type EventTypeFormData = z.infer<typeof eventTypeSchema>

interface EventTypesManagementProps {
  onEventTypesChange?: () => void
}

const BADGE_STYLE_LABELS: Record<string, string> = {
  default: "Default",
  secondary: "Secondary",
  outline: "Outline",
  destructive: "Red",
}

export function EventTypesManagement({ onEventTypesChange }: EventTypesManagementProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingEventType, setEditingEventType] = useState<EventType | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()
  // Reset and "Start from a set" are super-admin only on the server
  // (event_types.resetToDefaults / loadTemplate), so only they see them.
  const { role } = useUserRole()
  const isSuperAdmin = role === 'super_admin'

  // Fetch units for scoping
  const units = useQuery(api.units.list, {}) || []

  const {
    eventTypes,
    categories,
    isLoading: eventTypesLoading,
    addEventType,
    updateEventType,
    removeEventType,
    resetToDefaults,
    loadTemplate,
  } = useEventTypes()

  const form = useForm<EventTypeFormData>({
    resolver: zodResolver(eventTypeSchema),
    defaultValues: {
      label: "",
      value: "",
      color: "outline",
      icon: "",
      category: "",
      description: "",
      default_time: "",
      unit_ids: [],
    },
  })

  const handleAddEventType = () => {
    setEditingEventType(null)
    form.reset({
      label: "",
      value: "",
      color: "outline",
      icon: "",
      category: "",
      description: "",
      default_time: "",
      unit_ids: [],
    })
    setIsDialogOpen(true)
  }

  const handleEditEventType = (eventType: EventType) => {
    setEditingEventType(eventType)
    form.reset({
      label: eventType.label,
      value: eventType.value,
      color: eventType.color || "outline",
      icon: eventType.icon || "",
      category: eventType.category || "",
      description: eventType.description || "",
      default_time: eventType.default_time || "",
      unit_ids: eventType.unit_ids || [],
    })
    setIsDialogOpen(true)
  }

  const handleDeleteEventType = async (value: string) => {
    if (confirm("Delete this event type? Events already scheduled keep their details.")) {
      setIsLoading(true)
      try {
        const result = await removeEventType(value)
        if (result.success) {
          toast({
            title: "Event type deleted",
          })
          onEventTypesChange?.()
        } else {
          throw new Error(result.error)
        }
      } catch (error) {
        toast({
          title: "Couldn't delete the event type",
          description: error instanceof Error ? error.message : undefined,
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }
  }

  const onSubmit = async (data: EventTypeFormData) => {
    setIsLoading(true)
    try {
      let result
      if (editingEventType) {
        result = await updateEventType(editingEventType._id, data)
      } else {
        result = await addEventType(data)
      }

      if (result.success) {
        toast({
          title: `Event type ${editingEventType ? 'updated' : 'created'}`,
        })
        setIsDialogOpen(false)
        onEventTypesChange?.()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      toast({
        title: "Couldn't save the event type",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleResetToDefaults = async () => {
    if (confirm("Go back to the default event types? Any you added yourself will be removed.")) {
      setIsLoading(true)
      try {
        const result = await resetToDefaults()
        if (result.success) {
          toast({
            title: "Event types reset to the defaults",
          })
          onEventTypesChange?.()
        } else {
          throw new Error(result.error)
        }
      } catch (error) {
        toast({
          title: "Couldn't reset the event types",
          description: error instanceof Error ? error.message : undefined,
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }
  }

  const handleLoadTemplate = async (templateName: 'traditional' | 'contemporary' | 'multicultural') => {
    if (confirm(`Use the ${templateName.toLowerCase()} set of event types? It replaces the ones you have now.`)) {
      setIsLoading(true)
      try {
        const result = await loadTemplate(templateName)
        if (result.success) {
          toast({
            title: `${templateName} event types loaded`,
          })
          onEventTypesChange?.()
        } else {
          throw new Error(result.error)
        }
      } catch (error) {
        toast({
          title: "Couldn't load those event types",
          description: error instanceof Error ? error.message : undefined,
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }
  }

  // Auto-generate value from label
  const handleLabelChange = (label: string) => {
    const value = label.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-')
    form.setValue('value', value)
  }

  if (eventTypesLoading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading event types…</div>
  }

  return (
    <Card className="border-0 shadow-none bg-transparent">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-semibold">Event types</CardTitle>
            <CardDescription>
              The kinds of events your church holds, such as services and meetings. You choose one when you schedule an event.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {isSuperAdmin && (
            <Select onValueChange={(value) => handleLoadTemplate(value as any)}>
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="Start from a set" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="traditional">Traditional</SelectItem>
                <SelectItem value="contemporary">Contemporary</SelectItem>
                <SelectItem value="multicultural">Multicultural</SelectItem>
              </SelectContent>
            </Select>
            )}
            {isSuperAdmin && (
            <Button variant="outline" size="sm" onClick={handleResetToDefaults} disabled={isLoading}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset
            </Button>
            )}
            <Button onClick={handleAddEventType} disabled={isLoading}>
              <Plus className="mr-2 h-4 w-4" />
              New event type
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Badge style</TableHead>
              <TableHead className="hidden md:table-cell">Category</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {eventTypes.map((eventType) => (
              <TableRow key={eventType.value}>
                <TableCell className="font-medium">{titleCase(eventType.label)}</TableCell>
                <TableCell className="font-mono text-sm">{eventType.value}</TableCell>
                <TableCell>
                  <Badge variant={eventType.color || 'outline'}>
                    {BADGE_STYLE_LABELS[eventType.color || 'outline'] ?? eventType.color}
                  </Badge>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {eventType.category && (
                    <span className="text-sm text-muted-foreground">
                      {categories.find(cat => cat.id === eventType.category)?.name || eventType.category}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditEventType(eventType)}
                      disabled={isLoading}
                      aria-label={`Edit ${eventType.label}`}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteEventType(eventType._id)}
                      disabled={isLoading}
                      aria-label={`Delete ${eventType.label}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Event Type Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>
                {editingEventType ? "Edit event type" : "New event type"}
              </DialogTitle>
              <DialogDescription>
                {editingEventType
                  ? "Change this event type's name, badge or default time."
                  : "Add a kind of event your church holds."
                }
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="label"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Prayer meeting"
                          {...field}
                          onChange={(e) => {
                            field.onChange(e)
                            if (!editingEventType) {
                              handleLabelChange(e.target.value)
                            }
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="value"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Key</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. prayer-meeting"
                          {...field}
                          disabled={!!editingEventType}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="color"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Badge style</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Choose a style" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="default">Default</SelectItem>
                            <SelectItem value="secondary">Secondary</SelectItem>
                            <SelectItem value="outline">Outline</SelectItem>
                            <SelectItem value="destructive">Red</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Choose a category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {categories.map((category) => (
                              <SelectItem key={category.id} value={category.id}>
                                {category.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="A line on what this event is…"
                          className="resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="default_time"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default time</FormLabel>
                      <FormControl>
                        <Input
                          type="time"
                          placeholder="e.g. 09:00"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                      <p className="text-xs text-muted-foreground">
                        When events of this type usually start. Used when events are created automatically.
                      </p>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="unit_ids"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Units</FormLabel>
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-1.5">
                          {field.value?.map((unitId) => {
                            const unit = units.find((u: any) => u._id === unitId)
                            return unit ? (
                              <Badge
                                key={unitId}
                                variant="secondary"
                                className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                                onClick={() => {
                                  const newValue = field.value?.filter((id) => id !== unitId) || []
                                  field.onChange(newValue)
                                }}
                              >
                                {unit.name}
                                <span className="ml-1">&times;</span>
                              </Badge>
                            ) : null
                          })}
                        </div>
                        <Select
                          onValueChange={(value) => {
                            if (value && !field.value?.includes(value)) {
                              field.onChange([...(field.value || []), value])
                            }
                          }}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Add a unit (optional)" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {units
                              .filter((u: any) => !field.value?.includes(u._id))
                              .map((unit: any) => (
                                <SelectItem key={unit._id} value={unit._id}>
                                  {unit.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <FormMessage />
                      <p className="text-xs text-muted-foreground">
                        With no units chosen, this event is for all members. Choose units to take attendance for just those units.
                      </p>
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                    disabled={isLoading}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? "Saving…" : editingEventType ? "Save changes" : "Create"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
