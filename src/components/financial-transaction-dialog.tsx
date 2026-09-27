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
import { CalendarIcon, Upload, Loader2, Save, ArrowDownLeft, ArrowUpRight, Wallet, Tag, CreditCard, Hash, Info, FileText } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { FinancialTransaction, TransactionCategory } from '@/types/database'
import { TRANSACTION_CATEGORIES, PAYMENT_METHODS } from '@/lib/financial-utils'
import { useUser } from '@clerk/clerk-react'
import { MemberCombobox } from '@/components/ui/member-combobox'
import { useQuery, useMutation } from 'convex/react'
import { useAnalytics } from '@/hooks/useAnalytics'
import { AnalyticsEventType } from '@/services/analytics/types'
import { api } from '../../convex/_generated/api'
import { useOrganization } from '@/hooks/use-organization'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { useCurrency } from '@/lib/money'

/** The currency's own symbol ("GH₵", "₦", "$") for the amount field. */
function currencySymbol(currency: string): string {
    try {
        return new Intl.NumberFormat('en-GB', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
            .formatToParts(0)
            .find((part) => part.type === 'currency')?.value ?? currency
    } catch {
        return currency
    }
}

const transactionSchema = z.object({
    type: z.enum(['income', 'expense']),
    category: z.enum(['tithe', 'offering', 'donation', 'mission', 'utilities', 'maintenance', 'supplies', 'salary', 'event', 'other']),
    amount: z.number().min(0.01, 'Amount must be greater than 0'),
    description: z.string().min(1, 'Description is required'),
    date: z.date(),
    payment_method: z.enum(['cash', 'check', 'bank_transfer', 'credit_card', 'online', 'other']),
    member_id: z.string().optional(),
    member_name: z.string().optional(),
    event_id: z.string().optional(),
    event_name: z.string().optional(),
    notes: z.string().optional(),
    receipt_url: z.string().optional(),
})

type TransactionFormData = z.infer<typeof transactionSchema>

interface FinancialTransactionDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    transaction?: FinancialTransaction | null
}

