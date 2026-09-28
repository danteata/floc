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
import { CalendarIcon, X, Plus, Loader2, Save, Info, Wallet, UserCheck, ShieldCheck, Tag } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { ServiceFinancialSummary } from '@/types/database'
import { useUser } from '@clerk/clerk-react'
import { MemberCombobox } from '@/components/ui/member-combobox'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { useOrganization } from '@/hooks/use-organization'
import { toast } from 'sonner'
import { CURRENCIES, formatMoney, useCurrency } from '@/lib/money'
import { formatDayShort, toDate } from '@/lib/display'
import type { Id } from '../../convex/_generated/dataModel'

// Radix Select can't hold an empty value, so "no event" has its own.
const NO_EVENT = '__none__'

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
    counted_by: z.array(z.string()).min(1, 'Add at least one witness'),
    counted_by_names: z.array(z.string()).min(1, 'Add at least one witness'),
    notes: z.string().optional(),
})

type ServiceSummaryFormData = z.infer<typeof serviceSummarySchema>

interface ServiceFinancialSummaryDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    summary?: ServiceFinancialSummary | null
}

/**
 * Witnesses are stored as one list of names joined by " · ", which reads well
 * in the summaries table and, unlike a comma, won't appear inside a name
 * ("Mensah, Kofi"). Rows saved before used ", ".
 */
const WITNESS_SEPARATOR = ' · '

function joinWitnesses(names: string[]): string | undefined {
    const list = names.map((name) => name.trim()).filter(Boolean)
    return list.length > 0 ? list.join(WITNESS_SEPARATOR) : undefined
}

function splitWitnesses(value: string | undefined): string[] {
    const text = value ?? ''
    // Older rows have no "·" and were joined with commas.
    const parts = text.includes(WITNESS_SEPARATOR.trim()) ? text.split(WITNESS_SEPARATOR.trim()) : text.split(',')
    return parts.map((name) => name.trim()).filter(Boolean)
}

const SERVICE_TYPES = [
    { value: 'sunday_service', label: 'Sunday service' },
    { value: 'wednesday_service', label: 'Wednesday service' },
    { value: 'special_service', label: 'Special service' },
    { value: 'event', label: 'Church event' },
    { value: 'other', label: 'Other' }
] as const



