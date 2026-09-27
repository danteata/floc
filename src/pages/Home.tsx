import { useEffect, useState } from 'react'
import { useUser, SignInButton } from '@clerk/clerk-react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { FREE_MEMBER_LIMIT, PRO_PRICE_GHS } from '@/lib/plans'
import {
    Church,
    Calendar,
    BarChart3,
    Check,
    Plus,
    ShieldCheck,
    Crown,
    ArrowRight,
    Share2,
    UserCog,
    Layers,
    QrCode,
    Users,
    DollarSign,
    Eye,
    PhoneCall,
    TrendingUp,
} from 'lucide-react'

const CREAM = '#FAF7F1'
const CREAM_ALT = '#F4EEE4'
const INK = '#221D16'

const SUNDAY_TIMELINE = [
    {
        time: '8:45 AM',
        icon: QrCode,
        title: 'Check-in opens',
        detail: 'Members scan a code at the door. No register, no queue.',
    },
    {
        time: '9:15 AM',
        icon: Users,
        title: '412 checked in · 23 first-timers',
        detail: 'Most checked themselves in on their phones.',
    },
    {
        time: '11:20 AM',
        icon: DollarSign,
        title: '20,770 in giving recorded',
        detail: 'Tithes, offering and special giving, added up for you.',
    },
    {
        time: 'Monday',
        icon: Share2,
        title: '6 members flagged for a call',
        detail: 'Those most likely to come back are at the top, and the list goes to 3 volunteers.',
    },
]

const PROOF = [
    {
        icon: Eye,
        title: 'See who’s drifting',
        desc: 'Floc spots falling attendance before anyone would notice it.',
    },
    {
        icon: PhoneCall,
        title: 'Know who to call first',
        desc: 'A care list with the people most likely to come back at the top.',
    },
    {
        icon: TrendingUp,
        title: 'See it working',
        desc: 'Floc counts the members who came back after your team reached out.',
    },
]

const HOW_IT_WORKS = [
    {
        title: 'Attendance takes care of itself',
        desc: 'Members scan a QR code at the door, or a steward checks them in at the kiosk.',
    },
    {
        title: 'Floc notices who’s drifting',
        desc: 'A few missed weeks, or weekly quietly becoming monthly: Floc flags it early, while there’s still time to help.',
    },
    {
        title: 'Reach out, and see who returns',
        desc: 'Send the list to your care team, then watch the people they called come back.',
    },
]

const FEATURE_ROWS = [
    {
        kicker: 'Care and follow-up',
        title: 'See who’s drifting, and bring them back',
        desc: 'This is what Floc is for. It watches attendance so no quiet exit goes unnoticed, tells you who to call first, and shows you who came back.',
        bullets: [
            'Who to call first, and why',
            'Early warning from missed weeks and falling attendance',
            'A count of the members who came back',
            'Lists volunteers open from a link, with no login',
        ],
        visual: 'members',
        visualSide: 'left' as const,
    },
    {
        kicker: 'Attendance',
        title: 'Check-in that runs itself',
        desc: 'Members check in with a QR code, stewards use a kiosk at the door, and you watch the headcount as it happens.',
        bullets: [
            'A live headcount on the day',
            'Check-in only at the venue, if you want it',
            'Late arrivals noted for you',
            'A kiosk mode for stewards',
        ],
        visual: 'qr',
        visualSide: 'right' as const,
    },
    {
        kicker: 'Giving',
        title: 'Every gift, accounted for',
        desc: 'Record tithes, offerings and expenses for each service, cash and electronic, with receipts attached, and give your finance team reports they can use.',
        bullets: [
            'Giving for each service',
            'Cash and electronic kept apart',
            'Expenses with their receipts',
            'Exports for your accountant',
        ],
        visual: 'financial',
        visualSide: 'left' as const,
    },
]

