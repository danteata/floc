"use client"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useNavigate } from "react-router-dom"
import { Church } from "lucide-react"
import { useUser } from "@clerk/clerk-react"

const SHELL = "mb-8 rounded-xl bg-card p-6 ring-1 ring-foreground/10"

function Heading({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <Church className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 space-y-1">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

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
      <div className={SHELL}>
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-5 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
        <div className="mt-4 flex gap-3">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>
    )
  }

  // If Clerk is not configured, show a demo welcome banner
  if (!isClerkConfigured) {
    return (
      <div className={SHELL}>
        <Heading
          title="Welcome to Floc"
          description="This is a demo. Set up Clerk to turn on sign-in."
        />
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={() => navigate("/dashboard")}>Go to dashboard</Button>
          <Button variant="outline" onClick={() => navigate("/members")}>View members</Button>
        </div>
      </div>
    )
  }

  if (isSignedIn) {
    return (
      <div className={SHELL}>
        <Heading
          title={user?.firstName ? `Welcome back, ${user.firstName}` : "Welcome back"}
          description="Pick up where you left off with your church."
        />
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={() => navigate("/dashboard")}>Go to dashboard</Button>
          <Button variant="outline" onClick={() => navigate("/members")}>View members</Button>
        </div>
      </div>
    )
  }

  return (
    <div className={SHELL}>
      <Heading
        title="Welcome to Floc"
        description="Sign in to see your members, events and giving."
      />
      <div className="mt-4 flex flex-wrap gap-3">
        <Button onClick={() => navigate("/sign-in")}>Sign in</Button>
        <Button variant="outline" onClick={() => navigate("/sign-up")}>Create account</Button>
      </div>
    </div>
  )
}