export function FinancialTransactionDialog({
    open,
    onOpenChange,
    transaction,
}: FinancialTransactionDialogProps) {
    const { user } = useUser()
    const { organization } = useOrganization()
    const symbol = currencySymbol(useCurrency())
    const [isLoading, setIsLoading] = useState(false)

    const createTransaction = useMutation(api.financial.createTransaction)
    const updateTransaction = useMutation(api.financial.updateTransaction)
    const { trackEvent } = useAnalytics()

    // Data Fetching
    const members = useQuery(api.members.getAll,
        organization ? { organization_id: organization._id } : "skip"
    )
    const events = useQuery(api.events.list,
        organization ? { organization_id: organization._id } : "skip"
    )

    const form = useForm<TransactionFormData>({
        resolver: zodResolver(transactionSchema),
        defaultValues: {
            type: 'income',
            category: 'other',
            amount: 0,
            description: '',
            date: new Date(),
            payment_method: 'cash',
            member_id: '',
            member_name: '',
            event_id: '',
            event_name: '',
            notes: '',
            receipt_url: '',
        },
    })

    // Reset form when dialog opens/closes or transaction changes
    useEffect(() => {
        if (open && transaction) {
            form.reset({
                type: transaction.type,
                category: transaction.category,
                amount: transaction.amount,
                description: transaction.description,
                date: new Date(transaction.date),
                payment_method: transaction.payment_method,
                member_id: (transaction as any).member_id || '',
                member_name: transaction.member_name || '',
                event_id: (transaction as any).event_id || '',
                event_name: transaction.event_name || '',
                notes: transaction.notes || '',
                receipt_url: transaction.receipt_url || '',
            })
        } else if (open && !transaction) {
            form.reset({
                type: 'income',
                category: 'other',
                amount: 0,
                description: '',
                date: new Date(),
                payment_method: 'cash',
                member_id: '',
                member_name: '',
                event_id: '',
                event_name: '',
                notes: '',
                receipt_url: '',
            })
        }
    }, [open, transaction, form])

    // Update member name when member selection changes
    useEffect(() => {
        const memberId = form.watch('member_id')
        if (memberId && members) {
            const member = members.find(m => m._id === memberId)
            if (member) {
                form.setValue('member_name', member.name)
            }
        } else if (!memberId) {
            form.setValue('member_name', '')
        }
    }, [form.watch('member_id'), members, form])

    // Update event name when event selection changes
    useEffect(() => {
        const eventId = form.watch('event_id')
        if (eventId && events) {
            const event = events.find(e => e._id === eventId)
            if (event) {
                form.setValue('event_name', event.title)
            }
        } else if (!eventId) {
            form.setValue('event_name', '')
        }
    }, [form.watch('event_id'), events, form])

    const onSubmit = async (data: TransactionFormData) => {
        if (!user?.id || !organization?._id) return

        setIsLoading(true)
        try {
            // Optional pickers hold "" when nothing is chosen; the server wants the field left out.
            const optional = Object.fromEntries(
                Object.entries(data).filter(([, value]) => value !== ''),
            )
            const transactionPayload: any = {
                ...optional,
                recorded_by: user.id,
                recorded_by_name: user.fullName || user.primaryEmailAddress?.emailAddress || 'Unknown User',
                // The calendar day the user picked, not the UTC day (which differs east of Greenwich).
                date: format(data.date, 'yyyy-MM-dd'),
                organization_id: organization._id,
            }

            if (transaction) {
                await updateTransaction({
                    id: transaction._id as any,
                    ...transactionPayload
                })
                toast.success('Transaction updated')
                trackEvent(AnalyticsEventType.FINANCIAL_TRANSACTION_UPDATED, {
                    type: data.type,
                    category: data.category,
                })
            } else {
                await createTransaction(transactionPayload)
                toast.success('Transaction added')
                trackEvent(AnalyticsEventType.FINANCIAL_TRANSACTION_CREATED, {
                    type: data.type,
                    category: data.category,
                    payment_method: data.payment_method,
                    has_event: !!data.event_id,
                    has_member: !!data.member_id,
                })
            }
            onOpenChange(false)
        } catch (error) {
            console.error('Error saving transaction:', error)
            toast.error("Couldn't save the transaction", { description: error instanceof Error ? error.message : undefined })
        } finally {
            setIsLoading(false)
        }
    }

    const watchedType = form.watch('type')
    const watchedCategory = form.watch('category')

    const availableCategories = Object.entries(TRANSACTION_CATEGORIES).filter(([key]) => {
        if (watchedType === 'income') {
            return ['tithe', 'offering', 'donation', 'mission', 'other'].includes(key)
        } else {
            return ['utilities', 'maintenance', 'supplies', 'salary', 'event', 'mission', 'other'].includes(key)
        }
    })

    if (!open) return null

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[750px] max-h-[90vh] overflow-hidden p-0 border-0 shadow-soft-xl rounded-2xl bg-background">
                {/* Header Strip with Dynamic Color matching transaction type */}
                <div className={cn(
                    "h-1.5",
                    watchedType === 'income' ? "bg-success" : "bg-destructive"
                )}></div>

                <div className="flex flex-col h-full overflow-hidden">
                    <DialogHeader className="p-8 pb-4">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <DialogTitle className="text-xl font-semibold">
                                    {transaction ? 'Edit transaction' : 'Add a transaction'}
                                </DialogTitle>
                                <DialogDescription className="text-sm text-muted-foreground">
                                    {watchedType === 'income' ? 'Money coming in to the church.' : 'Money going out of the church.'}
                                </DialogDescription>
                            </div>
                            <Badge
                                variant="outline"
                                className={cn(
                                    "border-0 text-xs font-medium",
                                    watchedType === 'income' ? "bg-success/15 text-success-strong" : "bg-destructive/15 text-destructive-strong"
                                )}
                            >
                                {watchedType === 'income' ? 'Income' : 'Expense'}
                            </Badge>
                        </div>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto p-8 pt-2">
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                                {/* Basic Info */}
                                <section className="space-y-6 rounded-xl border border-border/50 bg-muted/20 p-6">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Tag className="h-4 w-4 text-muted-foreground" />
                                        <h3 className="font-semibold text-base">Details</h3>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <FormField
                                            control={form.control}
                                            name="type"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-sm">Type</FormLabel>
                                                    <Select onValueChange={(val) => {
                                                        field.onChange(val)
                                                        // Reset category when type changes
                                                        form.setValue('category', 'other')
                                                    }} value={field.value}>
                                                        <FormControl>
                                                            <SelectTrigger className="h-11 rounded-lg bg-background">
                                                                <SelectValue placeholder="Choose a type" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent className="rounded-lg shadow-soft-lg">
                                                            <SelectItem value="income" className="flex items-center gap-2">
                                                                <span className="flex items-center gap-2 text-success-strong"><ArrowDownLeft className="h-4 w-4" /> Income</span>
                                                            </SelectItem>
                                                            <SelectItem value="expense" className="flex items-center gap-2">
                                                                <span className="flex items-center gap-2 text-destructive-strong"><ArrowUpRight className="h-4 w-4" /> Expense</span>
                                                            </SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="category"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-sm">Category</FormLabel>
                                                    <Select onValueChange={field.onChange} value={field.value}>
                                                        <FormControl>
                                                            <SelectTrigger className="h-11 rounded-lg bg-background">
                                                                <SelectValue placeholder="Choose a category" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent className="rounded-lg shadow-soft-lg max-h-[300px]">
                                                            {availableCategories.map(([key, category]) => (
                                                                <SelectItem key={key} value={key}>
                                                                    <div className="flex items-center gap-3">
                                                                        <span className="text-lg shrink-0">{category.icon}</span>
                                                                        <span>{category.label}</span>
                                                                    </div>
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </section>

                                {/* Financial Amounts */}
                                <section className="space-y-6 rounded-xl border border-border/50 bg-muted/20 p-6">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Wallet className="h-4 w-4 text-muted-foreground" />
                                        <h3 className="font-semibold text-base">Amount and payment</h3>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <FormField
                                            control={form.control}
                                            name="amount"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-sm">Amount</FormLabel>
                                                    <FormControl>
                                                        <div className="relative">
                                                            <div className="absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-muted-foreground">{symbol}</div>
                                                            <Input
                                                                type="number"
                                                                step="0.01"
                                                                placeholder="0.00"
                                                                className={cn(symbol.length > 1 ? 'pl-12' : 'pl-7', 'h-11 rounded-lg bg-background font-mono text-lg')}
                                                                {...field}
                                                                onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                                            />
                                                        </div>
                                                    </FormControl>
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="payment_method"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-sm">Payment method</FormLabel>
                                                    <Select onValueChange={field.onChange} value={field.value}>
                                                        <FormControl>
                                                            <SelectTrigger className="h-11 rounded-lg bg-background">
                                                                <SelectValue placeholder="Choose a method" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent className="rounded-lg shadow-soft-lg">
                                                            {PAYMENT_METHODS.map((method) => (
                                                                <SelectItem key={method.value} value={method.value}>
                                                                    {method.label}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </section>

                                {/* Context & Details */}
                                <section className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-4">
                                            <FormField
                                                control={form.control}
                                                name="date"
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
                                                                <Calendar
                                                                    mode="single"
                                                                    selected={field.value}
                                                                    onSelect={field.onChange}
                                                                    disabled={(date) => date > new Date() || date < new Date('1900-01-01')}
                                                                    initialFocus
                                                                    className="p-4"
                                                                />
                                                            </PopoverContent>
                                                        </Popover>
                                                    </FormItem>
                                                )}
                                            />

                                            {(watchedCategory === 'tithe' || watchedCategory === 'offering') ? (
                                                <FormField
                                                    control={form.control}
                                                    name="member_id"
                                                    render={({ field }) => (
                                                        <FormItem className="animate-in fade-in slide-in-from-top-2">
                                                            <FormLabel className="text-sm">Member</FormLabel>
                                                            <MemberCombobox
                                                                members={members?.map(m => ({
                                                                    id: m._id,
                                                                    name: m.name,
                                                                    email: m.email || '',
                                                                    initials: m.name.split(' ').map((n: string) => n[0]).join('').toUpperCase()
                                                                })) || []}
                                                                value={field.value || ""}
                                                                onValueChange={field.onChange}
                                                                placeholder="Search for a member…"
                                                                className="h-11 rounded-lg"
                                                            />
                                                        </FormItem>
                                                    )}
                                                />
                                            ) : watchedCategory === 'event' ? (
                                                <FormField
                                                    control={form.control}
                                                    name="event_id"
                                                    render={({ field }) => (
                                                        <FormItem className="animate-in fade-in slide-in-from-top-2">
                                                            <FormLabel className="text-sm">Event</FormLabel>
                                                            <Select onValueChange={field.onChange} value={field.value}>
                                                                <FormControl>
                                                                    <SelectTrigger className="h-11 rounded-lg bg-background">
                                                                        <SelectValue placeholder="Choose an event" />
                                                                    </SelectTrigger>
                                                                </FormControl>
                                                                <SelectContent className="rounded-lg shadow-soft-lg max-h-[300px]">
                                                                    <SelectItem value="">None</SelectItem>
                                                                    {events?.map((event) => (
                                                                        <SelectItem key={event._id} value={event._id}>
                                                                            {event.title}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </FormItem>
                                                    )}
                                                />
                                            ) : null}
                                        </div>

                                        <div className="space-y-4">
                                            <FormField
                                                control={form.control}
                                                name="description"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel className="text-sm">Description</FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                placeholder="For example, Sunday offering"
                                                                className="h-11 rounded-lg bg-background"
                                                                {...field}
                                                            />
                                                        </FormControl>
                                                    </FormItem>
                                                )}
                                            />

                                            <FormField
                                                control={form.control}
                                                name="notes"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel className="text-sm">Notes (optional)</FormLabel>
                                                        <FormControl>
                                                            <Textarea
                                                                placeholder="Anything else worth recording"
                                                                className="min-h-[120px] resize-none rounded-lg bg-background"
                                                                {...field}
                                                            />
                                                        </FormControl>
                                                    </FormItem>
                                                )}
                                            />
                                        </div>
                                    </div>
                                </section>

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
                                        className={cn(
                                            "h-11 rounded-lg px-8 shadow-soft hover:shadow-soft-lg transition-all",
                                            watchedType === 'income' ? "bg-success text-success-foreground hover:bg-success/90" : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        )}
                                    >
                                        {isLoading ? (
                                            <div className="flex items-center gap-2">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                Saving…
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <Save className="h-4 w-4" />
                                                {transaction ? 'Save changes' : 'Save transaction'}
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