const SECONDARY_FEATURES = [
    {
        icon: Layers,
        title: 'Groups and units',
        desc: 'Departments, zones and small groups in one picture, each with its leaders and members.',
    },
    {
        icon: Calendar,
        title: 'Events',
        desc: 'Your services and events, when they start, and who they’re for.',
    },
    {
        icon: BarChart3,
        title: 'Reports and insights',
        desc: 'Attendance trends, retention, and age and gender breakdowns, ready for your leadership meeting.',
    },
    {
        icon: UserCog,
        title: 'Member portal',
        desc: 'Members sign in to see their own attendance, giving and details.',
    },
    {
        icon: ShieldCheck,
        title: 'Roles and permissions',
        desc: 'Leaders see only the people they look after, and every change is recorded.',
    },
    {
        icon: Share2,
        title: 'Follow-up sharing',
        desc: 'Share a private link to a list of absent members. Volunteers can call and follow up without an account.',
    },
]

const PRICING = [
    {
        name: 'Free',
        price: 'GH₵0',
        period: '/month',
        description: 'Everything a growing church needs to get organised and start taking attendance.',
        features: [`Up to ${FREE_MEMBER_LIMIT} members`, 'QR check-in and kiosk mode', 'Attendance tracking', 'Basic financial records', 'Member portal and absent-list sharing'],
        cta: 'Get started free',
        highlight: false,
    },
    {
        name: 'Pro',
        price: `GH₵${PRO_PRICE_GHS}`,
        period: '/month',
        description: 'For churches set on keeping everyone: the full care tools, and room to grow.',
        features: [
            'Early warning and a care list of who to call first',
            'A count of members who came back',
            'Automated follow-ups',
            'Unlimited members and units',
            'Member map and geofenced check-in',
            'Advanced reports, CSV export and a full audit trail',
            'Priority support',
        ],
        cta: 'Start with Pro',
        highlight: true,
    },
]

const FAQS = [
    {
        q: 'How does Floc actually keep people from slipping away?',
        a: 'Floc watches attendance for you. It catches members whose attendance is starting to slide, a couple of missed weeks or weekly turning into monthly, well before they’re gone. It then builds a care queue of who to reach first, ranked by who you’re most likely to win back, and as they return, “Members recovered” shows your follow-up is working. Good intentions become a habit.',
    },
    {
        q: 'How quickly can we get started?',
        a: "Import your members from a spreadsheet, set up your first service, and you can take attendance the same day. There's no onboarding programme to sit through.",
    },
    {
        q: "Is my congregation's data secure?",
        a: 'Your data travels over encrypted connections and is stored encrypted by our database provider. Each church sees only its own records, and leaders see only the units they lead. We never sell or share it, and you can export your members at any time. The privacy policy has the details.',
    },
    {
        q: 'Can I bring my existing data?',
        a: 'Yes. Upload your member list as a CSV or Excel file and Floc matches the columns, shows you a preview, and creates any units it names. Members already on file are updated rather than duplicated.',
    },
    {
        q: 'How does pricing work?',
        a: `Start free, with up to ${FREE_MEMBER_LIMIT} members. When you need more, such as unlimited members, the care engine and advanced reports, upgrade to Pro for GH₵${PRO_PRICE_GHS} a month per church. No setup fees, and you can cancel at any time.`,
    },
    {
        q: 'Do members need an account?',
        a: 'No. Members check in by scanning a QR code, with no account needed. Those who want to see their own attendance and giving can sign in to the member portal. Only the people you invite can manage the church.',
    },
    {
        q: 'What size church is Floc for?',
        a: `From church plants to congregations in the thousands. The free plan covers up to ${FREE_MEMBER_LIMIT} members; Pro has no limit.`,
    },
]

