"use client"

import { Button } from "@/components/ui/button"
import { useNavigate } from "react-router-dom"
import { Church } from "lucide-react"
import { useUser } from "@clerk/clerk-react"

export function WelcomeBanner() {
  const { isSignedIn, user, isLoaded } = useUser()
  const navigate = useNavigate()

  // Check if Clerk is configured
  const isClerkConfigured =
    typeof import.meta.env.VITE_CLERK_PUBLISHABLE_KEY === "string" &&
    import.meta.env.VITE_CLERK_PUBLISHABLE_KEY !== "your_publishable_key"

  // Show loading skeleton while authentication is being determined
  if (isClerkConfigured && !isLoaded) {
    return (
      <div className="mb-8 rounded-lg bg-white dark:bg-card p-6 border-4 border-black dark:border-white shadow-brutal animate-pulse">
        <div className="flex items-center gap-4">
          <div className="rounded-full bg-primary/30 p-3">
            <Church className="h-6 w-6 text-primary animate-pulse" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="h-6 bg-muted rounded w-3/4"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
          </div>
        </div>
        <div className="mt-4 flex gap-3">
          <div className="h-10 bg-muted rounded w-32"></div>
          <div className="h-10 bg-muted rounded w-32"></div>
        </div>
      </div>
    )
  }

  // If Clerk is not configured, show a demo welcome banner
  if (!isClerkConfigured) {
    return (
      <div className="mb-8 rounded-lg bg-white dark:bg-card p-6 border-4 border-black dark:border-white shadow-brutal hover:shadow-brutal-lg transition-all">
        <div className="flex items-center gap-4">
          <div className="rounded-full bg-primary/30 p-3">
            <Church className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl">Welcome to Floc Church Management System</h2>
            <p className="text-muted-foreground">This is a demo version. Set up Clerk to enable authentication.</p>
          </div>
        </div>
        <div className="mt-4 flex gap-3">
          <Button onClick={() => navigate("/dashboard")} className="font-bold">
            Go to Dashboard
          </Button>
          <Button variant="outline" onClick={() => navigate("/members")} className="border-2 border-primary text-primary hover:bg-primary/10">
            View Members
          </Button>
        </div>
      </div>
    )
  }

  if (isSignedIn) {
    return (
      <div className="mb-8 rounded-lg bg-white dark:bg-card p-6 border-4 border-black dark:border-white shadow-brutal hover:shadow-brutal-lg transition-all">
        <div className="flex items-center gap-4">
          <div className="rounded-full bg-primary/30 p-3">
            <Church className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl">Welcome back, {user?.firstName || "Friend"}!</h2>
            <p className="text-muted-foreground">Continue managing your church community</p>
          </div>
        </div>
        <div className="mt-4 flex gap-3">
          <Button onClick={() => navigate("/dashboard")} className="font-bold">
            Go to Dashboard
          </Button>
          <Button variant="outline" onClick={() => navigate("/members")} className="border-2 border-primary text-primary hover:bg-primary/10">
            View Members
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-8 rounded-lg bg-white dark:bg-card p-6 border-4 border-black dark:border-white shadow-brutal hover:shadow-brutal-lg transition-all">
      <div className="flex items-center gap-4">
        <div className="rounded-full bg-primary/30 p-3">
          <Church className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl">Welcome to Floc Church Management System</h2>
          <p className="text-muted-foreground">Sign in to access all features and manage your church community</p>
        </div>
      </div>
      <div className="mt-4 flex gap-3">
        <Button onClick={() => navigate("/sign-in")} className="font-bold">
          Sign In
        </Button>
        <Button variant="outline" onClick={() => navigate("/sign-up")} className="border-2 border-primary text-primary hover:bg-primary/10">
          Create Account
        </Button>
      </div>
    </div>
  )
}