import { Link } from "react-router-dom"
import { Building2, ChevronRight, Monitor, Moon, Sun, UserRound } from "lucide-react"
import { LayoutWrapper } from "@/components/layout-wrapper"
import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { MemberAvatar } from "@/components/ui/member-avatar"
import { useTheme } from "@/components/theme-provider"
import { useUserRole } from "@/hooks/use-user-role"
import { cn } from "@/lib/utils"

/**
 * Personal settings. This page used to be a design template: fixed sample
 * values ("Zurich, Switzerland", someone else's email address), social fields,
 * a Save button wired to nothing, and four "Coming Soon" tabs. Everything here
 * now does what it says: the account is Clerk's, the theme is the app's, and the
 * church's own settings live where an administrator manages them.
 */

const THEMES = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "Match my device", icon: Monitor },
] as const

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
    return (
        <section className="grid gap-4 border-t border-border py-8 first:border-t-0 first:pt-0 md:grid-cols-[16rem_1fr] md:gap-10">
            <div className="space-y-1">
                <h2 className="text-sm font-semibold text-foreground">{title}</h2>
                <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            <div>{children}</div>
        </section>
    )
}

export default function SettingsPage() {
    const { theme, setTheme } = useTheme()
    const { user, isAdmin } = useUserRole()

    return (
        <LayoutWrapper>
            <div className="mx-auto flex max-w-4xl flex-col gap-8">
                <PageHeader title="Settings" description="Your account and preferences." />

                <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10 md:p-8">
                    <Section title="Account" description="Your name, email and how you sign in.">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 items-center gap-3">
                                <MemberAvatar name={user?.name} size="lg" />
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-foreground">{user?.name ?? "…"}</p>
                                    <p className="truncate text-sm text-muted-foreground">{user?.email || "No email on your account"}</p>
                                </div>
                            </div>
                            <Button asChild variant="outline" size="sm">
                                <Link to="/profile">
                                    <UserRound className="h-4 w-4" aria-hidden="true" />
                                    Manage account
                                </Link>
                            </Button>
                        </div>
                    </Section>

                    <Section title="Appearance" description="How Floc looks on this device.">
                        <div role="radiogroup" aria-label="Theme" className="grid gap-2 sm:grid-cols-3">
                            {THEMES.map(({ value, label, icon: Icon }) => (
                                <button
                                    key={value}
                                    type="button"
                                    role="radio"
                                    aria-checked={theme === value}
                                    onClick={() => setTheme(value)}
                                    className={cn(
                                        "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                        theme === value
                                            ? "border-primary bg-primary/5 font-medium text-foreground"
                                            : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                                    )}
                                >
                                    <Icon className="h-4 w-4" aria-hidden="true" />
                                    {label}
                                </button>
                            ))}
                        </div>
                    </Section>

                    {isAdmin && (
                        <Section title="Your church" description="Structure, terminology, branding and features, for administrators.">
                            <div className="divide-y divide-border rounded-lg border border-border">
                                {[
                                    { to: "/organization", label: "Organization", hint: "Units, leaders and event types" },
                                    { to: "/admin", label: "Administration", hint: "Operations, branding and features" },
                                ].map((item) => (
                                    <Link
                                        key={item.to}
                                        to={item.to}
                                        className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted"
                                    >
                                        <span className="flex items-center gap-3">
                                            <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                                            <span>
                                                <span className="block font-medium text-foreground">{item.label}</span>
                                                <span className="block text-muted-foreground">{item.hint}</span>
                                            </span>
                                        </span>
                                        <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                                    </Link>
                                ))}
                            </div>
                        </Section>
                    )}
                </div>
            </div>
        </LayoutWrapper>
    )
}
