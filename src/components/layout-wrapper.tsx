import { type ReactNode, useState, useEffect } from "react"
import { useLocation } from "react-router-dom"
import { Menu, X } from "lucide-react"
import { useUser } from "@clerk/clerk-react"

import { UserNav } from "@/components/user-nav"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { RoleBasedNavigation, RoleIndicator } from "@/components/role-based-navigation"
import { OrganizationProvider } from "@/hooks/use-organization"
import { OrganizationSelector } from "@/components/organization-selector"
import { ViewingOrgBanner } from "@/components/viewing-org-banner"
import { ModeToggle } from "@/components/mode-toggle"
import { NotificationsPopover } from "@/components/notifications-popover"
import { FlocMark } from "@/components/ui/floc-mark"

interface LayoutWrapperProps {
  children?: ReactNode
  showSearch?: boolean
}

export function LayoutWrapper({ children, showSearch = true }: LayoutWrapperProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const { isSignedIn, isLoaded } = useUser()
  const { pathname } = useLocation()

  const isClerkConfigured =
    typeof import.meta.env.VITE_CLERK_PUBLISHABLE_KEY === "string" &&
    import.meta.env.VITE_CLERK_PUBLISHABLE_KEY !== "your_publishable_key"

  // Track mobile state and close sidebar when resizing to desktop
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024
      setIsMobile(mobile)
      if (!mobile) {
        setSidebarOpen(false)
      }
    }

    // Set initial state
    handleResize()

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <OrganizationProvider>
      <div className="flex h-screen bg-background gradient-mesh">
        {/* Mobile sidebar overlay - only render on mobile */}
        {sidebarOpen && isMobile && (
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar - solid background, not affected by blur */}
        <div className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border transform transition-transform duration-300 ease-out flex flex-col lg:translate-x-0 lg:static lg:inset-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-5 border-b border-sidebar-border/50 shrink-0">
            <FlocMark />
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden h-8 w-8 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-foreground/10 rounded-lg"
              aria-label="Close menu"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Navigation */}
          <div className="flex-1 px-3 py-5 overflow-y-auto scrollbar-thin" onClick={() => setSidebarOpen(false)}>
            <RoleBasedNavigation />
          </div>

          {/* Role Indicator */}
          <RoleIndicator />
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <header className="h-16 glass border-b border-border/50 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-30 shrink-0">
            {/* Left section */}
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open menu"
                className="lg:hidden h-9 w-9 hover:bg-muted rounded-lg"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>

              {/* On a phone the church's name has no room; the mark says where you are. */}
              <FlocMark compact className="sm:hidden" />
              <OrganizationSelector className="hidden sm:flex" />
            </div>

            {/* Right section */}
            <div className="flex items-center gap-2">
              {isSignedIn && isClerkConfigured && <NotificationsPopover />}
              <ModeToggle />
              <UserNav />
            </div>
          </header>

          <ViewingOrgBanner />

          {/* Content — keyed by route so each page fades in on navigation */}
          <main className="flex-1 overflow-auto">
            <div key={pathname} className="p-4 sm:p-6 w-full max-w-7xl mx-auto fade-in-up">
              {children}
            </div>
          </main>
        </div>
      </div>
    </OrganizationProvider>
  )
}
