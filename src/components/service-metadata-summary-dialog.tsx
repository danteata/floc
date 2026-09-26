'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarIcon, Loader2, Save, User, Users, ClipboardCheck, Info, MessageSquare, Plus, CheckCircle2, BookOpen } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { ServiceMetadataSummary, MessageCategory } from '@/types/database'
import { useUser } from '@clerk/clerk-react'
import { MemberCombobox } from '@/components/ui/member-combobox'
import { useEventTypes } from '@/hooks/use-event-types'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { useOrganization } from '@/hooks/use-organization'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'

const serviceMetadataSchema = z.object({
    service_date: z.date(),
    service_type: z.string().min(1, 'Service type is required'),
    service_name: z.string().optional(),
    event_id: z.string().optional(),
    message_title: z.string().optional(),
    message_category: z.string().optional(),
    preacher_id: z.string().optional(),
    preacher_name: z.string().optional(),
    attendance_adults: z.number().min(0, 'Must be 0 or greater'),
    attendance_children: z.number().min(0, 'Must be 0 or greater'),
    first_timers: z.number().min(0, 'Must be 0 or greater'),
    new_converts: z.number().min(0, 'Must be 0 or greater'),
    tithe_payers: z.number().min(0, 'Must be 0 or greater'),
    verified_by_id: z.string().optional(),
    verified_by_name: z.string().optional(),
    notes: z.string().optional(),
})

type ServiceMetadataFormData = z.infer<typeof serviceMetadataSchema>

const MESSAGE_CATEGORIES: Array<{ value: string; label: string; description: string }> = [
    { value: 'christian-living', label: 'Christian Living', description: 'Practical Christian living and daily faith' },
    { value: 'evangelism', label: 'Evangelism', description: 'Sharing the Gospel and outreach' },
    { value: 'discipleship', label: 'Discipleship', description: 'Spiritual growth and discipleship' },
    { value: 'worship', label: 'Worship', description: 'Worship and praise' },
    { value: 'prayer', label: 'Prayer', description: 'Prayer and intercession' },
    { value: 'bible-study', label: 'Bible Study', description: 'Scripture teaching and study' },
    { value: 'missions', label: 'Missions', description: 'Missions and global outreach' },
    { value: 'family-life', label: 'Family Life', description: 'Family relationships and parenting' },
    { value: 'leadership', label: 'Leadership', description: 'Leadership and functional development' },
    { value: 'special-occasion', label: 'Special Occasion', description: 'Weddings, funerals, anniversaries' },
    { value: 'other', label: 'Other', description: 'Other message categories' },
]

interface ServiceMetadataSummaryDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    summary?: ServiceMetadataSummary | null
    onSave?: (data: any) => Promise<void>
    events?: any[]
    members?: any[]
}

