"use client"

import { useUser } from "@clerk/clerk-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

interface AuthLoadingWrapperProps {
    children: React.ReactNode
    fallback?: React.ReactNode
}

/**
 * Best Practice: Auth Loading Wrapper
 *
 * This component ensures that authentication state is fully loaded before
 * rendering any authenticated content, preventing flash of loading states.
 *
 * Usage:
 * - Wrap your main app content with this component
 * - Only renders children after Clerk has determined authentication state
 * - Shows loading skeleton while authentication is being determined
 */
export function AuthLoadingWrapper({ children, fallback }: AuthLoadingWrapperProps) {
    const { isLoaded } = useUser()

    // Show loading state while Clerk is determining authentication
    if (!isLoaded) {
        return fallback || (
            <div className="min-h-screen bg-muted/50 flex items-center justify-center p-4">
                <Card className="w-full max-w-md">
                    <CardHeader className="text-center">
                        <div className="flex justify-center mb-4">
                            <div className="w-12 h-12 rounded-lg bg-primary border-2 border-black dark:border-white flex items-center justify-center animate-pulse">
                                <span className="text-white text-lg">M</span>
                            </div>
                        </div>
                        <Skeleton className="h-6 w-48 mx-auto mb-2" />
                        <Skeleton className="h-4 w-64 mx-auto" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                        <div className="flex justify-center">
                            <Skeleton className="h-4 w-32" />
                        </div>
                    </CardContent>
                </Card>
            </div>
        )
    }

    // Authentication state is determined, render children
    return <>{children}</>
}

/**
 * Alternative: Page-level loading wrapper for specific pages
 */
export function PageLoadingWrapper({ children, title }: { children: React.ReactNode, title?: string }) {
    const { isLoaded } = useUser()

    if (!isLoaded) {
        return (
            <div className="space-y-6 p-6">
                {/* Header skeleton */}
                <div className="flex items-center justify-between">
                    <div>
                        <Skeleton className="h-8 w-48 mb-2" />
                        <Skeleton className="h-4 w-64" />
                    </div>
                </div>

                {/* Content skeleton */}
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <Card key={i}>
                            <CardHeader>
                                <Skeleton className="h-5 w-32" />
                            </CardHeader>
                            <CardContent>
                                <Skeleton className="h-8 w-16 mb-2" />
                                <Skeleton className="h-3 w-24" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        )
    }

    return <>{children}</>
}
