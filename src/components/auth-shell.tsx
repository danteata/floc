import { Link } from "react-router-dom"
import { FlocMark } from "@/components/ui/floc-mark"

/**
 * The frame around Clerk's sign-in and sign-up cards: the Floc mark, a line on
 * what Floc is for, and the card. Light only, like the landing page they come from.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="light flex min-h-dvh flex-col bg-paper text-foreground">
            <header className="mx-auto flex w-full max-w-6xl items-center px-6 py-5">
                <Link to="/" aria-label="Floc home"><FlocMark /></Link>
            </header>
            <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 pb-16">
                <p className="max-w-sm text-center font-serif text-xl text-foreground/80">
                    Make sure no one slips away.
                </p>
                <div className="w-full max-w-[25rem]">{children}</div>
            </main>
        </div>
    )
}
