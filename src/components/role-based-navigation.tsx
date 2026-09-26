"use client"

import { Link, useLocation } from "react-router-dom"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Home,
  Users,
  Calendar,
  BarChart3,
  Settings,
  CreditCard,
  MapPin,
  UserCheck,
  Shield,
  DollarSign,
  Building2,
  ClipboardList,
  QrCode,
  Zap,
  HeartHandshake,
  Radio,
} from "lucide-react"
import { useUserRole } from "@/hooks/use-user-role"
import { Capability, hasCapability } from "@/lib/permissions"

interface NavigationItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
  capability: Capability
  group: string
}

const GROUP_ORDER = [
  "Overview",
  "Community",
  "Care",
  "Insight",
  "Administration",
] as const

export function RoleBasedNavigation() {
  const { pathname } = useLocation()
  const { role, isLoading } = useUserRole()

  const navigationItems: NavigationItem[] = [
    {
      title: "Dashboard",
      href: "/dashboard",
      icon: Home,
      capability: "dashboard",
      group: "Overview",
    },
    {
      title: "My portal",
      href: "/portal",
      icon: QrCode,
      capability: "portal",
      group: "Overview",
    },
    {
      title: "Members",
      href: "/members",
      icon: Users,
      capability: "members",
      group: "Community",
    },
    {
      title: "Organization",
      href: "/organization",
      icon: Building2,
      capability: "organization",
      group: "Community",
    },
    {
      title: "Events",
      href: "/events",
      icon: Calendar,
      capability: "events",
      group: "Community",
    },
    {
      title: "Attendance",
      href: "/attendance",
      icon: UserCheck,
      capability: "attendance",
      group: "Community",
    },
    {
      title: "Command center",
      href: "/command-center",
      icon: Radio,
      capability: "command_center",
      group: "Care",
    },
    {
      title: "Care tasks",
      href: "/care",
      icon: HeartHandshake,
      capability: "care_tasks",
      group: "Care",
    },
    {
      title: "Finance",
      href: "/financial",
      icon: DollarSign,
      capability: "financial",
      group: "Insight",
    },
    {
      title: "Reports",
      href: "/reports",
      icon: BarChart3,
      capability: "reports",
      group: "Insight",
    },
    {
      title: "Map",
      href: "/map",
      icon: MapPin,
      capability: "map",
      group: "Insight",
    },
    {
      title: "User management",
      href: "/user-management",
      icon: Shield,
      badge: "Admin",
      capability: "user_management",
      group: "Administration",
    },
    {
      title: "Automations",
      href: "/automations",
      icon: Zap,
      badge: "Pro",
      capability: "automations",
      group: "Administration",
    },
    {
      title: "Settings",
      href: "/settings",
      icon: Settings,
      capability: "settings",
      group: "Administration",
    },
    {
      title: "Billing",
      href: "/billing",
      icon: CreditCard,
      capability: "billing",
      group: "Administration",
    },
    {
      title: "Audit Trail",
      href: "/audit-trail",
      icon: ClipboardList,
      badge: "Pro",
      capability: "audit_trail",
      group: "Administration",
    },
  ]

  const visibleItems = navigationItems.filter((item) => {
    if (isLoading) return false
    return hasCapability(role, item.capability)
  })

  if (isLoading) {
    return (
      <nav className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-10 bg-muted animate-pulse rounded-md" />
        ))}
      </nav>
    )
  }

  const grouped = GROUP_ORDER.map((group) => ({
    group,
    items: visibleItems.filter((item) => item.group === group),
  })).filter(({ items }) => items.length > 0)

  return (
    <nav>
      {grouped.map(({ group, items }, groupIndex) => (
        <div key={group} className={groupIndex > 0 ? "mt-6" : ""}>
          {grouped.length > 1 && (
            <div className="text-[10px] text-sidebar-foreground/40 tracking-widest mb-2 px-3 font-medium uppercase">
              {group}
            </div>
          )}
          <div className="space-y-0.5">
            {items.map((item) => {
              const Icon = item.icon
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"))

              return (
                <Link key={item.href} to={item.href} className="block relative group/nav">
                  {isActive && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-primary transition-all"
                      aria-hidden
                    />
                  )}
                  <Button
                    variant="ghost"
                    className={cn(
                      "relative w-full justify-start gap-3 h-9 px-3 rounded-lg text-sm transition-all duration-200 font-normal",
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-foreground/5",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0 transition-colors duration-200",
                        isActive
                          ? "text-primary"
                          : "text-sidebar-foreground/50 group-hover/nav:text-sidebar-foreground",
                      )}
                    />
                    <span className="truncate">{item.title}</span>
                    {item.badge && (
                      <Badge
                        variant="secondary"
                        className={cn(
                          "ml-auto text-[10px] px-1.5 py-0 h-4.5 border-0 font-medium",
                          isActive
                            ? "bg-primary/15 text-primary"
                            : "bg-accent/20 text-accent-foreground"
                        )}
                      >
                        {item.badge}
                      </Badge>
                    )}
                  </Button>
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}

// Role indicator component
export function RoleIndicator() {
  const { role, user, isLoading } = useUserRole()

  if (isLoading || !user) return null

  const getRoleDisplay = () => {
    switch (role) {
      case "super_admin":
        return { label: "Super Administrator", color: "destructive" as const }
      case "admin":
      case "organization_admin":
        return { label: "Organization Admin", color: "default" as const }
      case "division_admin":
        return { label: "Division Admin", color: "default" as const }
      case "unit_admin":
      case "sub_unit_admin":
        return { label: "Unit Admin", color: "secondary" as const }
      case "treasurer":
        return { label: "Treasurer", color: "secondary" as const }
      default:
        return {
          label: "Member",
          color: "outline" as const,
        }
    }
  }

  const roleInfo = getRoleDisplay()

  return (
    <div className="p-4 border-t border-sidebar-border/30">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <p className="text-sm font-semibold text-sidebar-foreground truncate">
            {user.name || "Unknown User"}
          </p>
          <Badge
            variant={roleInfo.color}
            className="text-[10px] px-2 py-0 h-5 w-fit mt-1.5 bg-primary/20 text-primary border border-primary/30"
          >
            {roleInfo.label}
          </Badge>
        </div>
      </div>
    </div>
  )
}