export default function HomePage() {
    const { user, isLoaded } = useUser()
    const navigate = useNavigate()
    const [activeFaq, setActiveFaq] = useState<number | null>(null)

    const toggleFaq = (index: number) => setActiveFaq(activeFaq === index ? null : index)

    useEffect(() => {
        if (isLoaded && user) {
            navigate('/dashboard', { replace: true })
        }
    }, [user, isLoaded, navigate])

    if (!isLoaded) {
        return (
            <div className="flex items-center justify-center min-h-screen" style={{ background: CREAM }}>
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-2 border-black/10 border-t-primary rounded-full animate-spin" />
                    <p className="text-neutral-500 text-sm">Loading…</p>
                </div>
            </div>
        )
    }

    return (
        <div
            className="min-h-screen font-sans antialiased"
            style={{ background: CREAM, color: INK }}
        >
            {/* Navigation */}
            <header className="sticky top-0 z-30 border-b border-black/[0.06] bg-[#FAF7F1]/80 backdrop-blur-md">
                <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-16">
                    <a href="#top" className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
                            <Church className="h-4 w-4" />
                        </div>
                        <span className="text-lg font-semibold tracking-tight font-serif">Floc</span>
                    </a>
                    <nav className="hidden md:flex items-center gap-8 text-sm">
                        <a href="#features" className="text-neutral-600 hover:text-black transition-colors">Features</a>
                        <a href="#pricing" className="text-neutral-600 hover:text-black transition-colors">Pricing</a>
                        <a href="#faq" className="text-neutral-600 hover:text-black transition-colors">FAQ</a>
                    </nav>
                    <div className="flex items-center gap-2">
                        <SignInButton mode="modal">
                            <Button size="sm" variant="ghost" className="hover:bg-black/5">Sign in</Button>
                        </SignInButton>
                        <SignInButton mode="modal">
                            <Button size="sm">Get started</Button>
                        </SignInButton>
                    </div>
                </div>
            </header>

            {/* Hero */}
            <section id="top" className="relative overflow-hidden">
                <div
                    className="absolute inset-0 -z-10"
                    style={{
                        background:
                            'radial-gradient(60% 50% at 50% 0%, color-mix(in oklch, var(--primary) 10%, transparent), transparent 70%)',
                    }}
                    aria-hidden
                />
                <div className="max-w-6xl mx-auto px-6 pt-20 pb-24 lg:pt-28">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
                        <div>
                            <p className="text-sm font-medium text-primary mb-4">
                                Church management with care at its heart
                            </p>
                            <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-medium tracking-tight leading-[1.08]">
                                Make sure no one slips away.
                            </h1>
                            <p className="mt-6 text-lg text-neutral-600 leading-relaxed max-w-xl">
                                Floc takes care of the Sunday admin: check-in, attendance and giving. Then it
                                tells you who has started drifting away, so your team can reach them while a
                                phone call still makes a difference.
                            </p>
                            <div className="mt-8 flex flex-col sm:flex-row items-start gap-3">
                                <SignInButton mode="modal">
                                    <Button size="lg" className="px-8 h-12 text-base">
                                        Get started free
                                        <ArrowRight className="ml-2 h-4 w-4" />
                                    </Button>
                                </SignInButton>
                                <a href="#demo">
                                    <Button size="lg" variant="outline" className="px-8 h-12 text-base bg-white border-black/10 text-neutral-800 hover:bg-black/[0.03] hover:text-black">
                                        See how it works
                                    </Button>
                                </a>
                            </div>
                            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-neutral-500">
                                <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-primary" /> Free for up to 200 members</span>
                                <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-primary" /> No card needed</span>
                                <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-primary" /> Set up the same day</span>
                            </div>
                        </div>

                        <SundayTimelineCard />
                    </div>
                </div>
            </section>

            {/* Demo video: loads only when played, so the page stays light on mobile data */}
            <section id="demo" className="px-6 pb-24 scroll-mt-20">
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-8">
                        <h2 className="font-serif text-3xl md:text-4xl font-medium tracking-tight">See how Floc works</h2>
                        <p className="mt-3 text-neutral-600 text-lg">A week with Floc, from Sunday check-in to the phone call that brings someone back. Just over a minute, no sound.</p>
                    </div>
                    <div className="overflow-hidden rounded-2xl ring-1 ring-black/10 shadow-[0_40px_100px_-40px_rgba(28,25,23,0.4)] bg-white">
                        <video
                            className="block w-full aspect-video"
                            src="/floc-demo.mp4"
                            poster="/floc-demo-poster.jpg"
                            controls
                            playsInline
                            muted
                            preload="none"
                            aria-label="Floc demo: Sunday check-in, the dashboard, the care queue, sharing the absent list and giving"
                        />
                    </div>
                </div>
            </section>

            {/* Proof band */}
            <section className="px-6 py-12 border-t border-black/[0.06]">
                <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-10 sm:gap-8 text-center">
                    {PROOF.map(({ icon: Icon, title, desc }) => (
                        <div key={title} className="flex flex-col items-center">
                            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                                <Icon className="h-5 w-5" />
                            </div>
                            <h3 className="font-serif text-lg font-medium tracking-tight">{title}</h3>
                            <p className="mt-1.5 text-sm text-neutral-600 leading-relaxed max-w-xs">{desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Scripture anchor — the name's origin */}
            <section className="px-6 py-24 border-t border-black/[0.06]" style={{ background: CREAM_ALT }}>
                <div className="max-w-3xl mx-auto text-center">
                    <p className="text-xs font-semibold tracking-[0.15em] text-primary uppercase mb-6">
                        Why we&apos;re called Floc
                    </p>
                    <blockquote className="font-serif text-3xl md:text-4xl font-medium tracking-tight leading-snug text-balance">
                        &ldquo;Be sure you know the condition of your flocks, give careful attention to your
                        herds.&rdquo;
                    </blockquote>
                    <p className="mt-5 text-sm font-semibold tracking-[0.15em] text-neutral-500 uppercase">
                        Proverbs 27:23
                    </p>
                    <p className="mt-8 text-neutral-600 text-lg leading-relaxed max-w-xl mx-auto">
                        Floc takes its name from that charge. We built it so knowing the condition of your
                        flock takes no effort, and caring for them gets the time instead.
                    </p>
                </div>
            </section>

            {/* How it works */}
            <section id="features" className="pt-16 pb-4 px-6 border-t border-black/[0.06]">
                <div className="max-w-2xl mx-auto text-center">
                    <p className="text-xs font-semibold tracking-[0.15em] text-primary uppercase mb-3">
                        How it works
                    </p>
                    <h2 className="font-serif text-3xl md:text-5xl font-medium tracking-tight leading-tight">
                        See everyone. Miss no one.
                    </h2>
                    <p className="mt-5 text-neutral-600 text-lg leading-relaxed">
                        Floc brings check-in, attendance and giving together, then turns quiet changes in
                        who comes into a short list of who to call, before a gap becomes a goodbye.
                    </p>
                </div>
                <div className="max-w-5xl mx-auto mt-16 relative grid grid-cols-1 md:grid-cols-3 gap-10">
                    <div className="hidden md:block absolute top-6 left-[16.67%] right-[16.67%] h-px bg-black/10" aria-hidden />
                    {HOW_IT_WORKS.map((step, i) => (
                        <div key={step.title} className="relative text-center">
                            <div className="relative z-10 mx-auto h-12 w-12 rounded-full bg-white border border-black/10 flex items-center justify-center font-serif text-lg">
                                0{i + 1}
                            </div>
                            <h3 className="mt-5 font-semibold tracking-tight">{step.title}</h3>
                            <p className="mt-2 text-sm text-neutral-600 leading-relaxed">{step.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Feature rows */}
            <section className="py-16 px-6">
                <div className="max-w-6xl mx-auto space-y-24">
                    {FEATURE_ROWS.map((row) => (
                        <div
                            key={row.kicker}
                            className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center"
                        >
                            <div className={row.visualSide === 'right' ? 'lg:order-2' : ''}>
                                <FeatureVisual kind={row.visual} />
                            </div>
                            <div className={row.visualSide === 'right' ? 'lg:order-1' : ''}>
                                <p className="text-xs font-semibold tracking-[0.15em] text-primary uppercase mb-3">
                                    {row.kicker}
                                </p>
                                <h3 className="font-serif text-2xl md:text-3xl font-medium tracking-tight">
                                    {row.title}
                                </h3>
                                <p className="mt-4 text-neutral-600 leading-relaxed">{row.desc}</p>
                                <ul className="mt-6 space-y-3">
                                    {row.bullets.map((b) => (
                                        <li key={b} className="flex items-start gap-2.5 text-sm">
                                            <span className="mt-0.5 h-4 w-4 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                                <Check className="h-2.5 w-2.5" />
                                            </span>
                                            <span>{b}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Secondary features grid */}
            <section className="py-24 px-6" style={{ background: CREAM_ALT }}>
                <div className="max-w-6xl mx-auto">
                    <div className="max-w-2xl mx-auto text-center mb-14">
                        <h2 className="font-serif text-3xl md:text-4xl font-medium tracking-tight">
                            Everything else your church runs on
                        </h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {SECONDARY_FEATURES.map(({ icon: Icon, title, desc }) => (
                            <div
                                key={title}
                                className="rounded-2xl border border-black/[0.06] bg-white p-6 transition-all hover:border-primary/30 hover:shadow-sm"
                            >
                                <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4">
                                    <Icon className="h-4 w-4" />
                                </div>
                                <h3 className="font-semibold tracking-tight mb-2">{title}</h3>
                                <p className="text-sm text-neutral-600 leading-relaxed">{desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Pricing */}
            <section id="pricing" className="py-24 px-6">
                <div className="max-w-5xl mx-auto">
                    <div className="max-w-2xl mx-auto text-center mb-14">
                        <h2 className="font-serif text-3xl md:text-4xl font-medium tracking-tight">
                            Simple, honest pricing
                        </h2>
                        <p className="mt-4 text-neutral-600 text-lg leading-relaxed">
                            Start free, for as long as you like. Upgrade to Pro when you're ready for more.
                            No setup fees, and you can cancel at any time.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mx-auto items-stretch">
                        {PRICING.map((plan) => (
                            <div
                                key={plan.name}
                                className={`relative flex flex-col rounded-3xl border p-8 bg-white ${
                                    plan.highlight
                                        ? 'border-primary/50 shadow-xl shadow-primary/5'
                                        : 'border-black/[0.08]'
                                }`}
                            >
                                {plan.highlight && (
                                    <span className="absolute -top-3 right-8 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                                        <Crown className="h-3.5 w-3.5" /> Recommended
                                    </span>
                                )}
                                <p className="text-xs font-semibold tracking-[0.15em] text-neutral-400 uppercase">{plan.name}</p>
                                <div className="flex items-baseline gap-1 mt-3">
                                    <span className="font-serif text-5xl font-medium tracking-tight">{plan.price}</span>
                                    <span className="text-sm text-neutral-500">{plan.period}</span>
                                </div>
                                <p className="mt-3 text-sm text-neutral-600">{plan.description}</p>
                                <ul className="mt-6 space-y-3 text-sm flex-1">
                                    {plan.features.map((f) => (
                                        <li key={f} className="flex items-start gap-2.5">
                                            <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                                            <span>{f}</span>
                                        </li>
                                    ))}
                                </ul>
                                <SignInButton mode="modal">
                                    <Button
                                        size="lg"
                                        className={`w-full mt-8 h-12 ${!plan.highlight ? 'bg-white text-black border border-black/15 hover:bg-black/[0.03] hover:text-black' : ''}`}
                                        variant={plan.highlight ? 'default' : 'outline'}
                                    >
                                        {plan.cta}
                                    </Button>
                                </SignInButton>
                            </div>
                        ))}
                    </div>
                    <p className="mt-8 text-center text-sm text-neutral-500">
                        Prices are in Ghana cedis (GHS), billed monthly.
                    </p>
                </div>
            </section>

            {/* FAQ */}
            <section id="faq" className="py-24 px-6">
                <div className="max-w-3xl mx-auto">
                    <div className="text-center mb-12">
                        <h2 className="font-serif text-3xl md:text-4xl font-medium tracking-tight">
                            Questions, answered
                        </h2>
                        <p className="mt-4 text-neutral-600 text-lg">
                            The things churches ask us first.
                        </p>
                    </div>
                    <div className="space-y-3">
                        {FAQS.map((faq, i) => (
                            <div key={i} className="rounded-xl border border-black/[0.08] bg-white overflow-hidden">
                                <button
                                    onClick={() => toggleFaq(i)}
                                    className="w-full text-left px-5 py-4 flex justify-between items-center gap-4 hover:bg-black/[0.02] transition-colors"
                                >
                                    <span className="font-medium">{faq.q}</span>
                                    <Plus
                                        className={`h-4 w-4 text-primary shrink-0 transition-transform duration-200 ${activeFaq === i ? 'rotate-45' : ''}`}
                                    />
                                </button>
                                {activeFaq === i && (
                                    <div className="px-5 pb-5 -mt-1 text-sm text-neutral-600 leading-relaxed">
                                        {faq.a}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Final CTA */}
            <section className="py-24 px-6">
                <div
                    className="max-w-5xl mx-auto rounded-3xl p-10 md:p-16 text-center relative overflow-hidden"
                    style={{ background: INK }}
                >
                    <div
                        className="absolute inset-0 -z-10"
                        style={{
                            background:
                                'radial-gradient(60% 60% at 50% 0%, color-mix(in oklch, var(--primary) 30%, transparent), transparent 70%)',
                        }}
                        aria-hidden
                    />
                    <p className="font-serif italic text-white/70 text-lg mb-5">
                        &ldquo;Of those you gave me, I have lost not one.&rdquo;
                        <span className="not-italic text-white/40 text-sm">&nbsp;John 18:9</span>
                    </p>
                    <h2 className="font-serif text-3xl md:text-4xl font-medium tracking-tight text-white">
                        No one else has to slip away.
                    </h2>
                    <p className="mt-4 text-white/60 text-lg leading-relaxed max-w-xl mx-auto">
                        Set up your first service today and let Floc watch over everyone in your care.
                        Start free, and move to Pro whenever you're ready.
                    </p>
                    <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                        <SignInButton mode="modal">
                            <Button size="lg" className="px-8 h-12 bg-white text-black hover:bg-white/90">
                                Get started free
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </SignInButton>
                        <a href="#pricing">
                            <Button size="lg" variant="outline" className="px-8 h-12 border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white">
                                See pricing
                            </Button>
                        </a>
                    </div>
                    <div className="mt-6 flex items-center justify-center gap-2 text-sm text-white/50">
                        No card needed for the free plan · Cancel at any time
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-black/[0.06] py-14 px-6">
                <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-3 gap-10">
                    <div className="col-span-2 md:col-span-1 pr-4">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="h-6 w-6 rounded-md bg-primary text-primary-foreground flex items-center justify-center">
                                <Church className="h-3.5 w-3.5" />
                            </div>
                            <span className="font-serif font-medium">Floc</span>
                        </div>
                        <p className="text-sm text-neutral-500 leading-relaxed">
                            Church management that keeps everyone in view, so no one quietly slips away.
                        </p>
                    </div>
                    <div>
                        <h4 className="text-sm font-semibold mb-4">Product</h4>
                        <div className="space-y-2.5 text-sm">
                            <a href="#features" className="block text-neutral-500 hover:text-black transition-colors">Features</a>
                            <a href="#pricing" className="block text-neutral-500 hover:text-black transition-colors">Pricing</a>
                            <a href="#faq" className="block text-neutral-500 hover:text-black transition-colors">FAQ</a>
                        </div>
                    </div>
                    <div>
                        <h4 className="text-sm font-semibold mb-4">Legal</h4>
                        <div className="space-y-2.5 text-sm">
                            <Link to="/privacy" className="block text-neutral-500 hover:text-black transition-colors">Privacy policy</Link>
                            <Link to="/terms" className="block text-neutral-500 hover:text-black transition-colors">Terms of service</Link>
                        </div>
                    </div>
                </div>
                <div className="max-w-6xl mx-auto mt-12 pt-8 border-t border-black/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-neutral-500">
                    <p>© {new Date().getFullYear()} Floc</p>
                    <p>Made for churches</p>
                </div>
            </footer>
        </div>
    )
}

/** The hero visual: a running log of one Sunday, end to end. */
function SundayTimelineCard() {
    return (
        <div className="rounded-3xl border border-black/[0.08] bg-white shadow-2xl shadow-black/5 p-6 max-w-md mx-auto lg:mx-0 w-full">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <div className="text-sm font-semibold">A Sunday with Floc</div>
                    <div className="text-xs text-neutral-500">From the doors opening to Monday&apos;s follow-up</div>
                </div>
                <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600">
                    Example
                </span>
            </div>
            <div className="relative">
                <div className="absolute left-3 top-1 bottom-1 w-px bg-black/[0.08]" aria-hidden />
                <div className="space-y-6">
                    {SUNDAY_TIMELINE.map((step) => (
                        <div key={step.title} className="relative flex gap-4">
                            <div className="relative z-10 h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                <step.icon className="h-3 w-3" />
                            </div>
                            <div className="flex-1 -mt-0.5">
                                <div className="text-[11px] text-neutral-400 font-medium mb-0.5">{step.time}</div>
                                <div className="text-sm font-semibold leading-snug">{step.title}</div>
                                <div className="text-xs text-neutral-500 mt-0.5">{step.detail}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

/** Alternating section illustrations used in the feature rows. */
function FeatureVisual({ kind }: { kind: string }) {
    if (kind === 'members') {
        const rows = [
            { name: 'Kwame Owusu', sub: "Ushering · Men's Fellowship", color: 'bg-rose-500', status: '3 weeks away', variant: 'absent' },
            { name: 'Esi Danso', sub: 'Back after 4 weeks away', color: 'bg-teal-500', status: 'Recovered', variant: 'recovered' },
            { name: 'Ama Mensah', sub: 'Youth Ministry · Choir', color: 'bg-blue-500', status: 'Active', variant: 'active' },
            { name: 'Sarah Adjei', sub: 'First-time visitor', color: 'bg-emerald-500', status: 'Visitor', variant: 'visitor' },
        ]
        const statusStyles: Record<string, string> = {
            active: 'bg-emerald-50 text-emerald-700',
            visitor: 'bg-amber-50 text-amber-700',
            absent: 'bg-red-50 text-red-600',
            recovered: 'bg-teal-50 text-teal-700',
        }
        return (
            <div className="rounded-2xl border border-black/[0.08] bg-white p-3 shadow-sm">
                <div className="divide-y divide-black/[0.06]">
                    {rows.map((r) => (
                        <div key={r.name} className="flex items-center justify-between px-2 py-3">
                            <div className="flex items-center gap-3">
                                <div className={`h-9 w-9 rounded-full ${r.color} text-white flex items-center justify-center text-xs font-semibold`}>
                                    {r.name.split(' ').map((p) => p.charAt(0)).join('')}
                                </div>
                                <div>
                                    <div className="text-sm font-medium">{r.name}</div>
                                    <div className="text-xs text-neutral-500">{r.sub}</div>
                                </div>
                            </div>
                            <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${statusStyles[r.variant]}`}>
                                {r.status}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    if (kind === 'qr') {
        return (
            <div className="rounded-2xl border border-black/[0.08] bg-white p-8 shadow-sm flex flex-col items-center">
                <div className="grid grid-cols-7 gap-1 p-3 rounded-xl bg-black/[0.02]">
                    {Array.from({ length: 49 }).map((_, i) => {
                        const onEdge =
                            (i < 7 || i >= 42 || i % 7 === 0 || i % 7 === 6) &&
                            ((Math.floor(i / 7) < 2 || Math.floor(i / 7) > 4) &&
                                (i % 7 < 2 || i % 7 > 4))
                        const dark = onEdge || (i * 7) % 5 === 0
                        return (
                            <div
                                key={i}
                                className={`h-2.5 w-2.5 rounded-[1px] ${dark ? 'bg-black' : 'bg-transparent'}`}
                            />
                        )
                    })}
                </div>
                <div className="mt-5 flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                    <Check className="h-3.5 w-3.5" /> Checked in
                </div>
                <p className="mt-2 text-xs text-neutral-500">Sunday service · 9:02 AM · On time</p>
            </div>
        )
    }

    const financials = [
        { label: 'Tithes', value: '₵12,450', pct: 100 },
        { label: 'Offerings', value: '₵8,320', pct: 67 },
        { label: 'Donations', value: '₵4,800', pct: 38 },
        { label: 'Special Offerings', value: '₵2,150', pct: 17 },
    ]
    return (
        <div className="rounded-2xl border border-black/[0.08] bg-white p-6 shadow-sm space-y-5">
            {financials.map((f) => (
                <div key={f.label}>
                    <div className="flex items-center justify-between text-sm mb-1.5">
                        <span className="text-neutral-600">{f.label}</span>
                        <span className="font-semibold">{f.value}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-black/[0.05] overflow-hidden">
                        <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${f.pct}%` }}
                        />
                    </div>
                </div>
            ))}
        </div>
    )
}