export function ServiceFinancialSummaryDialog({
    open,
    onOpenChange,
    summary,
}: ServiceFinancialSummaryDialogProps) {
    const { user } = useUser()
    const { organization } = useOrganization()
    const churchCurrency = useCurrency()
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
                service_date: toDate(summary.service_date),
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
                counted_by: splitWitnesses(summary.witnessed_by),
                counted_by_names: splitWitnesses(summary.witnessed_by_name ?? summary.witnessed_by),
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
                currency: churchCurrency,
                counted_by: [],
                counted_by_names: [],
                notes: '',
            })
        }
    }, [open, summary, form, churchCurrency])

    // Auto-populate service name and event_id when service type is 'event'
    useEffect(() => {
        const serviceType = form.watch('service_type')
        const eventId = form.watch('event_id')

        if (serviceType === 'event' && eventId && events) {
            const selectedEvent = events.find(e => e._id === eventId)
            if (selectedEvent) {
                form.setValue('service_name', selectedEvent.title)
                form.setValue('service_date', toDate(selectedEvent.date))
            }
        } else if (serviceType !== 'event') {
            form.setValue('event_id', '')
        }
    }, [form.watch('service_type'), form.watch('event_id'), events, form])

    const onSubmit = async (data: ServiceSummaryFormData) => {
        // The org document's key is _id; checking `.id` (always undefined)
        // made every save return here without a word.
        if (!user?.id || !organization?._id) return

        setIsLoading(true)
        try {
            const total_tithes = data.tithes_cash + data.tithes_electronic
            const total_offerings = data.offerings_cash + data.offerings_electronic
            const total_special_offerings = (data.special_offerings_cash || 0) + (data.special_offerings_electronic || 0)

            const summaryPayload = {
                // The calendar day picked, not the UTC day.
                service_date: format(data.service_date, 'yyyy-MM-dd'),
                service_type: data.service_type,
                service_name: data.service_name || '',
                event_id: data.event_id ? (data.event_id as Id<'events'>) : undefined,
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
                // Every witness is kept, as one list of names: the table has a
                // single field, and keeping only the first dropped the rest.
                witnessed_by: joinWitnesses(data.counted_by),
                witnessed_by_name: joinWitnesses(data.counted_by_names),
                notes: data.notes,
            }

            if (summary) {
                // Only fields updateServiceSummary declares; null unlinks an event.
                await updateSummary({
                    id: summary._id as Id<'service_financial_summaries'>,
                    ...summaryPayload,
                    event_id: summaryPayload.event_id ?? null,
                })
                toast.success('Service summary updated')
            } else {
                await createSummary({
                    ...summaryPayload,
                    recorded_by: user.id,
                    recorded_by_name: user.fullName || user.username || 'System Agent',
                    organization_id: organization._id,
                })
                toast.success('Service summary added')
            }
            onOpenChange(false)
        } catch (error) {
            console.error('Error saving service summary:', error)
            toast.error("Couldn't save the service summary", { description: error instanceof Error ? error.message : undefined })
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
                <div className="flex flex-col h-full overflow-hidden">
                    <DialogHeader className="p-8 pb-4">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <DialogTitle className="text-xl font-semibold">
                                    {summary ? 'Edit service summary' : 'Add a service summary'}
                                </DialogTitle>
                                <DialogDescription className="text-sm text-muted-foreground">
                                    The tithes and offerings counted at one service or event.
                                </DialogDescription>
                            </div>
                            <Badge variant="secondary" className="px-3 py-1 text-sm font-semibold rounded-lg tabular-nums">
                                Total {formatMoney(tithesTotal + offeringsTotal + specialOfferingsTotal, form.watch('currency'))}
                            </Badge>
                        </div>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto p-8 pt-2">
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                                {/* Service Details */}
                                <section className="space-y-6 rounded-xl border border-border/50 bg-muted/20 p-6">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Tag className="h-4 w-4 text-muted-foreground" />
                                        <h3 className="font-semibold text-base">Service</h3>
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
                                                                    {field.value ? format(field.value, 'd MMM yyyy') : 'Pick a date'}
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
                                                    <FormLabel className="text-sm">Service type</FormLabel>
                                                    <Select onValueChange={field.onChange} value={field.value}>
                                                        <FormControl>
                                                            <SelectTrigger className="h-11 rounded-lg bg-background">
                                                                <SelectValue placeholder="Choose a type" />
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
                                                        <FormLabel className="text-sm">Linked event</FormLabel>
                                                        <Select onValueChange={(value) => field.onChange(value === NO_EVENT ? '' : value)} value={field.value || NO_EVENT}>
                                                            <FormControl>
                                                                <SelectTrigger className="h-11 rounded-lg bg-background">
                                                                    <SelectValue placeholder="Choose an event" />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent className="rounded-lg shadow-soft-lg max-h-[300px]">
                                                                <SelectItem value={NO_EVENT} className="text-muted-foreground">None</SelectItem>
                                                                {events?.map((event) => (
                                                                    <SelectItem key={event._id} value={event._id}>
                                                                        {event.title} ({formatDayShort(event.date)})
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
                                                    <FormLabel className="text-sm">Service name (optional)</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            placeholder="For example, Revival night"
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
                                        <Wallet className="h-4 w-4 text-muted-foreground" />
                                        <h3 className="font-semibold text-base">Giving</h3>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                                        {/* Tithes */}
                                        <section className="space-y-4 rounded-xl border border-border/50 bg-muted/20 p-6">
                                            <div className="flex items-center gap-2 text-foreground mb-2">
                                                <ShieldCheck className="h-4 w-4" />
                                                <h4 className="font-semibold text-sm">Tithes</h4>
                                            </div>

                                            <FormField
                                                control={form.control}
                                                name="tithe_payers"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel className="text-xs text-muted-foreground">Number of tithe payers</FormLabel>
                                                        <FormControl>
                                                            <Input type="number" className="h-10 rounded-md bg-background" {...field} onChange={(e) => field.onChange(parseInt(e.target.value) || 0)} />
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
                                                                <Input type="number" className="h-10 rounded-md bg-background" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
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
                                                                <Input type="number" className="h-10 rounded-md bg-background" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
                                                            </FormControl>
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                            <div className="flex justify-between items-center pt-2 border-t border-border/50">
                                                <span className="text-xs text-muted-foreground">Total tithes</span>
                                                <span className="text-lg tabular-nums text-foreground">{formatMoney(tithesTotal, form.watch('currency'))}</span>
                                            </div>
                                        </section>

                                        {/* Offerings */}
                                        <section className="space-y-4 rounded-xl border border-border/50 bg-muted/20 p-6">
                                            <div className="flex items-center gap-2 text-foreground mb-2">
                                                <Info className="h-4 w-4" />
                                                <h4 className="font-semibold text-sm">Offerings</h4>
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
                                                                <Input type="number" className="h-10 rounded-md bg-background" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
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
                                                                <Input type="number" className="h-10 rounded-md bg-background" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
                                                            </FormControl>
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                            <div className="flex justify-between items-center pt-2 border-t border-border/50">
                                                <span className="text-xs text-muted-foreground">Total offerings</span>
                                                <span className="text-lg tabular-nums text-foreground">{formatMoney(offeringsTotal, form.watch('currency'))}</span>
                                            </div>
                                        </section>

                                        {/* Special Offerings */}
                                        <section className="col-span-1 md:col-span-2 space-y-4 rounded-xl border border-border/50 bg-muted/20 p-6">
                                            <div className="flex items-center gap-2 text-foreground mb-2">
                                                <Info className="h-4 w-4" />
                                                <h4 className="font-semibold text-sm">Special offerings</h4>
                                            </div>

                                            <FormField
                                                control={form.control}
                                                name="special_offering_description"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel className="text-xs text-muted-foreground">What it was for</FormLabel>
                                                        <FormControl>
                                                            <Input placeholder="For example, Building fund" className="h-10 rounded-md bg-background" {...field} />
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
                                                                <Input type="number" className="h-10 rounded-md bg-background" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
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
                                                                <Input type="number" className="h-10 rounded-md bg-background" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
                                                            </FormControl>
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                            <div className="flex justify-between items-center pt-2 border-t border-border/50">
                                                <span className="text-xs text-muted-foreground">Total special offerings</span>
                                                <span className="text-lg tabular-nums text-foreground">{formatMoney(specialOfferingsTotal, form.watch('currency'))}</span>
                                            </div>
                                        </section>
                                    </div>
                                </div>

                                {/* Verification */}
                                <div className="space-y-6 rounded-xl border border-border/50 bg-muted/20 p-6">
                                    <div className="flex items-center gap-2 mb-2">
                                        <UserCheck className="h-4 w-4 text-muted-foreground" />
                                        <h3 className="font-semibold text-base">Counting and witnesses</h3>
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
                                                                <SelectValue placeholder="Choose a currency" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent className="rounded-lg shadow-soft-lg">
                                                            {CURRENCIES.map((c) => (
                                                                <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </FormItem>
                                            )}
                                        />

                                        <div className="space-y-3">
                                            <FormLabel className="text-sm">Witnesses</FormLabel>
                                            <div className="flex flex-wrap gap-2 p-3 border border-input rounded-lg min-h-[50px] bg-background">
                                                {countedByNames.length === 0 && (
                                                    <span className="text-sm text-muted-foreground">No witnesses yet</span>
                                                )}
                                                {countedByNames.map((name, index) => (
                                                    <Badge key={index} variant="secondary" className="px-3 py-1 text-xs rounded-full bg-secondary/50 flex items-center gap-1">
                                                        {name}
                                                        <X className="h-3 w-3 cursor-pointer hover:text-destructive transition-colors" aria-label={`Remove ${name}`} onClick={() => removeTreasurer(name)} />
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
                                                placeholder="Add a witness…"
                                                className="h-11 rounded-lg"
                                            />
                                            {(form.formState.errors.counted_by_names || form.formState.errors.counted_by) && (
                                                <p className="text-sm text-destructive">Add at least one witness</p>
                                            )}
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
                                                        placeholder="Anything else worth recording"
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
                                                Saving…
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <Save className="h-4 w-4" />
                                                {summary ? 'Save changes' : 'Save summary'}
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
