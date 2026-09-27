import { useOrganization } from "@/hooks/use-organization"

/** Currencies a church can keep its books in; the first is the default. */
export const CURRENCIES = [
    { code: "GHS", label: "Ghanaian cedi (GH₵)" },
    { code: "NGN", label: "Nigerian naira (₦)" },
    { code: "KES", label: "Kenyan shilling (KSh)" },
    { code: "ZAR", label: "South African rand (R)" },
    { code: "USD", label: "US dollar ($)" },
    { code: "GBP", label: "Pound sterling (£)" },
    { code: "EUR", label: "Euro (€)" },
    { code: "CAD", label: "Canadian dollar (CA$)" },
] as const

export const DEFAULT_CURRENCY = "GHS"

/** "GH₵1,234.50", "₦1,234.50", "$1,234.50": the local symbol, two decimals. */
export function formatMoney(amount: number, currency: string = DEFAULT_CURRENCY, opts: { whole?: boolean } = {}): string {
    return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency,
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: opts.whole ? 0 : 2,
        maximumFractionDigits: opts.whole ? 0 : 2,
    }).format(Number.isFinite(amount) ? amount : 0)
}

/** The signed-in church's currency. */
export function useCurrency(): string {
    const { organization } = useOrganization()
    return (organization?.currency as string | undefined) || DEFAULT_CURRENCY
}

/** A formatter bound to the church's currency, for components that print many amounts. */
export function useMoney(): (amount: number, opts?: { whole?: boolean }) => string {
    const currency = useCurrency()
    return (amount, opts) => formatMoney(amount, currency, opts)
}
