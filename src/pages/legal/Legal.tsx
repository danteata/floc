import { Link } from "react-router-dom"
import { FlocMark } from "@/components/ui/floc-mark"

/**
 * Privacy policy and terms of service. The landing page linked both to "#".
 * A church keeps its members' personal data here, so it needs to know what
 * happens to it. Written plainly, and only about what the product does today;
 * have it reviewed before relying on it.
 */

const UPDATED = "27 September 2026"

type Section = { heading: string; body: React.ReactNode }

const PRIVACY: Section[] = [
    {
        heading: "Whose data it is",
        body: (
            <>
                <p>
                    Floc is software a church uses to keep its own records. The member, attendance, giving and care
                    records a church enters belong to that church. The church decides what to record and who can see
                    it, and it is responsible for having a proper reason to hold its members' information. Floc
                    processes those records only to provide the service to the church.
                </p>
                <p>
                    For the accounts of the people who sign in (their name, email address and role) and for how the
                    service is used, Floc is responsible.
                </p>
            </>
        ),
    },
    {
        heading: "What we hold",
        body: (
            <ul>
                <li><strong>Accounts:</strong> name, email address, role and church, for everyone who signs in.</li>
                <li><strong>Church records:</strong> members and their contact details, households, units, events, attendance and check-ins, giving and expenses, care tasks and notes, entered by the church.</li>
                <li><strong>Online giving:</strong> payments are taken by Paystack. We receive the amount, a reference and whether it succeeded, never card or mobile money details.</li>
                <li><strong>Usage:</strong> which pages are used and when, to understand and improve the service, where the church's deployment turns analytics on.</li>
            </ul>
        ),
    },
    {
        heading: "Who can see it",
        body: (
            <p>
                Each church sees only its own records. Within a church, leaders see only the units they lead, and
                administrators decide everyone's role. Follow-up lists shared by link can be opened by anyone with
                the link until it is turned off or expires, so share them only with the people who need them.
            </p>
        ),
    },
    {
        heading: "Services we use",
        body: (
            <>
                <p>We don't sell or rent personal data. We use these providers to run Floc:</p>
                <ul>
                    <li><strong>Convex</strong>: database and application servers.</li>
                    <li><strong>Clerk</strong>: sign-in and account security.</li>
                    <li><strong>Paystack</strong>: subscriptions and online giving.</li>
                    <li><strong>UploadThing</strong>: storing uploaded photos and files.</li>
                    <li><strong>Google Maps</strong>: the member map, where a church uses it.</li>
                    <li><strong>mNotify</strong>: text messages, where a church turns them on.</li>
                    <li><strong>An AI provider the church chooses</strong>: only if the church adds its own key; the text of a request goes to that provider.</li>
                    <li><strong>PostHog or Amplitude</strong>: usage analytics, where enabled.</li>
                </ul>
                <p>Some of these providers store data outside your country.</p>
            </>
        ),
    },
    {
        heading: "How long we keep it",
        body: (
            <p>
                A church's records are kept while its account is open. A church can export its member list at any
                time. When a church closes its account, we delete its records within 90 days unless the law requires
                us to keep them longer.
            </p>
        ),
    },
    {
        heading: "Your choices",
        body: (
            <p>
                If you are a member of a church that uses Floc, ask your church first about the information it holds
                on you: it can show you, correct it or remove it. You can also write to us and we will help the church
                respond.
            </p>
        ),
    },
    {
        heading: "Security",
        body: (
            <p>
                Data travels over encrypted connections and is stored encrypted by our database provider. Access is
                checked against each person's church and role on every request, and changes are recorded in an audit
                trail. No system is perfectly secure; if a breach affected a church's data, we would tell the church
                promptly.
            </p>
        ),
    },
]

const TERMS: Section[] = [
    {
        heading: "The agreement",
        body: (
            <p>
                These terms cover a church's use of Floc and the people it invites. By creating an account you agree
                to them on behalf of your church.
            </p>
        ),
    },
    {
        heading: "Accounts",
        body: (
            <p>
                Your church's administrators decide who has access and with which role, and remove access when someone
                leaves. Keep your sign-in details to yourself and tell your administrator if you think someone else has
                used your account.
            </p>
        ),
    },
    {
        heading: "Your church's content",
        body: (
            <p>
                Your church owns what it puts into Floc and is responsible for it, including having its members'
                agreement where the law requires it. You let us store and process that content only to provide the
                service.
            </p>
        ),
    },
    {
        heading: "Plans and payment",
        body: (
            <p>
                The Free plan costs nothing. Pro is billed monthly in advance at the price shown on
                the billing page. You can cancel at any time; Pro features stay on until the end of the period you
                have paid for. If a payment fails, Pro features may be switched off until it is settled.
            </p>
        ),
    },
    {
        heading: "Fair use",
        body: (
            <p>
                Don't use Floc to break the law, to send messages people haven't agreed to receive, to reach another
                church's data, or to disrupt the service. We may suspend an account that puts the service or other
                churches at risk.
            </p>
        ),
    },
    {
        heading: "The service",
        body: (
            <p>
                We work to keep Floc available and to fix problems quickly, and we improve it over time. Suggestions
                such as who to follow up are there to help your team decide; they are not a substitute for pastoral
                judgement.
            </p>
        ),
    },
    {
        heading: "Liability",
        body: (
            <p>
                As far as the law allows, Floc is provided as it is, and our total liability to a church is limited to
                what it paid us in the twelve months before a claim.
            </p>
        ),
    },
    {
        heading: "Changes",
        body: (
            <p>
                If we change these terms in a way that matters, we will tell church administrators before the change
                takes effect.
            </p>
        ),
    },
]

function LegalPage({ title, intro, sections }: { title: string; intro: string; sections: Section[] }) {
    return (
        <div className="light min-h-dvh bg-paper text-foreground">
            <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
                <Link to="/" aria-label="Floc home"><FlocMark /></Link>
                <nav className="flex gap-5 text-sm text-muted-foreground">
                    <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
                    <Link to="/terms" className="hover:text-foreground">Terms</Link>
                </nav>
            </header>
            <main className="mx-auto max-w-3xl px-6 pb-20 pt-6">
                <h1 className="font-serif text-4xl font-medium tracking-tight">{title}</h1>
                <p className="mt-2 text-sm text-muted-foreground">Last updated {UPDATED}</p>
                <p className="mt-6 text-base leading-relaxed text-foreground/80">{intro}</p>
                <div className="mt-10 space-y-10">
                    {sections.map((s) => (
                        <section key={s.heading}>
                            <h2 className="text-lg font-semibold">{s.heading}</h2>
                            <div className="mt-3 space-y-3 text-[0.9375rem] leading-relaxed text-foreground/80 [&_li]:ml-5 [&_li]:list-disc [&_li]:mt-1.5">
                                {s.body}
                            </div>
                        </section>
                    ))}
                </div>
            </main>
        </div>
    )
}

export function PrivacyPage() {
    return (
        <LegalPage
            title="Privacy policy"
            intro="What Floc holds, who can see it, and the choices churches and their members have."
            sections={PRIVACY}
        />
    )
}

export function TermsPage() {
    return (
        <LegalPage
            title="Terms of service"
            intro="The rules for using Floc, in plain words."
            sections={TERMS}
        />
    )
}