export function ServiceMetadataSummaryDialog({
    open,
    onOpenChange,
    summary,
}: ServiceMetadataSummaryDialogProps) {
    const { user } = useUser()
    const { organization } = useOrganization()
    const [isLoading, setIsLoading] = useState(false)
    // Which speaker mode is selected — tracked explicitly rather than derived
    // from preacher_id/preacher_name, since preacher_name is also used to
    // cache the *internal* minister's display name (see the auto-populate
    // effect below). Deriving "guest mode" from "preacher_name is set" meant
    // clicking Guest Speaker on a blank form did nothing observable: it only
    // cleared preacher_id (already empty), and nothing ever made
    // preacher_name truthy since the guest-name field itself only rendered
    // once preacher_name was already truthy — a deadlock.
    const [speakerMode, setSpeakerMode] = useState<'internal' | 'guest'>('internal')
    const { eventTypes } = useEventTypes()

    const createSummary = useMutation(api.financial.createMetadataSummary)
    const updateSummary = useMutation(api.financial.updateMetadataSummary)

    // Data Fetching
    const members = useQuery(api.members.getAll,
        organization ? { organization_id: organization._id } : "skip"
    )
    const events = useQuery(api.events.list,
        organization ? { organization_id: organization._id } : "skip"
    )

    const form = useForm<ServiceMetadataFormData>({
        resolver: zodResolver(serviceMetadataSchema),
        defaultValues: {
            service_date: new Date(),
            service_type: '',
            service_name: '',
            event_id: '',
            message_title: '',
            message_category: '',
            preacher_id: '',
            preacher_name: '',
            attendance_adults: 0,
            attendance_children: 0,
            first_timers: 0,
            new_converts: 0,
            tithe_payers: 0,
            verified_by_id: '',
            verified_by_name: '',
            notes: '',
        },
    })

    // Reset form when dialog opens/closes or summary changes
    useEffect(() => {
        if (open && summary) {
            form.reset({
                service_date: new Date(summary.service_date),
                service_type: summary.service_type,
                service_name: summary.service_name || '',
                event_id: summary.event_id || '',
                message_title: summary.message_title || '',
                message_category: summary.message_category || '',
                preacher_id: (summary as any).preacher_id || '',
                preacher_name: summary.preacher_name || '',
                attendance_adults: summary.attendance_adults,
                attendance_children: summary.attendance_children,
                first_timers: summary.first_timers,
                new_converts: summary.new_converts,
                tithe_payers: summary.tithe_payers,
                verified_by_id: (summary as any).verified_by_id || '',
                verified_by_name: summary.verified_by_name || '',
                notes: summary.notes || '',
            })
            setSpeakerMode(summary.preacher_name && !summary.preacher_id ? 'guest' : 'internal')
        } else if (open && !summary) {
            form.reset({
                service_date: new Date(),
                service_type: '',
                service_name: '',
                event_id: '',
                message_title: '',
                message_category: '',
                preacher_id: '',
                preacher_name: '',
                attendance_adults: 0,
                attendance_children: 0,
                first_timers: 0,
                new_converts: 0,
                tithe_payers: 0,
                verified_by_id: '',
                verified_by_name: '',
                notes: '',
            })
            setSpeakerMode('internal')
        }
    }, [open, summary, form])

    // Auto-populate service name when service type is 'event' and event is selected
    useEffect(() => {
        const serviceType = form.watch('service_type')
        const eventId = form.watch('event_id')

        if (serviceType === 'event' && eventId && events) {
            const selectedEvent = events.find(e => e._id === eventId)
            if (selectedEvent) {
                form.setValue('service_name', selectedEvent.title)
                form.setValue('service_date', new Date(selectedEvent.date))
            }
        } else if (serviceType !== 'event') {
            form.setValue('event_id', '')
        }
    }, [form.watch('service_type'), form.watch('event_id'), events, form])

    // Auto-populate preacher name when preacher is selected
    useEffect(() => {
        const preacherId = form.watch('preacher_id')
        if (preacherId && members) {
            const selectedMember = members.find(m => m._id === preacherId)
            if (selectedMember) {
                form.setValue('preacher_name', selectedMember.name)
            }
        }
    }, [form.watch('preacher_id'), members, form])

    // Auto-populate verifier name when verifier is selected
    useEffect(() => {
        const verifiedById = form.watch('verified_by_id')
        if (verifiedById && members) {
            const selectedMember = members.find(m => m._id === verifiedById)
            if (selectedMember) {
                form.setValue('verified_by_name', selectedMember.name)
            }
        }
    }, [form.watch('verified_by_id'), members, form])

    const onSubmit = async (data: ServiceMetadataFormData) => {
        if (!user?.id || !organization?.id) return

        setIsLoading(true)
        try {
            const summaryPayload: any = {
                ...data,
                recorded_by: user.id,
                recorded_by_name: user.fullName || user.primaryEmailAddress?.emailAddress || 'Unknown User',
                verification_date: data.verified_by_id ? new Date().toISOString() : undefined,
                service_date: data.service_date.toISOString().split('T')[0],
                attendance_total: (data.attendance_adults || 0) + (data.attendance_children || 0),
                organization_id: organization._id as any,
            }

            if (summary) {
                await updateSummary({
                    id: summary._id as any,
                    ...summaryPayload
                })
                toast.success('Service report updated')
            } else {
                await createSummary(summaryPayload)
                toast.success('Service report recorded')
            }
            onOpenChange(false)
        } catch (error) {
            console.error('Error saving service metadata summary:', error)
            toast.error('Failed to save service report')
        } finally {
            setIsLoading(false)
        }
    }

    const watchedServiceType = form.watch('service_type')
    const totalAttendance = (form.watch('attendance_adults') || 0) + (form.watch('attendance_children') || 0)

    if (!open) return null

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[850px] max-h-[90vh] flex flex-col overflow-hidden p-0 border-0 shadow-soft-xl rounded-2xl bg-background">
                {/* Header Strip */}
                <div className="h-1.5 shrink-0 bg-gradient-to-r from-primary to-primary"></div>

                <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                    <DialogHeader className="p-8 pb-4 shrink-0">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <DialogTitle className="text-2xl flex items-center gap-3">
                                    <div className="p-3 bg-primary/15 dark:bg-primary/20 rounded-xl text-primary dark:text-primary">
                                        <ClipboardCheck className="h-6 w-6" />
                                    </div>
                                    {summary ? 'Edit Service Report' : 'New Service Report'}
                                </DialogTitle>
                                <DialogDescription className="text-muted-foreground ml-14">
                                    Record attendance, message details, and service metrics.
                                </DialogDescription>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                <Badge variant="secondary" className="px-3 py-1 text-sm font-semibold rounded-lg bg-secondary/50 text-secondary-foreground">
                                    {summary ? 'ID: ' + (summary._id as string).slice(-8) : 'NEW RECORD'}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground tracking-wider">Service Log</span>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="flex-1 min-h-0 overflow-y-auto p-8 pt-2">
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                                {/* Service Details */}
                                <section className="space-y-6 rounded-xl border border-border/50 bg-muted/20 p-6">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Info className="h-4 w-4 text-primary" />
                                        <h3 className="font-semibold text-lg">Service Information</h3>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <FormField
                                            control={form.control}
                                            name="service_date"
                                            render={({ field }) => (
                                                <FormItem className="flex flex-col">
                                                    <FormLabel className="text-sm">Date</FormLabel>
                                                    <Popover>
                                                        <PopoverTrigger asChild>
                                                            <FormControl>
                                                                <Button
                                                                    variant="outline"
                                                                    className={cn(
                                                                        'h-11 rounded-lg border-input bg-background font-normal',
                                                                        !field.value && 'text-muted-foreground'
                                                                    )}
                                                                >
                                                                    {field.value ? format(field.value, 'PPP') : 'Select date'}
                                                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                                </Button>
                                                            </FormControl>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="w-auto p-0 rounded-lg shadow-soft-lg" align="start">
                                                            <Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => date > new Date() || date < new Date('1900-01-01')} initialFocus className="p-4" />
                                                        </PopoverContent>
                                                    </Popover>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="service_type"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-sm">Service Type</FormLabel>
                                                    <Select onValueChange={field.onChange} value={field.value}>
                                                        <FormControl>
                                                            <SelectTrigger className="h-11 rounded-lg bg-background">
                                                                <SelectValue placeholder="Select Type" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent className="rounded-lg shadow-soft-lg">
                                                            {eventTypes.map((eventType) => (
                                                                <SelectItem key={eventType.value} value={eventType.value}>
                                                                    {eventType.label}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        {watchedServiceType === 'event' && (
                                            <FormField
                                                control={form.control}
                                                name="event_id"
                                                render={({ field }) => (
                                                    <FormItem className="animate-in fade-in slide-in-from-top-2">
                                                        <FormLabel className="text-sm">Linked Event</FormLabel>
                                                        <Select onValueChange={field.onChange} value={field.value}>
                                                            <FormControl>
                                                                <SelectTrigger className="h-11 rounded-lg bg-background">
                                                                    <SelectValue placeholder="Select Event" />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent className="rounded-lg shadow-soft-lg max-h-[300px]">
                                                                <SelectItem value="" className="text-muted-foreground">None</SelectItem>
                                                                {events?.map((event) => (
                                                                    <SelectItem key={event._id} value={event._id}>
                                                                        {event.title} ({format(new Date(event.date), 'MMM dd')})
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        )}

                                        <FormField
                                            control={form.control}
                                            name="service_name"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-sm">Service Name (Optional)</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            placeholder="e.g. Special Revival Service"
                                                            className="h-11 rounded-lg bg-background"
                                                            {...field}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </section>

                                {/* Message Details */}
                                <section className="space-y-6 rounded-xl border border-border/50 bg-muted/20 p-6">
                                    <div className="flex items-center gap-2 mb-2">
                                        <BookOpen className="h-4 w-4 text-primary" />
                                        <h4 className="font-semibold text-lg">Message & Sermon</h4>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <FormField
                                            control={form.control}
                                            name="message_title"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-sm">Sermon Title</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Theme of the message..." className="h-11 rounded-lg bg-background" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="message_category"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-sm">Category</FormLabel>
                                                    <Select onValueChange={field.onChange} value={field.value}>
                                                        <FormControl>
                                                            <SelectTrigger className="h-11 rounded-lg bg-background">
                                                                <SelectValue placeholder="Select Category" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent className="rounded-lg shadow-soft-lg max-h-[300px]">
                                                            {MESSAGE_CATEGORIES.map((category) => (
                                                                <SelectItem key={category.value} value={category.value}>
                                                                    <div className="flex flex-col py-0.5">
                                                                        <span className="font-medium">{category.label}</span>
                                                                        <span className="text-[10px] text-muted-foreground">{category.description}</span>
                                                                    </div>
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>

                                    <div className="space-y-4 pt-2">
                                        <div className="flex items-center gap-4 p-1 bg-muted/50 rounded-lg w-fit">
                                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer transition-colors hover:bg-background">
                                                <input
                                                    type="radio"
                                                    id="member-speaker"
                                                    name="speaker-type"
                                                    checked={speakerMode === 'internal'}
                                                    onChange={() => {
                                                        setSpeakerMode('internal')
                                                        form.setValue('preacher_name', '')
                                                    }}
                                                    className="h-4 w-4 accent-primary cursor-pointer"
                                                />
                                                <label htmlFor="member-speaker" className="text-xs cursor-pointer">Internal Speaker</label>
                                            </div>
                                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer transition-colors hover:bg-background">
                                                <input
                                                    type="radio"
                                                    id="guest-speaker"
                                                    name="speaker-type"
                                                    checked={speakerMode === 'guest'}
                                                    onChange={() => {
                                                        setSpeakerMode('guest')
                                                        form.setValue('preacher_id', '')
                                                    }}
                                                    className="h-4 w-4 accent-primary cursor-pointer"
                                                />
                                                <label htmlFor="guest-speaker" className="text-xs cursor-pointer">Guest Speaker</label>
                                            </div>
                                        </div>

                                        {speakerMode === 'guest' ? (
                                            <FormField
                                                control={form.control}
                                                name="preacher_name"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel className="text-sm">Guest Name</FormLabel>
                                                        <FormControl>
                                                            <Input placeholder="Name of guest speaker..." className="h-11 rounded-lg bg-background" {...field} />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        ) : (
                                            <FormField
                                                control={form.control}
                                                name="preacher_id"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel className="text-sm">Select Minister</FormLabel>
                                                        <MemberCombobox
                                                            members={members?.map(m => ({
                                                                id: m._id,
                                                                name: m.name,
                                                                email: m.email || '',
                                                                initials: m.name.split(' ').map((n: string) => n[0]).join('').toUpperCase()
                                                            })) || []}
                                                            value={field.value}
                                                            onValueChange={field.onChange}
                                                            placeholder="Search for minister..."
                                                            className="h-11 rounded-lg bg-background"
                                                        />
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        )}
                                    </div>
                                </section>

                                {/* Attendance Metrics */}
                                <section className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-6 rounded-xl border border-border/50 bg-muted/20 p-6">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <Users className="h-4 w-4 text-primary" />
                                                    <h3 className="font-semibold text-lg">Attendance</h3>
                                                </div>
                                                <Badge variant="secondary" className="text-lg px-3 py-1 bg-background shadow-sm">
                                                    Total: {totalAttendance}
                                                </Badge>
                                            </div>

                                            <div className="grid grid-cols-2 gap-6">
                                                <FormField
                                                    control={form.control}
                                                    name="attendance_adults"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-sm">Adults</FormLabel>
                                                            <FormControl>
                                                                <Input type="number" className="h-11 rounded-lg bg-background text-lg" {...field} onChange={(e) => field.onChange(parseInt(e.target.value) || 0)} />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name="attendance_children"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-sm">Children</FormLabel>
                                                            <FormControl>
                                                                <Input type="number" className="h-11 rounded-lg bg-background text-lg" {...field} onChange={(e) => field.onChange(parseInt(e.target.value) || 0)} />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-6 rounded-xl border border-border/50 bg-muted/20 p-6">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Plus className="h-4 w-4 text-success-strong" />
                                                <h3 className="font-semibold text-lg">Growth & Metrics</h3>
                                            </div>

                                            <div className="grid grid-cols-1 gap-4">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <FormField
                                                        control={form.control}
                                                        name="first_timers"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel className="text-xs text-muted-foreground">First Timers</FormLabel>
                                                                <FormControl>
                                                                    <Input type="number" className="h-10 rounded-md bg-background" {...field} onChange={(e) => field.onChange(parseInt(e.target.value) || 0)} />
                                                                </FormControl>
                                                            </FormItem>
                                                        )}
                                                    />
                                                    <FormField
                                                        control={form.control}
                                                        name="new_converts"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel className="text-xs text-muted-foreground">New Converts</FormLabel>
                                                                <FormControl>
                                                                    <Input type="number" className="h-10 rounded-md bg-background" {...field} onChange={(e) => field.onChange(parseInt(e.target.value) || 0)} />
                                                                </FormControl>
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>
                                                <FormField
                                                    control={form.control}
                                                    name="tithe_payers"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-xs text-muted-foreground">Tithe Payers</FormLabel>
                                                            <FormControl>
                                                                <Input type="number" className="h-10 rounded-md bg-background" {...field} onChange={(e) => field.onChange(parseInt(e.target.value) || 0)} />
                                                            </FormControl>
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {/* Verification & Notes */}
                                <section className="space-y-6 rounded-xl border border-border/50 bg-muted/20 p-6">
                                    <div className="flex items-center gap-2 mb-2">
                                        <CheckCircle2 className="h-4 w-4 text-primary" />
                                        <h3 className="font-semibold text-lg">Verification</h3>
                                    </div>

                                    <div className="space-y-4">
                                        <FormField
                                            control={form.control}
                                            name="verified_by_id"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-sm">Verified By (Optional)</FormLabel>
                                                    <MemberCombobox
                                                        members={members?.map(m => ({
                                                            id: m._id,
                                                            name: m.name,
                                                            email: m.email || '',
                                                            initials: m.name.split(' ').map((n: string) => n[0]).join('').toUpperCase()
                                                        })) || []}
                                                        value={field.value}
                                                        onValueChange={field.onChange}
                                                        placeholder="Select verifier..."
                                                        className="h-11 rounded-lg bg-background"
                                                    />
                                                    <FormDescription className="text-xs">Select a leader who can verify these metrics.</FormDescription>
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="notes"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-sm">Notes</FormLabel>
                                                    <FormControl>
                                                        <Textarea
                                                            placeholder="Any additional observations or notes..."
                                                            className="min-h-[100px] rounded-lg bg-background resize-none"
                                                            {...field}
                                                        />
                                                    </FormControl>
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </section>

                                <DialogFooter className="pt-4 gap-3">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => onOpenChange(false)}
                                        disabled={isLoading}
                                        className="h-11 rounded-lg px-6"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={isLoading}
                                        className="h-11 rounded-lg px-8 shadow-soft hover:shadow-soft-lg transition-all"
                                    >
                                        {isLoading ? (
                                            <div className="flex items-center gap-2">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                Saving...
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <Save className="h-4 w-4" />
                                                {summary ? 'Update Report' : 'Save Report'}
                                            </div>
                                        )}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </Form>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
