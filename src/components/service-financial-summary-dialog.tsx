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
import { Badge } from '@/components/ui/badge'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarIcon, X, Plus, Loader2, Save, Info, DollarSign, Calculator, UserCheck, ShieldCheck, Tag } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { ServiceFinancialSummary } from '@/types/database'
import { useUser } from '@clerk/clerk-react'
import { MemberCombobox } from '@/components/ui/member-combobox'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { useOrganization } from '@/hooks/use-organization'
import { toast } from 'sonner'

const serviceSummarySchema = z.object({
    service_date: z.date(),
    service_type: z.string().min(1, 'Service type is required'),
    service_name: z.string().optional(),
    event_id: z.string().optional(),
    tithe_payers: z.number().min(0, 'Must be 0 or greater'),
    // Payment method breakdown (totals will be calculated automatically)
    tithes_cash: z.number().min(0, 'Must be 0 or greater'),
    tithes_electronic: z.number().min(0, 'Must be 0 or greater'),
    offerings_cash: z.number().min(0, 'Must be 0 or greater'),
    offerings_electronic: z.number().min(0, 'Must be 0 or greater'),
    special_offerings: z.number().min(0, 'Must be 0 or greater').optional(),
    special_offering_description: z.string().optional(),
    special_offerings_cash: z.number().min(0, 'Must be 0 or greater').optional(),
    special_offerings_electronic: z.number().min(0, 'Must be 0 or greater').optional(),
    // Currency
    currency: z.string().min(1, 'Currency is required'),
    // Treasurer tracking
    counted_by: z.array(z.string()).min(1, 'At least one counter is required'),
    counted_by_names: z.array(z.string()).min(1, 'At least one counter name is required'),
    notes: z.string().optional(),
})

type ServiceSummaryFormData = z.infer<typeof serviceSummarySchema>

interface ServiceFinancialSummaryDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    summary?: ServiceFinancialSummary | null
}

const SERVICE_TYPES = [
    { value: 'sunday_service', label: 'Sunday Service' },
    { value: 'wednesday_service', label: 'Wednesday Service' },
    { value: 'special_service', label: 'Special Service' },
    { value: 'event', label: 'Church Event' },
    { value: 'other', label: 'Other' }
] as const



