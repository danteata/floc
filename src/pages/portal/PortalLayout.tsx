import { Outlet, NavLink } from "react-router-dom"
import { User, CalendarCheck, QrCode, HeartHandshake } from "lucide-react"
import { cn } from "@/lib/utils"
import { LayoutWrapper } from "@/components/layout-wrapper"
import { PageHeader } from "@/components/ui/page-header"

const portalNav = [
    { to: "/portal", label: "My check-in", icon: QrCode, end: true },
    { to: "/portal/attendance", label: "My attendance", icon: CalendarCheck },
    { to: "/portal/giving", label: "My giving", icon: HeartHandshake },
    { to: "/portal/profile", label: "My profile", icon: User },
]

export default function PortalLayout() {
    return (
        <LayoutWrapper showSearch={false}>
            <div className="flex flex-col gap-6">
                <PageHeader title="My portal" description="Your check-ins, attendance, giving and details, in one place." />
                <nav className="-mx-4 flex gap-1 overflow-x-auto border-b border-border/50 px-4 md:mx-0 md:px-0">
                    {portalNav.map((item) => {
                        const Icon = item.icon
                        return (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.end}
                                className={({ isActive }) =>
                                    cn(
                                        "-mb-px flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-t-md border-b-2 px-3 py-2 text-sm transition-colors md:px-4",
                                        isActive
                                            ? "border-primary font-medium text-foreground"
                                            : "border-transparent text-muted-foreground hover:text-foreground",
                                    )
                                }
                            >
                                <Icon className="h-4 w-4" />
                                {item.label}
                            </NavLink>
                        )
                    })}
                </nav>
                <Outlet />
            </div>
        </LayoutWrapper>
    )
}
