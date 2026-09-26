import { Outlet, NavLink } from "react-router-dom"
import { User, Calendar, QrCode, HeartHandshake } from "lucide-react"
import { cn } from "@/lib/utils"
import { LayoutWrapper } from "@/components/layout-wrapper"
import { PageHeader } from "@/components/ui/page-header"

const portalNav = [
    { to: "/portal", label: "My Check-in", icon: QrCode, end: true },
    { to: "/portal/attendance", label: "My Attendance", icon: Calendar },
    { to: "/portal/giving", label: "My Giving", icon: HeartHandshake },
    { to: "/portal/profile", label: "My Profile", icon: User },
]

export default function PortalLayout() {
    return (
        <LayoutWrapper showSearch={false}>
            <div className="flex flex-col gap-6">
                <PageHeader title="My portal" description="Your check-ins, attendance, giving and profile." />
                <nav className="flex gap-1 border-b border-border/50">
                    {portalNav.map((item) => {
                        const Icon = item.icon
                        return (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.end}
                                className={({ isActive }) =>
                                    cn(
                                        "flex items-center gap-2 px-4 py-2 text-sm rounded-t-md border-b-2 -mb-px transition-colors",
                                        isActive
                                            ? "border-primary text-foreground"
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