export function ServiceFinancialSummaryDialog({
    open,
    onOpenChange,
    summary,
}: ServiceFinancialSummaryDialogProps) {
    const { user } = useUser()
    const { organization } = useOrganization()
    const [isLoading, setIsLoading] = useState(false)
    const [newTreasurerName, setNewTreasurerName] = useState('')

    const createSummary = useMutation(api.financial.createServiceSummary)
    const updateSummary = useMutation(api.financial.updateServiceSummary)

    // Data Fetching
    const members = useQuery(api.members.getAll,
        organization ? { organization_id: organization._id } : "skip"
    )
    const events = useQuery(api.events.list,
        organization ? { organization_id: organization._id } : "skip"
    )
    const eventTypes = useQuery(api.event_types.getAll,
        organization ? {} : "skip"
    )

    const form = useForm<ServiceSummaryFormData>({
        resolver: zodResolver(serviceSummarySchema),
        defaultValues: {
            service_date: new Date(),
            service_type: 'sunday_service',
            service_name: '',
            event_id: '',
            tithe_payers: 0,
            tithes_cash: 0,
            tithes_electronic: 0,
            offerings_cash: 0,
            offerings_electronic: 0,
            special_offerings: 0,
            special_offering_description: '',
            special_offerings_cash: 0,
            special_offerings_electronic: 0,
            currency: 'GHS',
            counted_by: [],
            counted_by_names: [],
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
                tithe_payers: summary.tithe_payers,
                tithes_cash: summary.tithes_cash || 0,
                tithes_electronic: summary.tithes_electronic || 0,
                offerings_cash: summary.offerings_cash || 0,
                offerings_electronic: summary.offerings_electronic || 0,
                special_offerings: summary.special_offerings || 0,
                special_offering_description: summary.special_offering_description || '',
                special_offerings_cash: summary.special_offerings_cash || 0,
                special_offerings_electronic: summary.special_offerings_electronic || 0,
                currency: summary.currency || 'GHS',
                counted_by: summary.witnessed_by ? [summary.witnessed_by] : [],
                counted_by_names: summary.witnessed_by_name ? [summary.witnessed_by_name] : [],
                notes: summary.notes || '',
            })
        } else if (open && !summary) {
            form.reset({
                service_date: new Date(),
                service_type: 'sunday_service',
                service_name: '',
                event_id: '',
                tithe_payers: 0,
                tithes_cash: 0,
                tithes_electronic: 0,
                offerings_cash: 0,
                offerings_electronic: 0,
                special_offerings: 0,
                special_offering_description: '',
                special_offerings_cash: 0,
                special_offerings_electronic: 0,
                currency: 'GHS',
                counted_by: [],
                counted_by_names: [],
                notes: '',
            })
        }
    }, [open, summary, form])

    // Auto-populate service name and event_id when service type is 'event'
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

    const onSubmit = async (data: ServiceSummaryFormData) => {
        if (!user?.id || !organization?.id) return

        setIsLoading(true)
        try {
            const total_tithes = data.tithes_cash + data.tithes_electronic
            const total_offerings = data.offerings_cash + data.offerings_electronic
            const total_special_offerings = (data.special_offerings_cash || 0) + (data.special_offerings_electronic || 0)

            const summaryPayload: any = {
                service_date: data.service_date.toISOString().split('T')[0],
                service_type: data.service_type,
                service_name: data.service_name || '',
                event_id: data.event_id as any || undefined,
                total_attendance: 0,
                tithe_payers: data.tithe_payers,
                total_tithes,
                total_offerings,
                total_donations: 0,
                donations_cash: 0,
                donations_electronic: 0,
                special_offerings: total_special_offerings,
                special_offering_description: data.special_offering_description,
                tithes_cash: data.tithes_cash,
                tithes_electronic: data.tithes_electronic,
                offerings_cash: data.offerings_cash,
                offerings_electronic: data.offerings_electronic,
                special_offerings_cash: data.special_offerings_cash,
                special_offerings_electronic: data.special_offerings_electronic,
                currency: data.currency,
                witnessed_by: data.counted_by[0] || '',
                witnessed_by_name: data.counted_by_names[0] || '',
                recorded_by: user.id,
                recorded_by_name: user.fullName || user.username || 'System Agent',
                notes: data.notes,
                organization_id: organization._id,
            }

            if (summary) {
                await updateSummary({
                    id: summary._id as any,
                    ...summaryPayload
                })
                toast.success('Summary updated successfully')
            } else {
                await createSummary(summaryPayload)
                toast.success('Service summary created')
            }
            onOpenChange(false)
        } catch (error) {
            console.error('Error saving service summary:', error)
            toast.error('Failed to save summary')
        } finally {
            setIsLoading(false)
        }
    }

    const watchedServiceType = form.watch('service_type')
    const countedByNames = form.watch('counted_by_names')


    const addTreasurer = (name: string) => {
        if (name.trim() && !countedByNames.includes(name.trim())) {
            const currentNames = form.getValues('counted_by_names')
            const currentIds = form.getValues('counted_by')
            form.setValue('counted_by_names', [...currentNames, name.trim()])
            form.setValue('counted_by', [...currentIds, name.trim()]) // Using name as ID for simplicity
        }
        setNewTreasurerName('')
    }

    const removeTreasurer = (name: string) => {
        const currentNames = form.getValues('counted_by_names')
        const currentIds = form.getValues('counted_by')
        const nameIndex = currentNames.indexOf(name)
        if (nameIndex > -1) {
            form.setValue('counted_by_names', currentNames.filter((_, i) => i !== nameIndex))
            form.setValue('counted_by', currentIds.filter((_, i) => i !== nameIndex))
        }
    }

    // Calculate totals for display
    const tithesTotal = (form.watch('tithes_cash') || 0) + (form.watch('tithes_electronic') || 0)
    const offeringsTotal = (form.watch('offerings_cash') || 0) + (form.watch('offerings_electronic') || 0)
    const specialOfferingsTotal = (form.watch('special_offerings_cash') || 0) + (form.watch('special_offerings_electronic') || 0)

    if (!open) return null

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[850px] max-h-[90vh] overflow-hidden p-0 border-0 shadow-soft-xl rounded-2xl bg-background">
                {/* Header Strip */}
                <div className="h-1.5 bg-gradient-to-r from-primary to-primary/60"></div>

                <div className="flex flex-col h-full overflow-hidden">
                    <DialogHeader className="p-8 pb-4">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <DialogTitle className="text-2xl flex items-center gap-3">
                                    <div className="p-3 bg-primary/10 text-primary rounded-xl shadow-md">
                                        <Calculator className="h-6 w-6" />
                                    </div>
                                    {summary ? 'Edit Service Summary' : 'New Service Summary'}
                                </DialogTitle>
                                <DialogDescription className="text-muted-foreground ml-14">
                                    Record financial details for a service or event.
                                </DialogDescription>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                <Badge variant="secondary" className="px-3 py-1 text-sm font-semibold rounded-lg bg-secondary/50 text-secondary-foreground">
                                    {form.watch('currency')} TOTAL: {(tithesTotal + offeringsTotal + specialOfferingsTotal).toLocaleString()}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground tracking-wider">Draft Record</span>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto p-8 pt-2">
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                                {/* Service Details */}
                                <section className="space-y-6 rounded-xl border border-border/50 bg-muted/20 p-6">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Tag className="h-4 w-4 text-primary" />
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
                                                            {eventTypes?.filter(et => et.is_active).map((eventType) => (
                                                                <SelectItem key={eventType._id} value={eventType.value}>
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

                                {/* Financial Breakdown */}
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 mb-2">
                                        <DollarSign className="h-5 w-5 text-primary" />
                                        <h3 className="font-semibold text-lg">Financial Breakdown</h3>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                                        {/* Tithes */}
                                        <section className="space-y-4 rounded-xl border border-info/50 bg-info/30 p-6">
                                            <div className="flex items-center gap-2 text-info-strong mb-2">
                                                <ShieldCheck className="h-4 w-4" />
                                                <h4 className="font-semibold text-sm tracking-wide">Tithes</h4>
                                            </div>

                                            <FormField
                                                control={form.control}
                                                name="tithe_payers"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel className="text-xs text-muted-foreground">Count of Tithe Payers</FormLabel>
                                                        <FormControl>
                                                            <Input type="number" className="h-10 rounded-md bg-white/50" {...field} onChange={(e) => field.onChange(parseInt(e.target.value) || 0)} />
                                                        </FormControl>
                                                    </FormItem>
                                                )}
                                            />

                                            <div className="grid grid-cols-2 gap-4">
                                                <FormField
                                                    control={form.control}
                                                    name="tithes_cash"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-xs text-muted-foreground">Cash</FormLabel>
                                                            <FormControl>
                                                                <Input type="number" className="h-10 rounded-md bg-white/50" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
                                                            </FormControl>
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name="tithes_electronic"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-xs text-muted-foreground">Digital</FormLabel>
                                                            <FormControl>
                                                                <Input type="number" className="h-10 rounded-md bg-white/50" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
                                                            </FormControl>
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                            <div className="flex justify-between items-center pt-2 border-t border-info/50">
                                                <span className="text-xs text-info-strong">Total Tithes</span>
                                                <span className="text-lg text-info-strong">{form.watch('currency')} {tithesTotal.toLocaleString()}</span>
                                            </div>
                                        </section>

                                        {/* Offerings */}
                                        <section className="space-y-4 rounded-xl border border-success/50 bg-success/30 p-6">
                                            <div className="flex items-center gap-2 text-success-strong mb-2">
                                                <Info className="h-4 w-4" />
                                                <h4 className="font-semibold text-sm tracking-wide">Offerings</h4>
                                            </div>

                                            <div className="h-[4.25rem]"></div> {/* Spacer for payer count alignment */}

                                            <div className="grid grid-cols-2 gap-4">
                                                <FormField
                                                    control={form.control}
                                                    name="offerings_cash"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-xs text-muted-foreground">Cash</FormLabel>
                                                            <FormControl>
                                                                <Input type="number" className="h-10 rounded-md bg-white/50" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
                                                            </FormControl>
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name="offerings_electronic"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-xs text-muted-foreground">Digital</FormLabel>
                                                            <FormControl>
                                                                <Input type="number" className="h-10 rounded-md bg-white/50" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
                                                            </FormControl>
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                            <div className="flex justify-between items-center pt-2 border-t border-success/50">
                                                <span className="text-xs text-success-strong">Total Offerings</span>
                                                <span className="text-lg text-success-strong">{form.watch('currency')} {offeringsTotal.toLocaleString()}</span>
                                            </div>
                                        </section>

                                        {/* Special Offerings */}
                                        <section className="col-span-1 md:col-span-2 space-y-4 rounded-xl border border-warning/50 bg-warning/30 p-6">
                                            <div className="flex items-center gap-2 text-warning-strong mb-2">
                                                <Info className="h-4 w-4" />
                                                <h4 className="font-semibold text-sm tracking-wide">Special Offerings</h4>
                                            </div>

                                            <FormField
                                                control={form.control}
                                                name="special_offering_description"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel className="text-xs text-muted-foreground">Description / Project</FormLabel>
                                                        <FormControl>
                                                            <Input placeholder="e.g. Building Fund" className="h-10 rounded-md bg-white/50" {...field} />
                                                        </FormControl>
                                                    </FormItem>
                                                )}
                                            />

                                            <div className="grid grid-cols-2 gap-6">
                                                <FormField
                                                    control={form.control}
                                                    name="special_offerings_cash"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-xs text-muted-foreground">Cash</FormLabel>
                                                            <FormControl>
                                                                <Input type="number" className="h-10 rounded-md bg-white/50" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
                                                            </FormControl>
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name="special_offerings_electronic"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-xs text-muted-foreground">Digital</FormLabel>
                                                            <FormControl>
                                                                <Input type="number" className="h-10 rounded-md bg-white/50" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
                                                            </FormControl>
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                            <div className="flex justify-between items-center pt-2 border-t border-warning/50">
                                                <span className="text-xs text-warning-strong">Total Special Offerings</span>
                                                <span className="text-lg text-warning-strong">{form.watch('currency')} {specialOfferingsTotal.toLocaleString()}</span>
                                            </div>
                                        </section>
                                    </div>
                                </div>

                                {/* Verification */}
                                <div className="space-y-6 rounded-xl border border-border/50 bg-muted/20 p-6">
                                    <div className="flex items-center gap-2 mb-2">
                                        <UserCheck className="h-5 w-5 text-primary" />
                                        <h3 className="font-semibold text-lg">Verification</h3>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <FormField
                                            control={form.control}
                                            name="currency"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-sm">Currency</FormLabel>
                                                    <Select onValueChange={field.onChange} value={field.value}>
                                                        <FormControl>
                                                            <SelectTrigger className="h-11 rounded-lg bg-background">
                                                                <SelectValue placeholder="Select Currency" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent className="rounded-lg shadow-soft-lg">
                                                            <SelectItem value="GHS">GHS - Ghana Cedi</SelectItem>
                                                            <SelectItem value="USD">USD - US Dollar</SelectItem>
                                                            <SelectItem value="EUR">EUR - Euro</SelectItem>
                                                            <SelectItem value="GBP">GBP - British Pound</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </FormItem>
                                            )}
                                        />

                                        <div className="space-y-3">
                                            <FormLabel className="text-sm">Witnesses</FormLabel>
                                            <div className="flex flex-wrap gap-2 p-3 border border-input rounded-lg min-h-[50px] bg-background">
                                                {countedByNames.length === 0 && (
                                                    <span className="text-sm text-muted-foreground italic">No witnesses added</span>
                                                )}
                                                {countedByNames.map((name, index) => (
                                                    <Badge key={index} variant="secondary" className="px-3 py-1 text-xs rounded-full bg-secondary/50 flex items-center gap-1">
                                                        {name}
                                                        <X className="h-3 w-3 cursor-pointer hover:text-destructive transition-colors" onClick={() => removeTreasurer(name)} />
                                                    </Badge>
                                                ))}
                                            </div>

                                            <MemberCombobox
                                                members={members?.map((m: any) => ({
                                                    id: m._id,
                                                    name: m.name,
                                                    email: m.email || '',
                                                    initials: m.name.split(' ').map((n: string) => n[0]).join('').toUpperCase()
                                                })) || []}
                                                value=""
                                                onValueChange={(memberId) => {
                                                    const selectedMember = members?.find((m: any) => m._id === memberId)
                                                    if (selectedMember) addTreasurer(selectedMember.name)
                                                }}
                                                placeholder="Add a witness..."
                                                className="h-11 rounded-lg"
                                            />
                                        </div>
                                    </div>

                                    <FormField
                                        control={form.control}
                                        name="notes"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-sm">Notes</FormLabel>
                                                <FormControl>
                                                    <Textarea
                                                        placeholder="Enter any additional notes..."
                                                        className="min-h-[100px] resize-none rounded-lg bg-background"
                                                        {...field}
                                                    />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <div className="flex justify-end gap-3 pt-4">
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
                                                {summary ? 'Update Summary' : 'Save Summary'}
                                            </div>
                                        )}
                                    </Button>
                                </div>
                            </form>
                        </Form>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
