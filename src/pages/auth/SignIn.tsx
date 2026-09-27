import { SignIn } from "@clerk/clerk-react"
import { useSearchParams } from "react-router-dom"
import { AuthShell } from "@/components/auth-shell"
import { clerkAppearance } from "@/lib/clerk"

const isClerkConfigured =
    typeof import.meta.env.VITE_CLERK_PUBLISHABLE_KEY === "string" &&
    import.meta.env.VITE_CLERK_PUBLISHABLE_KEY !== "your_publishable_key"

export default function SignInPage() {
    const [searchParams] = useSearchParams()
    const redirectUrl = searchParams.get("redirect_url") || "/"

    return (
        <AuthShell>
            {isClerkConfigured ? (
                <SignIn
                    appearance={clerkAppearance("light")}
                    signUpUrl="/sign-up"
                    forceRedirectUrl={redirectUrl}
                    routing="path"
                    path="/sign-in"
                />
            ) : (
                <p className="rounded-xl bg-card p-6 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">
                    Sign-in isn't set up on this copy of Floc yet. Add a Clerk publishable key to the environment to turn it on.
                </p>
            )}
        </AuthShell>
    )
}
